// index.ts
import './db'; // Khởi tạo cơ sở dữ liệu khi bot khởi động
import {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    REST,
    Routes,
    EmbedBuilder,
    ActivityType,
    Guild,
    Message,
    VoiceState,
    ChatInputCommandInteraction,
    Interaction,
    TextChannel, // Vẫn cần ở đây cho Prefix Commands hoặc các logic khác có thể cần
    // === Các loại Interaction cụ thể cho type checking ===
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    AutocompleteInteraction,
    // ==================================================
    // PermissionsBitField vẫn có thể cần cho kiểm tra quyền ở index nếu cần
    PermissionsBitField,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import 'libsodium-wrappers';
import {
    joinVoiceChannel,
    getVoiceConnection,
    entersState,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import readline from 'readline';
import express, { Request, Response, NextFunction } from 'express'; // <-- THÊM EXPRESS
import crypto from 'crypto'; // <-- THÊM CRYPTO để xác thực webhook (nếu cần manual)
import PayOS from '@payos/node'; // <-- THÊM PAYOS SDK

// ===== Import các hàm cần thiết từ priceandpay.ts =====
import { getOrderByOrderCode, updateOrderStatus } from './commands/system/priceandpay'; // <-- IMPORT DB FUNCTIONS (Đã xóa createPriceEmbed)
import pool from './db'; // <-- IMPORT DATABASE POOL
// ======================================================

dotenv.config();

// Lấy các biến môi trường
const TOKEN = process.env.TOKEN!;
export const PREFIX = process.env.PREFIX!;
const PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY; // <-- Lấy Checksum Key
const WEBHOOK_URL = process.env.PAYOS_WEBHOOK_URL; // <-- URL Webhook (nếu cần dùng trong code)
const PORT = process.env.PORT || 3001; // <-- Cổng cho Express server

const ffmpegPath = 'ffmpeg';

// === Khởi tạo PayOS instance (cần checksum key) ===
let payOS: PayOS | null = null;
if (process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && PAYOS_CHECKSUM_KEY) {
    try {
        payOS = new PayOS(process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);
        console.log('✅ PayOS SDK Initialized in index.ts.');
    } catch (error) {
        console.error('❌ Error initializing PayOS SDK in index.ts:', error);
        payOS = null;
    }
} else {
    console.warn('⚠️ PayOS environment variables missing in index.ts. Webhook verification might fail.');
}
// =================================================

// === Cập nhật interface ICommand ===
export interface ICommand { // Export để các file command có thể import nếu cần type checking
    data?: {
        name: string;
        description?: string;
        toJSON?: () => any;
    };
    name?: string;
    aliases?: string[];
    execute: (
        interactionOrMessage: Interaction | Message,
        args?: string[]
    ) => Promise<void>;
    // Các handler hiện có
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    handleModalSubmit?: (interaction: ModalSubmitInteraction) => Promise<void>;
    // Các handler mới cho Button và Select Menu
    handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
    handleStringSelectMenuInteraction?: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

// Mở rộng interface của Client để thêm thuộc tính commands
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, ICommand>;
    }
}

// Khởi tạo client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection<string, ICommand>();

// Đăng ký các event
registerReadyEvent(client);
registerGuildCreateEvent(client);
registerGuildDeleteEvent(client);
registerMessageCreateEvent(client, PREFIX);
registerInteractionCreateEvent(client);

// Hàm đăng ký slash commands toàn cầu
async function registerCommands(): Promise<void> {
    const commands = client.commands.map((cmd) => {
        if (cmd.data && typeof cmd.data.toJSON === 'function') {
            return cmd.data.toJSON();
        } else if (cmd.data) {
            return cmd.data;
        }
        return {};
    });
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        if (!client.user) throw new Error('Client user is not available yet.');
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
        });
        console.log('Global commands registered successfully.');
    } catch (error) {
        console.error('Error registering global commands:', error);
    }
}

// Cập nhật presence
async function updateBotPresence(): Promise<void> {
    try {
        const guilds = await client.guilds.fetch();
        let totalMembers = 0;
        for (const guild of guilds.values()) {
            const fetchedGuild = await guild.fetch();
            totalMembers += fetchedGuild.memberCount;
        }
        client.user?.setActivity(`with ${totalMembers} members`, {
            type: ActivityType.Playing,
        });
    } catch (error) {
        console.error('Error updating bot presence:', error);
    }
}

// Tự động ngắt kết nối voice

// Load các lệnh
const commandsPath = path.join(__dirname, 'commands');
const commandCategories = ['musics', 'system', 'games']; // tuỳ theo project
for (const category of commandCategories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.existsSync(categoryPath)) continue;
    const commandFiles = fs
        .readdirSync(categoryPath)
        .filter((file) => file.endsWith('.js') || file.endsWith('.ts'));
    for (const file of commandFiles) {
        const filePath = path.join(categoryPath, file);
        try {
            const commandModule = require(filePath);
            const command: ICommand = commandModule.default || commandModule;
            // Lấy tên lệnh từ data.name (ưu tiên) hoặc thuộc tính name
            const commandName = command.data?.name ?? command.name;

            if (!commandName) {
                console.error(`Command missing name in ${filePath}`);
                continue;
            }
            if (typeof command.execute !== 'function') {
                console.error(`Command ${commandName} in ${filePath} is missing the execute function.`);
                continue;
            }
            console.log(`Loading command: ${commandName}`);
            client.commands.set(commandName, command);
        } catch (error) {
            console.error(`Error loading command from ${filePath}:`, error);
        }
    }
}


// --- Các listener và logic khác giữ nguyên ---
client.on('voiceStateUpdate', (oldState, newState) => handleVoiceStateUpdate(oldState, newState, client));

import { startExpressServer } from './expressServer';
import { registerReadyEvent } from './events/ready';
import { registerGuildCreateEvent } from './events/guildCreate';
import { registerGuildDeleteEvent } from './events/guildDelete';
import { registerMessageCreateEvent } from './events/messageCreate';
import { registerInteractionCreateEvent } from './events/interactionCreate';
import { handleVoiceStateUpdate } from './handlers/voiceStateHandler';

// Khởi động Express server cho webhook
const { server } = startExpressServer(client, pool, PAYOS_CHECKSUM_KEY!, PORT);


process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
    // Cân nhắc việc tắt server một cách an toàn ở đây nếu lỗi nghiêm trọng
});

process.on('unhandledRejection', (reason, promise) => { // Sửa để log cả reason và promise
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Cân nhắc việc tắt server một cách an toàn ở đây nếu lỗi nghiêm trọng
});

// Đăng nhập Discord Client (Nên đặt sau khi Express đã sẵn sàng hoặc chạy song song)
client.login(TOKEN).then(() => {
    console.log('Discord client logged in successfully.');
}).catch(err => {
    console.error("Failed to login to Discord:", err);
    process.exit(1); // Thoát nếu không login được Discord
});

// Bỏ readline interface nếu không cần thiết trong môi trường production
// const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
// });
// rl.on('line', (input: string) => {
//     if (input.trim().toLowerCase() === 'exit') {
//         console.log('Exiting program...');
//         client.destroy();
//         // Cần đóng cả server Express nếu đang chạy
//         // server.close(() => { process.exit(0); }); // Cần lưu instance server trả về từ app.listen
//         process.exit(0);
//     }
const rl = readline.createInterface({ // <-- Uncomment readline
    input: process.stdin,
    output: process.stdout,
});
rl.on('line', (input: string) => {
    if (input.trim().toLowerCase() === 'exit') {
        console.log('Exiting program...');
        client.destroy();
        // Cần đóng cả server Express nếu đang chạy
        server.close(() => { // <-- Close Express server
            console.log('Express server closed.');
            process.exit(0);
        });
        // Set a timeout in case the server doesn't close quickly
        setTimeout(() => {
            console.error('Forcefully shutting down after timeout.');
            process.exit(1);
        }, 5000); // 5 seconds timeout
    }
});
console.log('Bot process started. Type "exit" and press Enter to stop.'); // <-- Uncomment log

// Chỉ log khi server Express đã chạy và Discord client đã login
// console.log('Application started. Waiting for Discord client login and Express server...'); // Comment out or remove this line as the previous log is more informative now
