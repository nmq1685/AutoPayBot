// commands/system/priceandpay.ts

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Interaction, // Vẫn cần cho type checking interaction chung
    // BaseInteraction, // Không cần thiết nếu không dùng instanceof trực tiếp
    Message,
    TextChannel,
    ColorResolvable,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    Guild,
    User,
    GuildTextBasedChannel,
    PermissionsBitField,
    Collection,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ButtonStyle,
    ComponentType, // Import ComponentType để kiểm tra kiểu nút
    InteractionReplyOptions,
    InteractionUpdateOptions,
    MessageReplyOptions,
    MessageMentionOptions, // Import MessageMentionOptions
    JSONEncodable, // Import nếu cần dùng toJSON() tường minh
    APIActionRowComponent, // Import kiểu dữ liệu API
    APIMessageActionRowComponent, // Import kiểu dữ liệu API
    ActionRowData, // Import kiểu dữ liệu ActionRowData
    MessageActionRowComponentBuilder, // Import kiểu builder component
    MessageActionRowComponentData, // Import kiểu dữ liệu component
    InteractionResponse, // Import InteractionResponse để dùng cho reply/followUp
    MessagePayload, // Import MessagePayload
    BitFieldResolvable, // Import BitFieldResolvable
    MessageFlagsString, // Import MessageFlagsString
    MessageFlags, // Import MessageFlags for explicit flag checking
    MessageFlagsBitField, // <--- IMPORT MessageFlagsBitField
    AttachmentPayload, // Import AttachmentPayload
    BufferResolvable, // Import BufferResolvable
    // Stream, // Stream is not directly exported/needed here - REMOVED
    APIAttachment, // Import APIAttachment
    Attachment, // Import Attachment
    AttachmentBuilder, // Import AttachmentBuilder
    BaseGuildTextChannel, // Import BaseGuildTextChannel for channel type check
    Awaitable, // Import Awaitable
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalSubmitInteraction
} from 'discord.js';
import pool from '../../db'; // Adjust path if necessary
import { ICommand } from '../../index'; // Import ICommand từ index.ts
import dotenv from 'dotenv';
import PayOS from '@payos/node'; // <--- IMPORT PAYOS
import { ResultSetHeader } from 'mysql2'; // <--- IMPORT ResultSetHeader TỪ mysql2
import { getFooter } from '../../utils/embedFooter';


dotenv.config(); // Load .env variables


// 🚀 Khởi động PayOS nè, quẩy lên nào ~
const payOSClientId = process.env.PAYOS_CLIENT_ID;
const payOSApiKey = process.env.PAYOS_API_KEY;
const payOSChecksumKey = process.env.PAYOS_CHECKSUM_KEY;

let payOS: PayOS | null = null;
if (payOSClientId && payOSApiKey && payOSChecksumKey) {
    try {
        payOS = new PayOS(payOSClientId, payOSApiKey, payOSChecksumKey);
        console.log('✅ PayOS SDK Initialized.');
    } catch (error) {
        console.error('❌ Error initializing PayOS SDK:', error);
        payOS = null; // Đảm bảo payOS là null nếu khởi tạo lỗi
    }
} else {
    console.warn('⚠️ PayOS environment variables (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY) are missing. Payment functionality will be disabled.');
}
// --- Kết thúc khởi tạo PayOS ---

// Map to store cooldown timestamps: key = "userId:channelId:productId", value = timestamp (ms)
const paymentCooldowns = new Map<string, number>();
const COOLDOWN_DURATION = 15 * 1000; // 15 seconds in milliseconds

// Prefix for potential prefix commands
const PREFIX = process.env.PREFIX || '!';


// 📚 Mấy cái giao diện DB nè, nhìn cho dễ hiểu chứ hem có gì căng ~
interface Category {
    id: number;
    name: string;
    guildId: string;
}

interface Product {
    id: number;
    name: string;
    description: string | null; // Cho phép null
    price: number;
    categoryId: number;
    guildId: string;
    stock: number | null; // Thêm field stock, null = không giới hạn
}

interface LogConfig {
    guildId: string;
    logChannelId: string;
}

interface ChannelCategoryConfig {
    guildId: string;
    openCategoryId: string;
    closedCategoryId: string;
}

// === INTERFACE CHO BẢNG ORDERS ===
interface Order {
    id: number;
    guildId: string;
    userId: string;
    channelId: string;
    productId: number;
    orderCode: number; // Dùng number cho BIGINT từ DB
    amount: number;
    payosPaymentLinkId: string | null;
    discordMessageId: string | null; // <-- THÊM TRƯỜNG NÀY
    paymentMessageId: string | null; // <-- THÊM TRƯỜNG MỚI
    status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
    payosCreatedAt: Date | null;
    payosPaidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
// === KẾT THÚC INTERFACE ORDERS ===


// 🛠️ Mấy tool lặt vặt, xài cho tiện thui chứ hem có gì ghê gớm ~

function formatFooterTimestamp(): string {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(now);
    return `${today} at ${time}`;
}

function createEmbed(
    context: { user?: User | null, guild?: Guild | null }, // Sửa lại context chỉ cần user và guild
    title: string,
    description: string,
    color: ColorResolvable
): EmbedBuilder {
    const { user, guild } = context; // Lấy user và guild từ context được truyền vào

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)

    if (user) {
        embed.setAuthor({
            name: `👤 ${user.username}`,
            iconURL: user.displayAvatarURL() || undefined,
        });
    }

    if (guild) {
        embed.setThumbnail(guild.iconURL() || null) // Set Thumbnail ở đây nếu có guild
            .setFooter(getFooter(guild?.name || '', guild?.iconURL() || null));
    } else {
        // Fallback nếu không có guild (ví dụ: DM, mặc dù lệnh này chặn DM)
        embed.setFooter({ text: `Requested • ${formatFooterTimestamp()}` });
    }

    return embed;
}


// 💾 Mấy hàm làm việc với DB, lưu trữ dữ liệu cho khỏi bay màu ~

// getCategories, getProducts, getLogChannel, getChannelCategories (GIỮ NGUYÊN)
export async function getCategories(guildId: string): Promise<Category[]> {
    if (!guildId) {
        console.error("[DB:getCategories] Error: Called with null or undefined guildId");
        return [];
    }
    try {
        // Sử dụng any[] và kiểm tra kiểu dữ liệu trả về
        const [rows] = await pool.query<any[]>(
            'SELECT id, name, guildId FROM categories WHERE guildId = ? ORDER BY name ASC',
            [guildId]
        );
        // Đảm bảo chuyển đổi an toàn
        return rows.map(row => ({
            id: Number(row.id),
            name: String(row.name || ''), // Xử lý trường hợp name có thể là null/undefined từ DB
            guildId: String(row.guildId)
        })) as Category[];
    } catch (error) {
        console.error(`[DB:getCategories] Error fetching categories for guild ${guildId}:`, error);
        return [];
    }
}

export async function getProducts(
    guildId: string,
    categoryId: number
): Promise<Product[]> {
    if (!guildId || typeof categoryId !== 'number' || isNaN(categoryId)) {
        console.error("[DB:getProducts] Error: Called with invalid parameters:", { guildId, categoryId });
        return [];
    }
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT id, name, description, price, categoryId, guildId FROM products WHERE guildId = ? AND categoryId = ? ORDER BY name ASC',
            [guildId, categoryId]
        );
        return rows.map(row => ({
            id: Number(row.id),
            name: String(row.name || ''),
            description: row.description ? String(row.description) : null,
            price: Number(row.price), // Quan trọng: Chuyển đổi price từ string/decimal sang number
            categoryId: Number(row.categoryId),
            guildId: String(row.guildId)
        })) as Product[];
    } catch (error) {
        console.error(
            `[DB:getProducts] Error fetching products for guild ${guildId}, category ${categoryId}:`,
            error
        );
        return [];
    }
}

export async function getLogChannel(guildId: string): Promise<string | null> {
    if (!guildId) {
        console.error("[DB:getLogChannel] Error: Called with null or undefined guildId");
        return null;
    }
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT logChannelId FROM log_configs WHERE guildId = ? LIMIT 1',
            [guildId]
        );
        // Kiểm tra chặt chẽ hơn kiểu dữ liệu trả về
        if (rows.length > 0 && rows[0] && typeof rows[0].logChannelId === 'string' && rows[0].logChannelId.length > 0) {
            return rows[0].logChannelId;
        }
        return null;
    } catch (error) {
        console.error(`[DB:getLogChannel] Error fetching log channel for guild ${guildId}:`, error);
        return null;
    }
}

export async function getChannelCategories(
    guildId: string
): Promise<ChannelCategoryConfig | null> {
    if (!guildId) {
        console.error("[DB:getChannelCategories] Error: Called with null or undefined guildId");
        return null;
    }
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT openCategoryId, closedCategoryId FROM channel_categories WHERE guildId = ? LIMIT 1',
            [guildId]
        );
        // Kiểm tra chặt chẽ hơn
        if (rows.length > 0 && rows[0] &&
            typeof rows[0].openCategoryId === 'string' && rows[0].openCategoryId.length > 0 &&
            typeof rows[0].closedCategoryId === 'string' && rows[0].closedCategoryId.length > 0) {
            return {
                guildId: guildId,
                openCategoryId: rows[0].openCategoryId,
                closedCategoryId: rows[0].closedCategoryId
            };
        }
        return null;
    } catch (error) {
        console.error(
            `[DB:getChannelCategories] Error fetching channel categories for guild ${guildId}:`,
            error
        );
        return null;
    }
}


// 🛒 Quản lý đơn hàng nè, ai mua gì thì lưu hết vô đây cho nhớ ~
// Cập nhật hàm createOrder để nhận discordMessageId
export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'payosCreatedAt' | 'payosPaidAt' | 'status'> & { status?: Order['status'] }): Promise<number | null> {
    const {
        guildId,
        userId,
        channelId,
        productId,
        orderCode,
        amount,
        payosPaymentLinkId,
        discordMessageId, // <-- Lấy discordMessageId
        paymentMessageId, // <-- Lấy paymentMessageId
        status = 'PENDING'
    } = orderData;

    // Thêm kiểm tra chặt chẽ hơn
    if (!guildId || !userId || !channelId || !productId || !orderCode || amount == null || amount < 0) {
        console.error('[DB:createOrder] Error: Missing or invalid required fields.', orderData);
        return null;
    }

    try {
        // Sử dụng ResultSetHeader đã import và thêm discordMessageId vào câu query
        const [result] = await pool.query<ResultSetHeader>(
            'INSERT INTO orders (guildId, userId, channelId, productId, orderCode, amount, payosPaymentLinkId, discordMessageId, paymentMessageId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [guildId, userId, channelId, productId, orderCode, amount, payosPaymentLinkId ?? null, discordMessageId ?? null, paymentMessageId ?? null, status] // <-- Thêm paymentMessageId
        );
        if (result.insertId) {
            console.log(`[DB:createOrder] Created order with code ${orderCode}, inserted ID: ${result.insertId}, messageId: ${discordMessageId}`);
            return result.insertId;
        } else {
            console.error(`[DB:createOrder] Failed to insert order with code ${orderCode}, messageId: ${discordMessageId}, insertId not returned.`);
            return null;
        }
    } catch (error) {
        console.error(`[DB:createOrder] Error creating order with code ${orderCode}, messageId: ${discordMessageId}:`, error);
        // Check for duplicate entry error (ER_DUP_ENTRY)
        if ((error as any).code === 'ER_DUP_ENTRY') {
            console.error(`[DB:createOrder] Duplicate order code detected: ${orderCode}, messageId: ${discordMessageId}`);
            // Handle duplicate order code appropriately (e.g., generate a new one, notify user)
        }
        return null;
    }
}

// Cập nhật hàm getOrderByOrderCode để lấy discordMessageId
export async function getOrderByOrderCode(orderCode: number): Promise<Order | null> {
    if (!orderCode) {
        console.error("[DB:getOrderByOrderCode] Error: Called with null or undefined orderCode");
        return null;
    }
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT * FROM orders WHERE orderCode = ? LIMIT 1', // Lấy tất cả các cột bao gồm discordMessageId
            [orderCode]
        );
        if (rows.length > 0) {
            const row = rows[0];
            return {
                ...row,
                id: Number(row.id),
                productId: Number(row.productId),
                orderCode: Number(row.orderCode),
                amount: Number(row.amount),
                discordMessageId: row.discordMessageId ? String(row.discordMessageId) : null, // <-- Lấy discordMessageId
                paymentMessageId: row.paymentMessageId ? String(row.paymentMessageId) : null, // <-- Lấy paymentMessageId
                payosCreatedAt: row.payosCreatedAt ? new Date(row.payosCreatedAt) : null,
                payosPaidAt: row.payosPaidAt ? new Date(row.payosPaidAt) : null,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
                status: row.status as Order['status'] // Ép kiểu status
            } as Order;
        }
        return null;
    } catch (error) {
        console.error(`[DB:getOrderByOrderCode] Error fetching order with code ${orderCode}:`, error);
        return null;
    }
}

export async function updateOrderStatus(orderCode: number, status: Order['status'], payosPaymentLinkId?: string | null, paymentTime?: Date | null): Promise<boolean> {
    if (!orderCode || !status) {
        console.error('[DB:updateOrderStatus] Error: Missing orderCode or status.', { orderCode, status });
        return false;
    }
    try {
        let query = 'UPDATE orders SET status = ?, updatedAt = CURRENT_TIMESTAMP';
        const params: (string | number | Date | null)[] = [status];

        if (status === 'PAID' && paymentTime instanceof Date) { // Kiểm tra paymentTime là Date
            query += ', payosPaidAt = ?';
            // Chuyển Date sang định dạng MySQL DATETIME/TIMESTAMP (YYYY-MM-DD HH:MM:SS)
            const mysqlDateTime = paymentTime.toISOString().slice(0, 19).replace('T', ' ');
            params.push(mysqlDateTime);
        }
        if (payosPaymentLinkId !== undefined) {
            query += ', payosPaymentLinkId = ?';
            params.push(payosPaymentLinkId);
        }

        query += ' WHERE orderCode = ?';
        params.push(orderCode);

        const [result] = await pool.query<ResultSetHeader>(query, params); // Sử dụng ResultSetHeader

        if (result.affectedRows > 0) {
            console.log(`[DB:updateOrderStatus] Updated status for order ${orderCode} to ${status}.`);
            return true;
        } else {
            console.warn(`[DB:updateOrderStatus] No order found with code ${orderCode} to update status.`);
            return false;
        }
    } catch (error) {
        console.error(`[DB:updateOrderStatus] Error updating status for order ${orderCode}:`, error);
        return false;
    }
}

// Cập nhật hàm getPendingOrderByUserChannelProduct để lấy discordMessageId
export async function getPendingOrderByUserChannelProduct(userId: string, channelId: string, productId: number): Promise<Order | null> {
    if (!userId || !channelId || !productId) {
        console.error("[DB:getPendingOrderByUserChannelProduct] Error: Missing parameters.", { userId, channelId, productId });
        return null;
    }
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT * FROM orders WHERE userId = ? AND channelId = ? AND productId = ? AND status = \'PENDING\' ORDER BY createdAt DESC LIMIT 1', // Lấy tất cả cột
            [userId, channelId, productId]
        );
        if (rows.length > 0) {
            const row = rows[0];
            return {
                ...row,
                id: Number(row.id),
                productId: Number(row.productId),
                orderCode: Number(row.orderCode),
                amount: Number(row.amount),
                discordMessageId: row.discordMessageId ? String(row.discordMessageId) : null, // <-- Lấy discordMessageId
                paymentMessageId: row.paymentMessageId ? String(row.paymentMessageId) : null, // <-- Lấy paymentMessageId
                payosCreatedAt: row.payosCreatedAt ? new Date(row.payosCreatedAt) : null,
                payosPaidAt: row.payosPaidAt ? new Date(row.payosPaidAt) : null,
                createdAt: new Date(row.createdAt),
                updatedAt: new Date(row.updatedAt),
                status: row.status as Order['status']
            } as Order;
        }
        return null;
    } catch (error) {
        console.error(`[DB:getPendingOrderByUserChannelProduct] Error fetching pending order for user ${userId}, channel ${channelId}, product ${productId}:`, error);
        return null;
    }
}

// Cập nhật hàm updateOrderLinkDetails để nhận và cập nhật discordMessageId
export async function updateOrderLinkDetails(orderId: number, newOrderCode: number, newPayosPaymentLinkId: string, newDiscordMessageId: string, newPaymentMessageId: string | null): Promise<boolean> {
    if (!orderId || !newOrderCode || !newPayosPaymentLinkId || !newDiscordMessageId) {
        console.error('[DB:updateOrderLinkDetails] Error: Missing parameters.', { orderId, newOrderCode, newPayosPaymentLinkId, newDiscordMessageId });
        return false;
    }
    try {
        const [result] = await pool.query<ResultSetHeader>(
            'UPDATE orders SET orderCode = ?, payosPaymentLinkId = ?, discordMessageId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', // <-- Thêm discordMessageId
            [newOrderCode, newPayosPaymentLinkId, newDiscordMessageId, orderId] // <-- Thêm discordMessageId
        );
        if (result.affectedRows > 0) {
            console.log(`[DB:updateOrderLinkDetails] Updated link details for order ID ${orderId} to orderCode ${newOrderCode}, messageId ${newDiscordMessageId}.`);
            return true;
        } else {
            console.warn(`[DB:updateOrderLinkDetails] No order found with ID ${orderId} to update link details.`);
            return false;
        }
    } catch (error) {
        console.error(`[DB:updateOrderLinkDetails] Error updating link details for order ID ${orderId}:`, error);
        return false;
    }
}
// 🛒 Hết phần đơn hàng rùi nha, nghỉ tay xíu đi ~


// 🧠 Não bộ xử lý chính, mấy cái này mới xịn xò nè ~

// createPayChannel, generateHTMLLog (GIỮ NGUYÊN)
export async function createPayChannel(guild: Guild, user: User): Promise<TextChannel | null> {
    const config = await getChannelCategories(guild.id);
    if (!config || !config.openCategoryId) {
        console.error(
            `[createPayChannel] Payment channel category (open) not set up for server ${guild.id}`
        );
        return null;
    }

    const openCategory = guild.channels.cache.get(config.openCategoryId);
    if (!openCategory || openCategory.type !== ChannelType.GuildCategory) {
        console.error(`[createPayChannel] Open category channel ${config.openCategoryId} not found or not a category.`);
        return null;
    }

    let botMember;
    try {
        botMember = guild.members.me ?? await guild.members.fetchMe();
        if (!botMember) throw new Error("Bot is not a member of this guild.");
    } catch (fetchError) {
        console.error(`[createPayChannel] Failed to fetch bot member in guild ${guild.id}:`, fetchError);
        return null;
    }

    const botPermissionsInCat = openCategory.permissionsFor(botMember);
    if (!botPermissionsInCat || !botPermissionsInCat.has(PermissionFlagsBits.ManageChannels) || !botPermissionsInCat.has(PermissionFlagsBits.ViewChannel)) {
        console.error(`[createPayChannel] Bot lacks ManageChannels/ViewChannel permission in the open category ${config.openCategoryId}. Permissions: ${botPermissionsInCat?.toArray().join(', ')}`);
        return null;
    }

    let channelNumber = 1;
    const prefix = 'pay-';
    let allPayChannels: Collection<string, TextChannel>; // Renamed to reflect it includes all relevant channels
    try {
        const allChannels = await guild.channels.fetch();
        // Filter channels from BOTH open and closed categories
        allPayChannels = allChannels.filter(
            (ch): ch is TextChannel =>
                ch instanceof TextChannel &&
                (ch.parentId === config.openCategoryId || ch.parentId === config.closedCategoryId) && // Check both categories
                ch.name.startsWith(prefix)
        );
    } catch (fetchChannelsError) {
        console.error(`[createPayChannel] Failed to fetch channels for guild ${guild.id}:`, fetchChannelsError);
        return null;
    }

    // --- Find the lowest available channel number ---
    const existingChannelNumbers = allPayChannels.map(ch => {
        const numPart = ch.name.substring(prefix.length);
        return parseInt(numPart, 10);
    }).filter(num => !isNaN(num)).sort((a, b) => a - b); // Get existing numbers, filter out NaN, and sort

    let nextChannelNumber = 1;
    for (const existingNum of existingChannelNumbers) {
        if (nextChannelNumber < existingNum) {
            break; // Found the first gap
        }
        if (nextChannelNumber === existingNum) {
            nextChannelNumber++; // Increment to check the next number
        }
    }
    // If no gaps were found, nextChannelNumber will be maxNum + 1
    // --- End finding lowest available number ---

    const channelName = `${prefix}${nextChannelNumber.toString().padStart(4, '0')}`;
    const topic = `Payment channel for ${user.tag} (${user.id}). Created: ${new Date().toISOString()}. CreatorID:${user.id}`;

    try {
        const newChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: config.openCategoryId,
            topic: topic.substring(0, 1024),
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.EmbedLinks,
                    ],
                },
                {
                    id: botMember.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.ManageChannels, // Bot cần quyền này để di chuyển kênh khi đóng
                    ]
                },
            ],
            reason: `Create payment channel for user ${user.tag} (${user.id})`
        });
        console.log(`[createPayChannel] Created payment channel ${newChannel.name} (${newChannel.id}) for user ${user.tag}`);
        return newChannel;
    } catch (error) {
        console.error(`[createPayChannel] Error creating channel ${channelName} for user ${user.tag}:`, error);
        return null;
    }
}

export async function generateHTMLLog(channel: GuildTextBasedChannel): Promise<string> {
    let allMessages: Message[] = [];
    let lastId: string | undefined;

    // Thêm kiểm tra messages.fetch là function trước khi gọi
    if (!channel.messages || typeof channel.messages.fetch !== 'function') {
        console.warn(`[generateHTMLLog] Channel ${channel.name} (${channel.id}) does not support fetching messages or fetch is not available.`);
        return `<!DOCTYPE html><html><head><title>Log Error</title></head><body><h1>Error</h1><p>Could not fetch messages for channel ${channel.name}.</p></body></html>`;
    }

    try {
        while (true) {
            const options: { limit: number; before?: string } = { limit: 100 };
            if (lastId) {
                options.before = lastId;
            }

            const fetchedMessages: Collection<string, Message> = await channel.messages.fetch(options);

            if (fetchedMessages.size === 0) {
                break;
            }

            allMessages.push(...fetchedMessages.values());
            lastId = fetchedMessages.lastKey();

            if (fetchedMessages.size < 100) {
                break;
            }
        }
    } catch (fetchError) {
        console.error(`[generateHTMLLog] Error fetching messages for log in channel ${channel.id}:`, fetchError);
        // Trả về HTML báo lỗi nếu không fetch được
        return `<!DOCTYPE html><html><head><title>Log Error</title></head><body><h1>Error Fetching Messages</h1><p>An error occurred while fetching messages for channel ${channel.name}. Some messages might be missing.</p><pre>${String(fetchError)}</pre></body></html>`;

    }

    // Sắp xếp tin nhắn theo thời gian tạo
    const sortedMessages = allMessages.sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    // --- HTML Generation (Giữ nguyên) ---
    let htmlContent = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Log Kênh ${channel.name}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #36393f; color: #dcddde; padding: 15px; margin: 0; }
        h1 { color: #ffffff; border-bottom: 1px solid #4f545c; padding-bottom: 10px; }
        .message-group { margin-bottom: 15px; padding-left: 60px; position: relative; }
        /* Group messages from the same author */
        .message-group[data-author-id]:not(:first-child) { margin-top: -10px; padding-top: 0; }
        /* Hide avatar and header for subsequent messages in a group */
        .message-group[data-author-id] + .message-group[data-author-id] .author-avatar { display: none; }
        .message-group[data-author-id] + .message-group[data-author-id] .message-header { display: none; }
  
        .author-avatar { position: absolute; left: 5px; top: 5px; width: 40px; height: 40px; border-radius: 50%; }
        .message-header { display: flex; align-items: center; margin-bottom: 3px; height: 22px; }
        .author-name { font-weight: bold; color: #ffffff; margin-right: 8px; }
        .timestamp { color: #72767d; font-size: 0.8em; }
        .message-content { line-height: 1.4; word-wrap: break-word; white-space: pre-wrap; padding-top: 2px; }
        .message-content img, .message-content video { max-width: 100%; height: auto; margin-top: 5px; border-radius: 3px;}
        .embed { border-left: 4px solid #4f545c; background-color: #2f3136; padding: 8px 12px; margin-top: 5px; border-radius: 3px;}
        .embed-title { font-weight: bold; color: #00b0f4; margin-bottom: 4px; }
        .embed-description { font-size: 0.95em; white-space: pre-wrap; }
        .attachment a { color: #00b0f4; text-decoration: none; }
        .attachment a:hover { text-decoration: underline; }
        .attachments { margin-top: 5px; }
        .attachment { margin-bottom: 3px; }
    </style>
  </head>
  <body>
    <h1>Log Kênh #${channel.name}</h1>
    <p style="color: #72767d; font-size: 0.9em;">Tổng số tin nhắn: ${sortedMessages.length}. Log được tạo vào: ${new Date().toLocaleString('vi-VN')}</p>
  `;

    let prevAuthorId: string | null = null; // Track the previous author ID

    sortedMessages.forEach((msg) => {
        // Helper to escape HTML special characters
        const escapeHtml = (unsafe: string): string => {
            if (!unsafe) return '';
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        // Escape content and replace newlines with <br>
        const safeContent = escapeHtml(msg.content).replace(/\n/g, '<br>');

        // Add data attribute for styling message groups
        const authorAttr = msg.author.id === prevAuthorId ? `data-author-id="${msg.author.id}"` : `data-author-id="${msg.author.id}"`;
        htmlContent += `<div class="message-group" ${authorAttr}>`;

        // Display avatar and header only for the first message in a group
        if (msg.author.id !== prevAuthorId) {
            const avatarUrl = msg.author.displayAvatarURL({ size: 64 }) || `https://cdn.discordapp.com/embed/avatars/${Number(msg.author.discriminator || '0') % 5}.png`; // Fallback avatar
            htmlContent += `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(msg.author.username)}'s avatar" class="author-avatar">`;
            htmlContent += `<div class="message-header">`;
            htmlContent += `<span class="author-name">${escapeHtml(msg.author.username)}</span>`;
            htmlContent += `<span class="timestamp">${new Date(msg.createdTimestamp).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>`;
            htmlContent += `</div>`;
        }

        // Message content
        htmlContent += `<div class="message-content">${safeContent || '<i>(Nội dung trống)</i>'}</div>`; // Handle empty content

        // Display embeds
        if (msg.embeds.length > 0) {
            msg.embeds.forEach(embed => {
                const embedTitle = embed.title ? escapeHtml(embed.title) : '';
                const embedDesc = embed.description ? escapeHtml(embed.description).replace(/\n/g, '<br>') : '';
                const embedColor = embed.hexColor || '#4f545c'; // Default color if not set

                htmlContent += `<div class="embed" style="border-left-color: ${escapeHtml(embedColor)};">`;
                if (embedTitle) htmlContent += `<div class="embed-title">${embedTitle}</div>`;
                if (embedDesc) htmlContent += `<div class="embed-description">${embedDesc}</div>`;
                // Add fields, footer, etc. if needed
                htmlContent += `</div>`;
            });
        }

        // Display attachments
        if (msg.attachments.size > 0) {
            htmlContent += `<div class="attachments">`;
            msg.attachments.forEach(att => {
                const safeUrl = escapeHtml(att.url);
                const safeName = escapeHtml(att.name || 'Attached File');
                const fileSizeKB = (att.size / 1024).toFixed(2);

                // Display images and videos inline, link others
                if (att.contentType?.startsWith('image/')) {
                    htmlContent += `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer"><img src="${safeUrl}" alt="${safeName}" style="max-width: 300px; max-height: 250px; margin-top: 5px; border-radius: 3px; display: block;"></a>`;
                } else if (att.contentType?.startsWith('video/')) {
                    htmlContent += `<video controls src="${safeUrl}" style="max-width: 300px; max-height: 250px; margin-top: 5px; border-radius: 3px; display: block;"></video>`;
                } else {
                    htmlContent += `<div class="attachment"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a> (${fileSizeKB} KB)</div>`;
                }
            });
            htmlContent += `</div>`;
        }


        htmlContent += `</div>`; // Close message-group
        prevAuthorId = msg.author.id; // Update previous author ID
    });

    htmlContent += `
  </body>
  </html>
  `;
    return htmlContent;
}


// Helper để tạo embed cho lệnh price
function createPriceEmbed(
    context: { user?: User | null, guild?: Guild | null },
    title: string,
    description: string
): EmbedBuilder {
    return createEmbed(
        context,
        `🏷️ ${title}`,
        description,
        0x0099ff
    );
}


// 🎮 Định nghĩa lệnh slash command, bấm phát ăn ngay ~
const command: ICommand = {
    data: new SlashCommandBuilder()
        .setName('price')
        .setDescription('🏷️ Quản lý và hiển thị bảng giá sản phẩm.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('send')
                .setDescription('📢 Gửi bảng giá (với menu chọn danh mục) vào kênh chỉ định.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('📌 Kênh văn bản để gửi bảng giá vào.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
    ,

    // ⚡ Hàm xử lý khi bấm lệnh, chạy vèo vèo luôn ~
    async execute(interactionOrMessage: Interaction | Message, args?: string[]) {
        let interaction: ChatInputCommandInteraction | null = null;
        let message: Message | null = null;
        let guild: Guild | null = null;
        let user: User | null = null;
        let memberPermissions: Readonly<PermissionsBitField> | null = null;
        let sourceChannel: GuildTextBasedChannel | null = null; // Variable to hold the source channel

        // Xác định context ban đầu
        if (interactionOrMessage instanceof ChatInputCommandInteraction) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            user = interaction.user;
            if (interaction.channel?.isTextBased() && !interaction.channel.isDMBased()) { // Ensure it's a guild text channel
                sourceChannel = interaction.channel;
            }
            if (interaction.inGuild() && interaction.member?.permissions instanceof PermissionsBitField) {
                memberPermissions = interaction.member.permissions;
            }
        } else if (interactionOrMessage instanceof Message) {
            message = interactionOrMessage;
            guild = message.guild;
            user = message.author;
            if (message.channel?.isTextBased() && !message.channel.isDMBased()) { // Ensure it's a guild text channel
                sourceChannel = message.channel;
            }
            memberPermissions = message.member?.permissions ?? null;
        }


        if (!guild || !user) {
            const errorEmbedSimple = new EmbedBuilder().setColor(0xff0000).setDescription('❌ Lệnh này chỉ có thể sử dụng trong một máy chủ.');
            // Kiểm tra isRepliable() trước khi gọi reply
            if (interaction?.isRepliable()) {
                await interaction.reply({ embeds: [errorEmbedSimple], ephemeral: true }).catch(console.error);
            } else if (message) {
                await message.reply({ embeds: [errorEmbedSimple] }).catch(console.error);
            }
            return;
        }

        // Tạo context object đúng
        const currentContext = { user, guild };

        if (!memberPermissions || !memberPermissions.has(PermissionFlagsBits.Administrator)) {
            const errorEmbed = createEmbed(currentContext, '🚫 Truy cập Bị Từ Chối', 'Bạn không có quyền sử dụng lệnh này.', 0xff0000);
            if (interaction?.isRepliable()) {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.error);
            } else if (message) {
                await message.reply({ embeds: [errorEmbed] }).catch(console.error);
            }
            return;
        }


        // === Sửa hàm replyOrFollowUp ===
        const replyOrFollowUp = async (options: string | InteractionReplyOptions | MessageReplyOptions | MessagePayload, isEphemeral = true): Promise<InteractionResponse | Message | void> => {
            const fallbackChannel = sourceChannel; // Use the channel captured at the start
            try {
                if (interaction && interaction.isRepliable()) {
                    let interactionOptions: InteractionReplyOptions = { ephemeral: isEphemeral };

                    if (typeof options === 'string') {
                        interactionOptions.content = options;
                    } else if (options instanceof MessagePayload) {
                        // Extract compatible properties from MessagePayload for Interaction
                        interactionOptions.content = options.options?.content ?? undefined;
                        interactionOptions.embeds = options.options?.embeds ?? undefined;
                        interactionOptions.components = options.options?.components ?? undefined;
                        interactionOptions.allowedMentions = options.options?.allowedMentions ?? undefined;
                        // tts is on the top level of MessageCreateOptions/Payload
                        interactionOptions.tts = ('tts' in options.options && options.options.tts !== undefined) ? options.options.tts : undefined;
                        interactionOptions.files = options.files?.map(f => ({
                            attachment: f.data,
                            name: f.name,
                        } as AttachmentPayload)) || undefined;
                        // Ignore flags, messageReference, stickers etc. from payload for interaction
                    } else {
                        // Copy from a plain options object (InteractionReplyOptions or MessageReplyOptions-like)
                        interactionOptions.content = options.content ?? undefined;
                        interactionOptions.embeds = options.embeds ?? undefined;
                        interactionOptions.components = options.components ?? undefined;
                        interactionOptions.allowedMentions = options.allowedMentions ?? undefined;
                        // Check if tts exists directly on the options object
                        interactionOptions.tts = ('tts' in options && options.tts !== undefined) ? options.tts : undefined;
                        interactionOptions.files = options.files as Exclude<InteractionReplyOptions['files'], undefined> ?? undefined; // Type assertion

                        // Avoid copying flags, messageReference, stickers etc. directly unless sure it's InteractionReplyOptions
                        if ('flags' in options && options.flags) {
                            // Only include flags if they are valid for Interaction (e.g., Ephemeral)
                            // This primarily controls whether the reply is ephemeral or not.
                            // If isEphemeral is true, we force the ephemeral flag.
                            if (isEphemeral) {
                                interactionOptions.flags = MessageFlags.Ephemeral;
                            } else {
                                // If not ephemeral, don't set the flag unless explicitly passed and NOT ephemeral
                                const flagsField = new MessageFlagsBitField(options.flags as BitFieldResolvable<MessageFlagsString, number>);
                                if (!flagsField.has(MessageFlags.Ephemeral)) {
                                    interactionOptions.flags = flagsField.bitfield;
                                }
                            }
                        }
                    }

                    // Remove undefined properties before sending
                    Object.keys(interactionOptions).forEach(keyStr => {
                        const key = keyStr as keyof InteractionReplyOptions;
                        if (interactionOptions[key] === undefined) {
                            delete interactionOptions[key];
                        }
                    });

                    if (interaction.deferred || interaction.replied) {
                        return await interaction.followUp(interactionOptions);
                    } else {
                        return await interaction.reply(interactionOptions);
                    }

                } else if (message) {
                    if (typeof options === 'string') {
                        return await message.reply({ content: options });
                    } else if (options instanceof MessagePayload) {
                        // Remove ephemeral flag from payload before sending as message reply
                        if (options.options?.flags) {
                            try {
                                const flagsField = new MessageFlagsBitField(options.options.flags as BitFieldResolvable<MessageFlagsString, number>);
                                if (flagsField.has(MessageFlags.Ephemeral)) {
                                    flagsField.remove(MessageFlags.Ephemeral);
                                    options.options.flags = flagsField.bitfield === 0 ? undefined : flagsField.bitfield; // Set to undefined if no flags left
                                }
                            } catch (flagError) {
                                console.warn("Could not parse flags from MessagePayload for message reply:", flagError);
                                // Remove potentially problematic flags
                                if (options.options) delete options.options.flags;
                            }
                        }
                        return await message.reply(options);
                    } else {
                        // Convert InteractionReplyOptions/similar to MessageReplyOptions
                        let messageOptions: MessageReplyOptions = {
                            content: options.content ?? undefined,
                            embeds: options.embeds ?? undefined,
                            components: options.components ?? undefined,
                            allowedMentions: options.allowedMentions ?? undefined,
                            files: options.files as Exclude<MessageReplyOptions['files'], undefined> ?? undefined, // Type assertion
                            tts: ('tts' in options && options.tts !== undefined) ? options.tts : undefined,
                            stickers: ('stickers' in options) ? options.stickers : undefined,
                            failIfNotExists: ('failIfNotExists' in options) ? options.failIfNotExists : undefined,
                            flags: undefined // Initialize flags as undefined
                        };

                        // Handle flags: Remove Ephemeral if present from InteractionReplyOptions-like object
                        if ('flags' in options && options.flags) {
                            try {
                                // Create a bitfield from the input flags
                                // Cast to help TS understand the input can be diverse but resolve to MessageFlags bits
                                const inputFlags = new MessageFlagsBitField(options.flags as BitFieldResolvable<MessageFlagsString, number>);

                                // Remove the Ephemeral flag specifically for messages
                                if (inputFlags.has(MessageFlags.Ephemeral)) {
                                    inputFlags.remove(MessageFlags.Ephemeral);
                                }

                                // Assign the final bitfield value (number)
                                // Only assign if there are still flags left after removing ephemeral
                                if (inputFlags.bitfield !== 0) {
                                    messageOptions.flags = inputFlags.bitfield;
                                }

                            } catch (flagError) {
                                console.warn("Could not parse flags for message reply:", flagError);
                                // Leave flags undefined if parsing fails
                            }
                        }

                        // Remove undefined properties AFTER constructing the object
                        Object.keys(messageOptions).forEach(keyStr => {
                            const key = keyStr as keyof MessageReplyOptions;
                            if (messageOptions[key] === undefined) {
                                delete messageOptions[key];
                            }
                        });

                        return await message.reply(messageOptions);
                    }
                }
            } catch (e) {
                console.error("Failed to send reply/followUp:", e);
                try {
                    const errorEmbed = createEmbed(currentContext, "Lỗi Phản Hồi", "Không thể gửi phản hồi cho tương tác/tin nhắn.", 0xff0000);
                    // Use the captured fallbackChannel
                    if (fallbackChannel && fallbackChannel.isTextBased()) {
                        await fallbackChannel.send({ embeds: [errorEmbed] }).catch(() => { });
                    } else {
                        console.error("Fallback channel is invalid or missing.");
                    }
                } catch (fallbackError) {
                    console.error("Failed to send fallback error message:", fallbackError);
                }
            }
        };
        // === Kết thúc sửa replyOrFollowUp ===


        try {
            let targetChannel: TextChannel | null = null;
            let subCommandCalled = '';

            if (interaction) {
                if (!interaction.isChatInputCommand()) return;
                subCommandCalled = interaction.options.getSubcommand(true);

                if (subCommandCalled === 'send') {
                    const channelOption = interaction.options.getChannel('channel', true);
                    if (channelOption instanceof TextChannel) {
                        targetChannel = channelOption;
                    } else {
                        await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi', 'Kênh được chọn không phải là kênh văn bản hợp lệ.', 0xff0000)] }, true);
                        return;
                    }
                    if (!interaction.deferred && !interaction.replied) {
                        await interaction.deferReply({ ephemeral: true });
                    }
                } else {
                    await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi', `Lệnh con '${subCommandCalled}' không được hỗ trợ.`, 0xff0000)] }, true);
                    return;
                }
            } else if (message && args) {
                subCommandCalled = args[0]?.toLowerCase();
                if (subCommandCalled !== 'send' || args.length < 2) {
                    await message.reply({ embeds: [createEmbed(currentContext, '❓ Cách dùng', `\`${PREFIX}price send <#kênh hoặc ID>\``, 0xffa500)] });
                    return;
                }
                const channelMentionOrId = args[1];
                const mentionedChannel = message.mentions.channels.first();
                if (mentionedChannel instanceof TextChannel) {
                    targetChannel = mentionedChannel;
                } else {
                    try {
                        const fetchedChannel = await guild.channels.fetch(channelMentionOrId.replace(/<#|>/g, ''));
                        if (fetchedChannel instanceof TextChannel) {
                            targetChannel = fetchedChannel;
                        } else { throw new Error('Not a text channel'); }
                    } catch {
                        await message.reply({ embeds: [createEmbed(currentContext, '❌ Lỗi', `Không tìm thấy kênh văn bản: \`${channelMentionOrId}\``, 0xff0000)] });
                        return;
                    }
                }
            } else {
                console.error("[PriceCmd Execute] Invalid execution context.");
                return;
            }

            if (subCommandCalled === 'send' && targetChannel) {
                let botMemberPerms;
                try {
                    const botMember = guild.members.me ?? await guild.members.fetchMe();
                    if (!botMember) throw new Error("Bot member not found in guild.");
                    botMemberPerms = targetChannel.permissionsFor(botMember);
                } catch (fetchError) {
                    console.error(`[PriceCmd] Failed fetch bot member or perms in ${targetChannel.id}:`, fetchError);
                    await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi Quyền Bot', `Không thể kiểm tra quyền của bot trong ${targetChannel}.`, 0xff0000)] }, true);
                    return;
                }

                if (!botMemberPerms || !botMemberPerms.has(PermissionFlagsBits.SendMessages) || !botMemberPerms.has(PermissionFlagsBits.EmbedLinks)) {
                    const errorDesc = `Bot thiếu quyền trong kênh ${targetChannel}:\n- Gửi tin nhắn: ${botMemberPerms?.has(PermissionFlagsBits.SendMessages) ? '✅' : '❌'}\n- Nhúng liên kết: ${botMemberPerms?.has(PermissionFlagsBits.EmbedLinks) ? '✅' : '❌'}`;
                    await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi Quyền Bot', errorDesc, 0xff0000)] }, true);
                    return;
                }

                const categories = await getCategories(guild.id);

                if (!categories || categories.length === 0) {
                    const noCatEmbed = createPriceEmbed(currentContext, 'Bảng Giá', '⚠️ Hiện tại chưa có danh mục sản phẩm nào được thêm vào.');
                    try {
                        await targetChannel.send({ embeds: [noCatEmbed] });
                        await replyOrFollowUp({ content: `ℹ️ Đã gửi thông báo không có danh mục vào ${targetChannel}.` }, true);
                    } catch (e) {
                        console.error(`[PriceCmd] Failed send 'no categories' msg to ${targetChannel.id}:`, e);
                        await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi Gửi Tin', `Không thể gửi thông báo vào kênh ${targetChannel}. Lỗi: ${e instanceof Error ? e.message : String(e)}`, 0xff0000)] }, true);
                    }
                    return;
                }

                const initialEmbed = createPriceEmbed({ guild: guild }, 'Bảng Giá Sản Phẩm', '✨ Chào mừng! Vui lòng chọn một danh mục bên dưới để xem các sản phẩm có sẵn.'); // Bỏ user khỏi context này

                const categorySelectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`price:category_select:${guild.id}`)
                    .setPlaceholder('⬇️ Chọn danh mục để xem sản phẩm...')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        categories.map((cat) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(cat.name.substring(0, 100))
                                .setValue(cat.id.toString())
                                .setDescription(`Xem sản phẩm trong ${cat.name.substring(0, 50)}...`)
                        )
                            .slice(0, 25) // Giới hạn 25 options
                    );

                // Kiểm tra lại số lượng options trước khi tạo ActionRow
                if (categorySelectMenu.options.length === 0) {
                    console.warn("[PriceCmd Send] No valid categories to display in select menu.");
                    const noCatEmbed = createPriceEmbed(currentContext, 'Bảng Giá', '⚠️ Hiện tại chưa có danh mục sản phẩm nào được thêm vào hoặc có lỗi khi tải danh mục.');
                    try {
                        await targetChannel.send({ embeds: [noCatEmbed] });
                        await replyOrFollowUp({ content: `ℹ️ Đã gửi thông báo không có danh mục hợp lệ vào ${targetChannel}.` }, true);
                    } catch (e) {
                        console.error(`[PriceCmd] Failed send 'no valid categories' msg to ${targetChannel.id}:`, e);
                        await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi Gửi Tin', `Không thể gửi thông báo vào kênh ${targetChannel}. Lỗi: ${e instanceof Error ? e.message : String(e)}`, 0xff0000)] }, true);
                    }
                    return;
                }


                const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categorySelectMenu);

                try {
                    await targetChannel.send({
                        embeds: [initialEmbed],
                        components: [actionRow],
                    });
                    await replyOrFollowUp({ content: `✅ Bảng giá đã được gửi thành công tới kênh ${targetChannel}!` }, true);
                } catch (sendError) {
                    console.error(`[PriceCmd] Failed send price list to ${targetChannel.id}:`, sendError);
                    const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
                    await replyOrFollowUp({ embeds: [createEmbed(currentContext, '❌ Lỗi Gửi Tin', `Không thể gửi bảng giá vào kênh ${targetChannel}.\n*Chi tiết lỗi: ${errorMsg}*`, 0xff0000)] }, true);
                }
            }

        } catch (error) {
            console.error('[PriceCmd Execute] Unexpected error:', error);
            // Sử dụng currentContext đã định nghĩa
            await replyOrFollowUp({ embeds: [createEmbed(currentContext, '💥 Lỗi Không Mong Đợi', 'Đã xảy ra lỗi nghiêm trọng khi thực thi lệnh.', 0xff0000)] }, true);
        }
    },

    // 🎯 Xử lý vụ chọn menu thả xuống, chọn cho chuẩn nha ~
    async handleStringSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ content: 'Lệnh này chỉ hoạt động trong máy chủ.', ephemeral: true }).catch(console.error);
            return;
        }

        const customId = interaction.customId;
        const guild = interaction.guild;
        const user = interaction.user;
        const message = interaction.message; // Tin nhắn chứa select menu

        const parts = customId.split(':');
        if (parts[0] !== 'price' || parts.length < 2) return;

        const action = parts[1];

        if (action === 'category_select') {
            try {
                // Defer ephemerally instead of updating the original message
                await interaction.deferReply({ ephemeral: true });

                const categoryId = parseInt(interaction.values[0], 10);
                if (isNaN(categoryId)) {
                    await interaction.editReply({ content: '❌ ID danh mục không hợp lệ.' });
                    return;
                }

                const categories = await getCategories(guild.id);
                const selectedCategory = categories.find((cat) => cat.id === categoryId);

                if (!selectedCategory) {
                    // Reply ephemerally instead of editing the original message
                    await interaction.editReply({
                        content: `⚠️ Danh mục bạn chọn không còn tồn tại hoặc đã bị xoá.`,
                        // No need to keep old embeds or components in ephemeral reply
                    });
                    return;
                }

                const products = await getProducts(guild.id, categoryId);

                let productDescription = products.length > 0
                    ? `✨ **Sản phẩm trong danh mục "${selectedCategory.name}":**\n\n`
                    : `⚠️ *Hiện tại không có sản phẩm nào trong danh mục "${selectedCategory.name}".*`;

                products.forEach((product) => {
                    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price);
                    const stockInfo = product.stock !== null ? ` (Còn ${product.stock})` : '';
                    productDescription += `💡 **${product.name}** - ${formattedPrice}${stockInfo}\n`;
                    if (product.description) {
                        productDescription += `📝 *${product.description.substring(0, 100)}${product.description.length > 100 ? '...' : ''}*\n`;
                    }
                    productDescription += `\n`;
                });

                const productEmbed = createPriceEmbed({ guild: guild }, `🛒 ${selectedCategory.name}`, productDescription.substring(0, 4096)); // Bỏ user context

                // Components for the ephemeral reply (only product select menu if products exist)
                const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

                // Don't include the original category select menu in the ephemeral reply

                if (products.length > 0) {
                    const productSelectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`price:product_select:${guild.id}`)
                        .setPlaceholder('⬇️ Chọn sản phẩm để xem chi tiết/thanh toán...')
                        .addOptions(
                            products.map((product) => {
                                const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price);
                                return new StringSelectMenuOptionBuilder()
                                    .setLabel(product.name.substring(0, 100))
                                    .setValue(product.id.toString())
                                    .setDescription(`${formattedPrice}`)
                            }).slice(0, 25) // Giới hạn 25 options
                        );
                    // Chỉ thêm nếu có options
                    if (productSelectMenu.options.length > 0) {
                        const productRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelectMenu);
                        components.push(productRow);
                    } else {
                        console.warn(`[Price Category Select] No products to display in product select menu for category ${categoryId}.`);
                    }
                }

                // Send the ephemeral reply with products and product selection menu
                await interaction.editReply({
                    embeds: [productEmbed],
                    components: components,
                });
                
                // Refresh the original message with reset dropdown
                try {
                  const refreshedCategories = await getCategories(guild.id);
                  const refreshedMenu = new StringSelectMenuBuilder()
                    .setCustomId(`price:category_select:${guild.id}`)
                    .setPlaceholder('⬇️ Chọn danh mục để xem sản phẩm...')
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                      refreshedCategories.map((cat) =>
                        new StringSelectMenuOptionBuilder()
                          .setLabel(cat.name.substring(0, 100))
                          .setValue(cat.id.toString())
                          .setDescription(`Xem sản phẩm trong ${cat.name.substring(0, 50)}...`)
                      ).slice(0, 25)
                    );
                
                  const refreshedRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(refreshedMenu);
                
                  const refreshedEmbed = createPriceEmbed({ guild: guild }, 'Bảng Giá Sản Phẩm', '✨ Chọn một danh mục bên dưới để xem các sản phẩm có sẵn.');
                
                  await interaction.message.edit({
                    embeds: [refreshedEmbed],
                    components: [refreshedRow],
                  });
                } catch (refreshError) {
                  console.error('Error refreshing dropdown menu:', refreshError);
                }

            } catch (error) {
                console.error(`[Price Handle Select Category] Error:`, error);
                // Try to edit the deferred ephemeral reply with an error message
                try {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.editReply({ content: '❌ Đã xảy ra lỗi khi hiển thị sản phẩm.' });
                    } else {
                        // If somehow not deferred/replied, try a fresh ephemeral reply
                        await interaction.reply({ content: '❌ Đã xảy ra lỗi khi hiển thị sản phẩm.', ephemeral: true });
                    }
                } catch (e) { console.error("Failed to send error for category select:", e); }
            }
        }

        else if (action === 'product_select') {
            try {
                await interaction.deferReply({ ephemeral: true });

                const selectedProductId = parseInt(interaction.values[0], 10);
                if (isNaN(selectedProductId)) {
                    await interaction.editReply({ content: '❌ ID sản phẩm không hợp lệ.' });
                    return;
                }

                let foundProduct: Product | null = null;
                const categories = await getCategories(guild.id);
                // Dùng vòng lặp for...of để có thể break sớm
                for (const cat of categories) {
                    const prods = await getProducts(guild.id, cat.id);
                    const p = prods.find(x => x.id === selectedProductId);
                    if (p) {
                        foundProduct = p;
                        break; // Thoát vòng lặp khi tìm thấy sản phẩm
                    }
                }

                if (!foundProduct) {
                    await interaction.editReply({ content: '❌ Không tìm thấy sản phẩm này hoặc nó đã bị xóa.' });
                    return;
                }

                // --- Tạo kênh thanh toán ---
                const newChannel = await createPayChannel(guild, user);
                if (!newChannel) {
                    await interaction.editReply({ content: '❌ Không thể tạo kênh thanh toán. Lỗi cấu hình hoặc quyền.' });
                    return;
                }
                // --- Kết thúc tạo kênh ---

                // --- Gửi thông tin vào kênh mới ---
                try {
                    // Tin nhắn chào mừng và ghim nó
                    const announcement = await newChannel.send(`👋 ${user}, kênh thanh toán riêng cho sản phẩm **${foundProduct.name}** đã được tạo. Vui lòng kiểm tra thông tin bên dưới.`);
                    await announcement.pin().catch(e => console.warn(`[Price] Failed to pin announcement in ${newChannel.id}: ${e}`));

                    // Embed thông tin sản phẩm và nút thanh toán/đóng
                    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(foundProduct.price);
                    const payEmbed = createEmbed({ guild: guild }, `💳 Thanh Toán - ${foundProduct.name}`, // Bỏ user context
                        `📝 **Sản phẩm:** ${foundProduct.name}\n` +
                        (foundProduct.description ? `📄 **Mô tả:** ${foundProduct.description}\n` : '') +
                        `💰 **Giá:** ${formattedPrice}\n\n` +
                        (payOS
                            ? `▶️ Nhấn nút **"Thanh Toán"** bên dưới để nhận liên kết thanh toán qua PayOS.\n`
                            : `⚠️ *Chức năng thanh toán tự động hiện không khả dụng.*\n`) +
                        `🔒 Bạn có thể đóng kênh này bằng nút **"Đóng Kênh"** nếu muốn hủy hoặc đã hoàn tất.`
                        , 0xff9900) // Màu cam
                        .setFooter(getFooter(guild.name, guild.iconURL()));

                    const buttons: ButtonBuilder[] = [];
                    if (payOS) {
                        const payButton = new ButtonBuilder()
                            .setCustomId(`price:initiate_payment:${foundProduct.id}`) // Bao gồm ID sản phẩm
                            .setLabel('Thanh Toán (PayOS)')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('💸');
                        buttons.push(payButton);
                    }
                    const closeButton = new ButtonBuilder()
                        .setCustomId('price:close_channel') // ID đơn giản cho việc đóng kênh
                        .setLabel('Đóng Kênh')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒');
                    buttons.push(closeButton);
                    const payRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

                    const payMessage = await newChannel.send({ embeds: [payEmbed], components: [payRow] });
                    await payMessage.pin().catch(e => console.warn(`[Price] Failed to pin payment embed in ${newChannel.id}: ${e}`));
                    // --- Kết thúc gửi thông tin ---

                    // Phản hồi cho interaction gốc
                    await interaction.editReply({ content: `✅ Kênh thanh toán <#${newChannel.id}> đã được tạo cho sản phẩm **${foundProduct.name}**. Vui lòng chuyển qua kênh đó.` });

                } catch (sendError) {
                    console.error(`[Price] Failed send messages to new channel ${newChannel.id}:`, sendError);
                    await interaction.editReply({ content: `✅ Kênh <#${newChannel.id}> đã được tạo, nhưng lỗi gửi chi tiết. Vui lòng kiểm tra kênh.` });
                    // Cân nhắc xóa kênh nếu gửi tin nhắn lỗi?
                    // await newChannel.delete('Failed to send initial messages').catch(console.error);
                    return;
                }


            } catch (error) {
                console.error(`[Price Handle Select Product] Error:`, error);
                // Đảm bảo luôn có phản hồi cho interaction
                if (!interaction.replied && !interaction.deferred) {
                    // Nếu chưa reply/defer, hãy reply
                    await interaction.reply({ content: '❌ Đã xảy ra lỗi khi xử lý lựa chọn sản phẩm.', ephemeral: true }).catch(console.error);
                } else {
                    // Nếu đã reply/defer, hãy edit hoặc followUp
                    await interaction.editReply({ content: '❌ Đã xảy ra lỗi khi xử lý lựa chọn sản phẩm.' }).catch(async () => {
                        // Nếu edit lỗi (ví dụ: interaction hết hạn), thử followUp
                        await interaction.followUp({ content: '❌ Đã xảy ra lỗi khi xử lý lựa chọn sản phẩm.', ephemeral: true }).catch(console.error);
                    });
                }
            }
        }
    },

    // 🔘 Xử lý mấy cái nút bấm, bấm phát là dính liền ~
    async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
        // Đảm bảo interaction xảy ra trong kênh Text của Guild
        if (!interaction.guild || !interaction.channel || !(interaction.channel instanceof TextChannel)) {
            await interaction.reply({ content: 'Lỗi: Tương tác này chỉ hoạt động trong kênh văn bản của máy chủ.', ephemeral: true }).catch(() => { });
            return;
        }

        const customId = interaction.customId;
        const guild = interaction.guild;
        const user = interaction.user;
        const textCh = interaction.channel as TextChannel; // Ép kiểu an toàn vì đã kiểm tra ở trên
        const message = interaction.message; // Tin nhắn chứa nút <-- QUAN TRỌNG: Lấy message ID từ đây

        // Phân tích customId
        const parts = customId.split(':');
        if (parts[0] === 'price' && parts[1] === 'cancel_payment' && parts.length >= 3) {
            const orderCode = parseInt(parts[2], 10);
            if (isNaN(orderCode)) {
                await interaction.reply({ content: '❌ Không xác định được đơn hàng để hủy.', ephemeral: true });
                return;
            }

            const order = await getOrderByOrderCode(orderCode);
            if (!order) {
                await interaction.reply({ content: '❌ Không tìm thấy đơn hàng để hủy.', ephemeral: true });
                return;
            }

            if (order.status === 'CANCELLED') {
                await interaction.reply({ content: '⚠️ Đơn hàng này đã được hủy trước đó.', ephemeral: true });
                return;
            }

            const success = await updateOrderStatus(orderCode, 'CANCELLED');
            if (success) {
                // Update the original payment embed to reflect cancellation
                try {
                    const originalMessage = interaction.message;
                    const embeds = originalMessage.embeds.map(e => EmbedBuilder.from(e));
                    if (embeds.length > 0) {
                        embeds[0]
                            .setTitle('❌ Đơn hàng đã bị hủy')
                            .setColor(0xff0000)
                            .setDescription('Đơn hàng này đã được hủy và không còn hiệu lực.')
                            .setImage(null);
                    }

                    const newComponents = originalMessage.components.map(row => {
                        const actionRow = ActionRowBuilder.from(row);
                        actionRow.components.forEach(component => {
                            if ('setDisabled' in component) {
                                component.setDisabled(true);
                            }
                        });
                        return actionRow;
                    });

                    await originalMessage.edit({
                        embeds: embeds,
                        components: newComponents.map(row => row.toJSON()) as ActionRowData<MessageActionRowComponentBuilder | MessageActionRowComponentData>[]
                    });
                } catch (editError) {
                    console.error('Failed to update payment embed after cancel:', editError);
                }

                await interaction.reply({ content: '✅ Đơn hàng đã được hủy thành công.', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Không thể hủy đơn hàng. Vui lòng thử lại.', ephemeral: true });
            }
            return;
        }

        if (parts[0] !== 'price' || parts.length < 2) return; // Không phải button của lệnh này

        const action = parts[1]; // Hành động chính (initiate_payment, close_channel, etc.)
        const discordMessageId = message.id; // <-- Lấy ID của tin nhắn chứa nút

        // Helper function để gửi lỗi ephemeral
        const sendButtonError = async (content: string) => {
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: `❌ ${content}`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `❌ ${content}`, ephemeral: true });
                }
            } catch (e) { console.error("Failed sendButtonError:", e); }
        };

        // --- Xử lý action 'initiate_payment' ---
        if (action === 'initiate_payment') {
            if (!payOS) {
                await sendButtonError("Chức năng thanh toán PayOS chưa được kích hoạt.");
                return;
            }

            // <<< START DM CHECK >>>
            try {
                // Attempt to send a temporary DM to check if DMs are open
                const dmChannel = await user.createDM();
                const tempMsg = await dmChannel.send({ content: "Kiểm tra cài đặt tin nhắn..." });
                await tempMsg.delete(); // Delete the temporary message immediately
                console.log(`[DM Check] Successfully sent and deleted test DM to ${user.tag} (${user.id}).`);
            } catch (error: any) {
                // Check for the specific error code indicating closed DMs
                // 50007: Cannot send messages to this user
                // Use error.code for v14, potentially error.httpStatus for older versions if needed
                if (error.code === 50007) {
                    console.warn(`[DM Check] Failed to send DM to ${user.tag} (${user.id}). DMs likely closed.`);
                    await sendButtonError("Không thể tạo link thanh toán. Vui lòng **mở Tin nhắn trực tiếp (DM)** từ thành viên máy chủ trong `Cài đặt người dùng > Quyền riêng tư & An toàn > Cho phép tin nhắn trực tiếp từ thành viên máy chủ` và thử lại.");
                    return; // Stop processing if DMs are closed
                } else {
                    // Log other errors but potentially continue (or handle differently)
                    console.error(`[DM Check] Error attempting to send DM to ${user.tag} (${user.id}):`, error);
                    // Depending on policy, you might want to stop here too, or just warn.
                    // Let's stop for now to be safe, as any DM error is problematic.
                    await sendButtonError("Đã xảy ra lỗi khi kiểm tra cài đặt tin nhắn của bạn. Vui lòng thử lại sau.");
                    return;
                }
            }
            // <<< END DM CHECK >>>

            try {
                const productId = parseInt(parts[2], 10); // Lấy ID sản phẩm từ customId
                if (isNaN(productId)) {
                    await sendButtonError('ID sản phẩm không hợp lệ từ nút bấm.');
                    return;
                }

                // --- Cooldown Check ---
                const cooldownKey = `${user.id}:${textCh.id}:${productId}`;
                const lastClickTimestamp = paymentCooldowns.get(cooldownKey);
                const now = Date.now();

                if (lastClickTimestamp && (now - lastClickTimestamp < COOLDOWN_DURATION)) {
                    const timeLeft = Math.ceil((COOLDOWN_DURATION - (now - lastClickTimestamp)) / 1000);
                    // Use reply directly as we haven't deferred yet
                    await interaction.reply({ content: `⏳ Vui lòng đợi ${timeLeft} giây trước khi tạo lại link thanh toán.`, ephemeral: true });
                    return;
                }
                // --- End Cooldown Check ---

                await interaction.deferReply();

                // productId is already parsed above

                // Tìm lại thông tin sản phẩm (cần thiết để lấy giá và tên)
                let foundProduct: Product | null = null;
                const categories = await getCategories(guild.id);
                for (const cat of categories) {
                    const prods = await getProducts(guild.id, cat.id);
                    const p = prods.find(x => x.id === productId);
                    if (p) {
                        foundProduct = p;
                        break;
                    }
                }

                if (!foundProduct) {
                    await interaction.editReply('❌ Không tìm thấy sản phẩm tương ứng hoặc sản phẩm đã bị xóa.');
                    // No need to disable the button here anymore
                    return;
                }

                // Kiểm tra stock nếu có
                if (foundProduct.stock !== null && foundProduct.stock <= 0) {
                    // Hiển thị modal form nhập thông tin khi hết stock
                    const modal = new ModalBuilder()
                        .setCustomId(`out_of_stock_form:${foundProduct.id}`)
                        .setTitle(`Nhập thông tin đặt hàng (${foundProduct.name})`);

                    const nameInput = new TextInputBuilder()
                        .setCustomId('customer_name')
                        .setLabel('Họ và tên')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const phoneInput = new TextInputBuilder()
                        .setCustomId('customer_phone')
                        .setLabel('Số điện thoại')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);

                    const addressInput = new TextInputBuilder()
                        .setCustomId('customer_address')
                        .setLabel('Địa chỉ')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
                    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput);
                    const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(addressInput);

                    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

                    await interaction.showModal(modal);
                    return;
                }

                // Generate a new order code for each attempt
                const orderCode = Date.now();

                // --- Chuẩn bị dữ liệu và tạo link PayOS ---
                // Đảm bảo YOUR_DOMAIN được định nghĩa trong .env hoặc đặt giá trị mặc định
                const YOUR_DOMAIN = process.env.YOUR_DOMAIN || 'https://your-fallback-domain.com'; // Thay bằng domain thực tế của bạn
                if (YOUR_DOMAIN === 'https://your-fallback-domain.com') {
                    console.warn("Warning: YOUR_DOMAIN environment variable is not set. Using fallback domain for return/cancel URLs.");
                    // Cân nhắc thông báo lỗi nếu domain là bắt buộc cho hoạt động
                    // await sendButtonError("Lỗi cấu hình: Domain chưa được thiết lập."); return;
                }

                const paymentData = {
                    orderCode: orderCode,
                    amount: Math.round(foundProduct.price), // PayOS yêu cầu số nguyên
                    description: `Pay #${orderCode} - ${foundProduct.name} - ${user.tag}`.substring(0, 25), // Fix: Giới hạn 25 ký tự
                    items: [{ name: foundProduct.name.substring(0, 50), quantity: 1, price: Math.round(foundProduct.price) }], // Giới hạn tên item
                    cancelUrl: `${YOUR_DOMAIN}/payment/cancel?orderCode=${orderCode}`, // URL khi người dùng hủy
                    returnUrl: `${YOUR_DOMAIN}/payment/success?orderCode=${orderCode}`, // URL khi thanh toán thành công (cần xử lý ở backend)
                    buyerName: user.username.substring(0, 49), // Giới hạn tên
                    // buyerEmail: `${user.id}@discord-dummy.com`, // Email không bắt buộc, có thể fake nếu cần
                    // buyerPhone: '09xxxxxxxx', // SĐT không bắt buộc
                    // expiredAt removed to make link never expire
                };

                let paymentLinkResponse;
                try {
                    console.log(`[PayOS] Creating payment link for order code: ${orderCode}, amount: ${paymentData.amount}`);
                    paymentLinkResponse = await payOS.createPaymentLink(paymentData);
                    console.log(`[PayOS] Link created successfully for ${orderCode}:`, paymentLinkResponse);

                    // Kiểm tra response tối thiểu phải có checkoutUrl và paymentLinkId
                    if (!paymentLinkResponse || !paymentLinkResponse.checkoutUrl || !paymentLinkResponse.paymentLinkId) {
                        throw new Error('Invalid response from PayOS API. Missing checkoutUrl or paymentLinkId.');
                    }

                } catch (payosError: any) {
                    // Log lỗi chi tiết từ PayOS nếu có
                    console.error(`[PayOS] Error creating payment link for order ${orderCode}:`, payosError?.response?.data || payosError?.message || payosError);
                    // **SỬA LỖI: Lấy chi tiết lỗi từ response nếu có, nếu không thì lấy message**
                    const errorDetails = payosError?.response?.data?.message || payosError?.response?.data?.description || payosError?.message || 'Unknown error from PayOS.';
                    await interaction.editReply(`❌ Lỗi tạo liên kết thanh toán PayOS: ${errorDetails}`);
                    // Ghi lại đơn hàng thất bại vào DB
                    await createOrder({
                        guildId: guild.id,
                        userId: user.id,
                        channelId: textCh.id,
                        productId: foundProduct.id,
                        orderCode: orderCode,
                        amount: foundProduct.price,
                        payosPaymentLinkId: null, // Không có link ID vì lỗi
                        discordMessageId: discordMessageId, // ID của message gốc
                        paymentMessageId: null, // Chưa có message thanh toán
                        status: 'FAILED', // Ghi lại trạng thái thất bại
                    });
                    return; // Dừng thực thi nếu không tạo được link
                }
                // --- Kết thúc tạo link PayOS ---

                // --- Lưu hoặc Cập nhật đơn hàng vào Database ---
                let dbSuccess = false;
                const existingPendingOrder = await getPendingOrderByUserChannelProduct(user.id, textCh.id, foundProduct.id);

                if (existingPendingOrder) {
                    // Update existing pending order with new details
                    // Quan trọng: Cập nhật cả discordMessageId nếu đơn hàng cũ chưa có hoặc khác
                    dbSuccess = await updateOrderLinkDetails(existingPendingOrder.id, orderCode, paymentLinkResponse.paymentLinkId, discordMessageId, null); // <-- Truyền thêm paymentMessageId
                    if (!dbSuccess) {
                        console.error(`[DB] Failed to update order ${existingPendingOrder.id} with new link details for orderCode ${orderCode}.`);
                        await interaction.editReply('❌ Lỗi cập nhật đơn hàng trong hệ thống. Vui lòng liên hệ quản trị viên.');
                        // Consider cancelling PayOS link?
                        return;
                    }
                    console.log(`[DB] Updated existing pending order ID ${existingPendingOrder.id} with new orderCode ${orderCode}, messageId ${discordMessageId}.`);
                } else {
                    // Create a new order if no pending one exists
                    const newOrderId = await createOrder({
                        guildId: guild.id,
                        userId: user.id,
                        channelId: textCh.id,
                        productId: foundProduct.id,
                        orderCode: orderCode,
                        amount: foundProduct.price,
                        payosPaymentLinkId: paymentLinkResponse.paymentLinkId,
                        discordMessageId: discordMessageId,
                        paymentMessageId: null,
                        status: 'PENDING',
                    });
                    if (!newOrderId) {
                        console.error(`[DB] Failed to save new order ${orderCode} with messageId ${discordMessageId} after creating PayOS link.`);
                        await interaction.editReply('❌ Lỗi lưu đơn hàng mới vào hệ thống. Vui lòng liên hệ quản trị viên.');
                        // Consider cancelling PayOS link?
                        return;
                    }
                    dbSuccess = true; // Mark as success if new order created
                    console.log(`[DB] Created new order ID ${newOrderId} with orderCode ${orderCode}, messageId ${discordMessageId}.`);
                }
                // --- Kết thúc lưu/cập nhật Database ---

                // --- Gửi liên kết thanh toán cho người dùng --- (Only if DB operation was successful)
                if (!dbSuccess) {
                    // Error already sent above, just ensure we don't proceed
                    return;
                }
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff00) // Màu xanh lá
                    .setTitle('🔗 Thanh Toán Qua VietQR / PayOS')
                    .setDescription(`✅ Đã tạo link/mã QR cho đơn hàng **#${orderCode}**.\n\n` +
                        `**Sản phẩm:** ${foundProduct.name}\n` +
                        `**Số tiền:** ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(paymentData.amount)}\n\n` + // Lấy amount từ paymentData (đã làm tròn)
                        `1️⃣ **Quét mã VietQR bên dưới** bằng App Ngân hàng/Ví điện tử.\n` +
                        `2️⃣ Hoặc [NHẤN VÀO ĐÂY](${paymentLinkResponse.checkoutUrl}) để mở trang thanh toán PayOS.\n\n` +
                        `*Liên kết/Mã QR không bao giờ hết hạn.*\n\n` +
                        `ℹ️ Sau khi thanh toán thành công, vui lòng chờ xác nhận.`
                    );

                // --- Tạo URL hình ảnh VietQR ---
                try {
                    // Lấy các thông tin cần thiết từ response PayOS
                    const bankBin = paymentLinkResponse.bin;
                    const accountNumber = paymentLinkResponse.accountNumber;
                    const amount = paymentData.amount; // Sử dụng amount đã làm tròn gửi đi
                    const description = paymentData.description; // Sử dụng description đã cắt ngắn gửi đi
                    const accountName = paymentLinkResponse.accountName; // Lấy tên tài khoản

                    if (bankBin && accountNumber && amount > 0 && description) {
                        // Chọn template (vd: compact2, compact, qr_only, print) - compact2 thường dùng và đẹp
                        const template = "qr-only";

                        // Tạo URL cho img.vietqr.io (Nhớ encode các thành phần text)
                        // Cần URL Encode cho description và accountName vì chúng có thể chứa ký tự đặc biệt/dấu cách
                        const vietQRImageUrl = `https://img.vietqr.io/image/${bankBin}-${accountNumber}-${template}.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName || '')}`;

                        // Đặt hình ảnh cho Embed bằng setImage (ảnh lớn hơn thumbnail)
                        successEmbed.setImage(vietQRImageUrl);
                        console.log(`[VietQR] Generated image URL: ${vietQRImageUrl}`); // Log URL để kiểm tra
                    } else {
                        console.warn(`[VietQR] Missing data to generate VietQR image for order ${orderCode}.`);
                        // Có thể đặt một ảnh mặc định hoặc không đặt ảnh nếu thiếu thông tin
                        // successEmbed.setImage('URL_HINH_MAC_DINH_HOAC_KHONG_DAT');
                    }
                } catch (qrError) {
                    console.error(`[VietQR] Error generating VietQR image URL for order ${orderCode}:`, qrError);
                    // Không đặt ảnh nếu có lỗi
                }
                // --- Kết thúc tạo URL hình ảnh VietQR ---


                successEmbed // Tiếp tục cấu hình embed nếu cần
                    .setFooter(getFooter(guild.name, guild.iconURL()))

                // Gửi tin nhắn đi
                const cancelButton = new ButtonBuilder()
                    .setCustomId(`price:cancel_payment:${orderCode}`)
                    .setLabel('Hủy Thanh Toán')
                    .setStyle(ButtonStyle.Danger);

                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton);

                const paymentMsg = await interaction.editReply({
                    embeds: [successEmbed],
                    components: [actionRow]
                });

                // Sau khi gửi message mới, disable nút "Thanh Toán (PayOS)" trong message gốc
                try {
                    const originalMessage = interaction.message;
                    if (originalMessage && originalMessage.components) {
                        const newActionRows = originalMessage.components.map(row => {
                            const actionRow = ActionRowBuilder.from(row.toJSON());
                            const newButtons = actionRow.components.map(component => {
                                // Chỉ xử lý nếu là button
                                if (component instanceof ButtonBuilder) {
                                    const btnData = component.toJSON();
                                    if ((btnData as any).custom_id && (btnData as any).custom_id.startsWith('price:initiate_payment:')) {
                                        const disabledBtn = ButtonBuilder.from(btnData).setDisabled(true);
                                        return disabledBtn;
                                    } else {
                                        return component;
                                    }
                                } else {
                                    return component;
                                }
                            });
                            return new ActionRowBuilder().addComponents(...newButtons);
                        });
                        await originalMessage.edit({ components: newActionRows.map(row => row.toJSON()) as any });
                    }
                } catch (disableError) {
                    console.error('Failed to disable PayOS button:', disableError);
                }

                // Cập nhật order với paymentMessageId và payosCreatedAt
                try {
                    await pool.query(
                        'UPDATE orders SET paymentMessageId = ?, payosCreatedAt = ? WHERE orderCode = ?',
                        [paymentMsg.id, new Date(), orderCode]
                    );
                    console.log(`[DB] Updated order ${orderCode} with paymentMessageId ${paymentMsg.id} and payosCreatedAt`);
                } catch (err) {
                    console.error(`[DB] Failed to update order ${orderCode} with paymentMessageId:`, err);
                }

                // Update cooldown timestamp AFTER successful processing
                paymentCooldowns.set(cooldownKey, now);

                // Ensure the button disabling logic is completely removed

            } catch (error) {
                console.error(`[Price Initiate Payment] Error for product ${parts[2]}:`, error);
                await sendButtonError("Đã xảy ra lỗi không mong muốn khi khởi tạo thanh toán.");
                // Ghi lại đơn hàng lỗi vào DB nếu có thể (ví dụ lỗi trước khi gọi PayOS)
                const productId = parseInt(parts[2], 10);
                const orderCode = Date.now(); // Hoặc lấy orderCode từ đâu đó nếu đã tạo
                if (!isNaN(productId)) {
                    // Chỉ ghi log nếu có productId hợp lệ
                    await createOrder({
                        guildId: guild.id,
                        userId: user.id,
                        channelId: textCh.id,
                        productId: productId,
                        orderCode: orderCode, // Cần một orderCode, dùng tạm timestamp nếu chưa có
                        amount: 0, // Không rõ giá khi lỗi này xảy ra, đặt là 0 hoặc tìm lại
                        payosPaymentLinkId: null,
                        discordMessageId: discordMessageId,
                        paymentMessageId: null,
                        status: 'FAILED',
                    }).catch(console.error); // Bắt lỗi nếu ghi log cũng lỗi
                }
            }
        } // --- Kết thúc action 'initiate_payment' ---

        // --- Xử lý action 'close_channel' ---
        else if (action === 'close_channel') {
            // Kiểm tra xem người bấm có phải là người tạo kênh hoặc admin không
            // Lấy ID người tạo từ topic
            let creatorId: string | null = null;
            const topicMatch = textCh.topic?.match(/CreatorID:(\d+)/);
            if (topicMatch && topicMatch[1]) {
                creatorId = topicMatch[1];
            }

            // Lấy quyền của người bấm nút
            const member = interaction.member;
            let isAllowedToClose = false;
            if (member) {
                // Kiểm tra nếu là người tạo kênh
                if (creatorId && member.user.id === creatorId) {
                    isAllowedToClose = true;
                }
                // Kiểm tra nếu là admin (nếu không phải người tạo)
                if (!isAllowedToClose && typeof member.permissions !== 'string' && new PermissionsBitField(member.permissions).has(PermissionFlagsBits.Administrator)) {
                    isAllowedToClose = true;
                }
            }

            if (!isAllowedToClose) {
                await sendButtonError("Chỉ người tạo kênh hoặc quản trị viên mới có thể đóng kênh này.");
                return;
            }


            // Gửi embed xác nhận
            try {
                const confirmEmbed = createEmbed({ guild: guild }, '❓ Xác Nhận Đóng Kênh', 'Bạn có chắc chắn muốn đóng kênh thanh toán này?\n\n*Sau khi đóng, chỉ có quản trị viên mới có thể mở lại hoặc xóa kênh này vĩnh viễn.*\n\n*(Tin nhắn này sẽ tự động biến mất sau 1 phút)*', 0xff5555) // Màu đỏ nhạt
                    .setFooter(getFooter(guild.name, guild.iconURL()));

                const yesButton = new ButtonBuilder()
                    .setCustomId('price:confirm_close_yes')
                    .setLabel('Có, Đóng Ngay')
                    .setStyle(ButtonStyle.Danger);
                const noButton = new ButtonBuilder()
                    .setCustomId('price:confirm_close_no')
                    .setLabel('Không, Giữ Lại')
                    .setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(yesButton, noButton);

                // Gửi ephemeral và tự xóa sau 1 phút (timeout)
                const reply = await interaction.reply({
                    embeds: [confirmEmbed],
                    components: [row],
                    ephemeral: true,
                    fetchReply: true // Cần để lấy message object cho việc set timeout
                });

                // Set timeout để xóa nút sau 60 giây nếu không ai bấm
                setTimeout(async () => {
                    try {
                        // Kiểm tra xem interaction reply còn tồn tại không trước khi edit
                        const currentReply = await interaction.fetchReply().catch(() => null);
                        if (currentReply && currentReply.components.length > 0) { // Chỉ edit nếu còn component
                            await interaction.editReply({
                                content: 'ℹ️ Thời gian xác nhận đóng kênh đã hết.',
                                embeds: [],
                                components: []
                            }).catch(() => { }); // Bỏ qua lỗi nếu không edit được (ví dụ đã có người bấm)
                        }
                    } catch (e) {
                        // Bỏ qua lỗi nếu interaction không còn tồn tại
                    }
                }, 60 * 1000); // 60 giây


            } catch (error) {
                console.error(`[Price Close Channel Confirm] Error:`, error);
                await sendButtonError("Lỗi hiển thị xác nhận đóng kênh.");
            }
        }
        // --- Xử lý action 'confirm_close_yes' ---
        else if (action === 'confirm_close_yes') {
            try {
                // Kiểm tra lại quyền (Admin hoặc người tạo kênh) trước khi đóng
                let creatorId: string | null = null;
                const topicMatch = textCh.topic?.match(/CreatorID:(\d+)/);
                if (topicMatch && topicMatch[1]) {
                    creatorId = topicMatch[1];
                }
                const member = interaction.member;
                let isAllowedToClose = false;
                if (member) {
                    if (creatorId && member.user.id === creatorId) {
                        isAllowedToClose = true;
                    }
                    if (!isAllowedToClose && typeof member.permissions !== 'string' && new PermissionsBitField(member.permissions).has(PermissionFlagsBits.Administrator)) {
                        isAllowedToClose = true;
                    }
                }
                if (!isAllowedToClose) {
                    await interaction.update({ // Update interaction gốc báo lỗi
                        content: '🚫 Bạn không có quyền thực hiện hành động này.',
                        embeds: [],
                        components: []
                    }).catch(console.error);
                    return;
                }

                await interaction.deferUpdate(); // deferUpdate() trước khi làm việc lâu

                // Kiểm tra quyền quản lý kênh của Bot
                if (!textCh.manageable) {
                    console.error(`Bot cannot manage channel ${textCh.id} in guild ${guild.id}.`);
                    await interaction.followUp({ content: '❌ Bot không có quyền quản lý kênh này.', ephemeral: true });
                    return;
                }

                // Lấy cấu hình danh mục đóng
                const config = await getChannelCategories(guild.id);
                if (!config || !config.closedCategoryId) {
                    console.error(`Closed category channel ID is not configured for guild ${guild.id}.`);
                    await interaction.followUp({ content: '❌ Chưa thiết lập danh mục kênh đã đóng.', ephemeral: true });
                    return;
                }
                const closedCategoryId = config.closedCategoryId;

                // Fetch danh mục đóng để đảm bảo tồn tại và là category
                const closedCategoryChannel = guild.channels.cache.get(closedCategoryId) ?? await guild.channels.fetch(closedCategoryId).catch(() => null);
                if (!closedCategoryChannel || closedCategoryChannel.type !== ChannelType.GuildCategory) {
                    console.error(`Closed category channel ${closedCategoryId} not found or is not a category in guild ${guild.id}.`);
                    await interaction.followUp({ content: '❌ Không tìm thấy danh mục kênh đóng.', ephemeral: true });
                    return;
                }

                // Kiểm tra quyền của Bot trong danh mục đóng
                const botMember = guild.members.me ?? await guild.members.fetchMe();
                if (!botMember) {
                    console.error(`[Confirm Close] Failed to fetch bot member in guild ${guild.id}.`);
                    await interaction.followUp({ content: '❌ Lỗi không xác định được thông tin bot.', ephemeral: true });
                    return;
                }
                const botPermsInClosedCat = closedCategoryChannel.permissionsFor(botMember);
                // Bot cần View và ManageChannels trong category ĐÓNG để di chuyển kênh vào đó
                if (!botPermsInClosedCat || !botPermsInClosedCat.has(PermissionFlagsBits.ManageChannels) || !botPermsInClosedCat.has(PermissionFlagsBits.ViewChannel)) {
                    console.error(`Bot lacks ManageChannels/ViewChannel permission in the closed category ${closedCategoryId}.`);
                    await interaction.followUp({ content: '❌ Bot thiếu quyền trong danh mục kênh đóng.', ephemeral: true });
                    return;
                }


                // Thực hiện di chuyển kênh và cập nhật quyền
                try {
                    // 1. Di chuyển kênh vào danh mục đóng
                    await textCh.setParent(closedCategoryId, { lockPermissions: false, reason: `Channel closed by ${user.tag}` });
                    console.log(`Moved channel ${textCh.name} (${textCh.id}) to category ${closedCategoryId}`);

                    // 2. Cập nhật quyền để ẩn kênh khỏi người dùng gốc (nếu xác định được)
                    let userToRestrictId: string | null = null;
                    // Tái sử dụng creatorId đã lấy ở trên
                    userToRestrictId = creatorId;

                    if (userToRestrictId) {
                        try {
                            // Dùng edit để cập nhật overwrite cho người dùng đó
                            await textCh.permissionOverwrites.edit(
                                userToRestrictId,
                                { ViewChannel: false }, // Chặn quyền xem kênh
                                { reason: `Channel closed by ${interaction.user.tag}` }
                            );
                            console.log(`Restricted view perm for ${userToRestrictId} in closed channel ${textCh.id}`);
                        } catch (permError) {
                            console.error(`Failed to restrict perm for ${userToRestrictId} in ${textCh.id}:`, permError);
                            // Gửi cảnh báo vào kênh nếu không ẩn được (quản trị viên sẽ thấy)
                            textCh.send(`⚠️ Không thể tự động ẩn kênh khỏi người tạo (<@${userToRestrictId}>).`).catch(() => { });
                        }
                    } else {
                        // Gửi cảnh báo nếu không tìm thấy ID người tạo từ topic
                        await textCh.send("⚠️ Không thể xác định người tạo kênh từ topic để ẩn kênh.").catch(console.error);
                    }

                } catch (moveOrPermError) {
                    console.error(`Error moving channel or setting permissions for ${textCh.id}:`, moveOrPermError);
                    await interaction.followUp({ content: '❌ Lỗi khi di chuyển kênh hoặc cập nhật quyền.', ephemeral: true });
                    return; // Dừng lại nếu có lỗi ở bước này
                }

                // Gửi thông báo vào kênh đã đóng và thêm nút quản trị
                const closedEmbed = createEmbed({ guild: guild }, '🔒 Kênh Đã Được Đóng', `Kênh này đã được đóng bởi ${user}.\n\nChỉ quản trị viên mới có thể thấy nội dung và sử dụng các nút bên dưới.`, 0x808080) // Màu xám
                const reopenButton = new ButtonBuilder()
                    .setCustomId('price:reopen_channel')
                    .setLabel('Mở Lại Kênh')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔓');
                const deleteButton = new ButtonBuilder()
                    .setCustomId('price:delete_channel')
                    .setLabel('Xóa Kênh (Vĩnh Viễn)')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️');
                const closedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(reopenButton, deleteButton);

                await textCh.send({ embeds: [closedEmbed], components: [closedRow] });

                // Edit reply của tương tác gốc (xác nhận đóng) để xóa nút và báo thành công
                await interaction.editReply({ content: '✅ Kênh đã đóng thành công.', components: [], embeds: [] }).catch(() => { });


            } catch (error) {
                console.error(`[Price Confirm Close Yes] Error closing channel ${textCh.id}:`, error);
                // Cố gắng gửi followUp nếu chưa có gì được gửi
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Lỗi nghiêm trọng khi đóng kênh.', ephemeral: true }).catch(console.error);
                } else {
                    await interaction.followUp({ content: '❌ Lỗi nghiêm trọng khi đóng kênh.', ephemeral: true }).catch(console.error);
                }
            }
        }
        // --- Xử lý action 'confirm_close_no' ---
        else if (action === 'confirm_close_no') {
            try {
                // Chỉ cần update tin nhắn ephemeral gốc là đủ
                await interaction.update({ // Dùng update để sửa tin nhắn tương tác gốc
                    content: 'ℹ️ Yêu cầu đóng kênh đã được hủy.',
                    embeds: [],
                    components: [] // Xóa nút Yes/No
                });
            } catch (updateError) {
                console.error("Failed to update interaction on close cancel:", updateError);
                // Thường không cần báo lỗi lại cho người dùng ở đây
            }
        }
        // --- Xử lý action 'reopen_channel' ---
        else if (action === 'reopen_channel') {
            try {
                await interaction.deferUpdate(); // Defer trước

                // Chỉ Admin mới được mở lại
                const member = interaction.member;
                if (!member || typeof member.permissions === 'string' || !new PermissionsBitField(member.permissions).has(PermissionFlagsBits.Administrator)) {
                    await interaction.followUp({ content: '🚫 Chỉ quản trị viên mới có quyền mở lại kênh.', ephemeral: true });
                    return;
                }

                // Kiểm tra quyền quản lý kênh của Bot
                if (!textCh.manageable) {
                    await interaction.followUp({ content: '❌ Bot không có quyền quản lý kênh này.', ephemeral: true });
                    return;
                }

                // Lấy cấu hình danh mục mở
                const config = await getChannelCategories(guild.id);
                if (!config || !config.openCategoryId) {
                    await interaction.followUp({ content: '❌ Chưa thiết lập danh mục kênh mở.', ephemeral: true });
                    return;
                }
                const openCategoryId = config.openCategoryId;

                // Fetch danh mục mở
                const openCategoryChannel = guild.channels.cache.get(openCategoryId) ?? await guild.channels.fetch(openCategoryId).catch(() => null);
                if (!openCategoryChannel || openCategoryChannel.type !== ChannelType.GuildCategory) {
                    await interaction.followUp({ content: '❌ Không tìm thấy danh mục kênh mở.', ephemeral: true });
                    return;
                }

                // Kiểm tra quyền của Bot trong danh mục mở
                const botMember = guild.members.me ?? await guild.members.fetchMe();
                if (!botMember) {
                    console.error(`[Reopen Channel] Failed to fetch bot member in guild ${guild.id}.`);
                    await interaction.followUp({ content: '❌ Lỗi không xác định được thông tin bot.', ephemeral: true });
                    return;
                }
                const botPermsInOpenCat = openCategoryChannel.permissionsFor(botMember);
                // Bot cần View và ManageChannels trong category MỞ để di chuyển kênh vào đó
                if (!botPermsInOpenCat || !botPermsInOpenCat.has(PermissionFlagsBits.ManageChannels) || !botPermsInOpenCat.has(PermissionFlagsBits.ViewChannel)) {
                    console.error(`Bot lacks ManageChannels/ViewChannel permission in the open category ${openCategoryId}.`);
                    await interaction.followUp({ content: '❌ Bot thiếu quyền trong danh mục kênh mở.', ephemeral: true });
                    return;
                }


                // Di chuyển và cập nhật quyền
                try {
                    // 1. Di chuyển kênh về danh mục mở
                    await textCh.setParent(openCategoryId, { lockPermissions: false, reason: `Channel reopened by ${user.tag}` });
                    console.log(`Moved channel ${textCh.name} (${textCh.id}) back to open category ${openCategoryId}`);

                    // 2. Khôi phục quyền xem cho người dùng gốc (nếu có)
                    let originalUserId: string | null = null;
                    const topicMatch = textCh.topic?.match(/CreatorID:(\d+)/);
                    if (topicMatch && topicMatch[1]) {
                        originalUserId = topicMatch[1];
                    } else {
                        console.warn(`Could not determine original user ID from topic for channel ${textCh.id}.`);
                    }

                    if (originalUserId) {
                        // Fetch member gốc để đảm bảo họ còn trong server
                        const originalMember = await guild.members.fetch(originalUserId).catch(() => null);
                        if (originalMember) {
                            try {
                                // Dùng edit để cập nhật overwrite
                                await textCh.permissionOverwrites.edit(
                                    originalUserId,
                                    { ViewChannel: true }, // Cho phép xem lại
                                    { reason: `Channel reopened by ${interaction.user.tag}` }
                                );
                                console.log(`Restored view perm for ${originalUserId} in reopened channel ${textCh.id}`);
                            } catch (permError) {
                                console.error(`Failed restore perm for ${originalUserId} in ${textCh.id}:`, permError);
                                textCh.send(`⚠️ Lỗi khôi phục quyền xem cho người tạo (<@${originalUserId}>).`).catch(() => { });
                            }
                        } else {
                            console.warn(`Original user ${originalUserId} not found in guild. Cannot restore permissions.`);
                            // Gửi thông báo vào kênh (admin sẽ thấy)
                            await textCh.send(`⚠️ Không tìm thấy người dùng gốc (<@${originalUserId}>) trong máy chủ để khôi phục quyền xem.`).catch(console.error);
                        }
                    } else {
                        // Gửi thông báo nếu không xác định được user gốc
                        await textCh.send("⚠️ Không thể xác định người dùng gốc để khôi phục quyền xem.").catch(console.error);
                    }

                } catch (moveOrPermError) {
                    console.error(`Error moving channel or restoring permissions for ${textCh.id}:`, moveOrPermError);
                    await interaction.followUp({ content: '❌ Lỗi khi di chuyển kênh hoặc khôi phục quyền.', ephemeral: true });
                    return; // Dừng nếu lỗi
                }

                // Gửi thông báo vào kênh
                await textCh.send(`🔓 Kênh này đã được mở lại bởi ${user}.`);

                // Xóa tin nhắn chứa nút admin (Reopen/Delete) đã gửi trước đó
                if (message?.deletable) { // Kiểm tra xem tin nhắn chứa nút có thể xóa không
                    await message.delete().catch(() => { console.warn(`Could not delete admin control message in ${textCh.id}`) });
                }

                // Không cần followUp vì đã deferUpdate và không có gì cần báo thêm (hành động đã hoàn tất trong kênh)

            } catch (error) {
                console.error(`[Price Reopen Channel] Error reopening channel ${textCh.id}:`, error);
                await interaction.followUp({ content: '❌ Lỗi không mong muốn khi mở lại kênh.', ephemeral: true }).catch(console.error);
            }
        }
        // --- Xử lý action 'delete_channel' ---
        else if (action === 'delete_channel') {
            const channelName = textCh.name; // Lưu tên trước khi xóa
            const userDeleting = user; // Lưu người thực hiện xóa

            try {
                await interaction.deferUpdate(); // Defer trước khi làm việc lâu (tạo log)

                // Chỉ Admin mới được xóa
                const member = interaction.member;
                if (!member || typeof member.permissions === 'string' || !new PermissionsBitField(member.permissions).has(PermissionFlagsBits.Administrator)) {
                    await interaction.followUp({ content: '🚫 Chỉ quản trị viên mới có quyền xóa kênh.', ephemeral: true });
                    return;
                }

                // Kiểm tra quyền xóa kênh của Bot
                if (!textCh.deletable) {
                    // Thử followUp vì kênh chưa bị xóa
                    await interaction.followUp({ content: '❌ Bot không có quyền xóa kênh này.', ephemeral: true });
                    return;
                }

                // --- Chuẩn bị Log ---
                let htmlLogData: string | null = null;
                let logChannel: TextChannel | null = null;
                const logChannelId = await getLogChannel(guild.id);

                if (logChannelId && logChannelId !== textCh.id) { // Đảm bảo kênh log không phải kênh đang xóa
                    try {
                        const fetchedLogChannel = guild.channels.cache.get(logChannelId) ?? await guild.channels.fetch(logChannelId).catch(() => null);
                        if (fetchedLogChannel instanceof TextChannel) {
                            // Kiểm tra quyền gửi tin nhắn và đính kèm file của bot trong kênh log
                            const botMember = guild.members.me ?? await guild.members.fetchMe();
                            if (botMember) {
                                const botPermsInLog = fetchedLogChannel.permissionsFor(botMember);
                                if (botPermsInLog?.has(PermissionFlagsBits.SendMessages) && botPermsInLog.has(PermissionFlagsBits.AttachFiles)) {
                                    logChannel = fetchedLogChannel; // Lưu kênh log hợp lệ
                                    console.log(`Generating log for channel ${textCh.name} (${textCh.id}) before deletion...`);
                                    htmlLogData = await generateHTMLLog(textCh); // Tạo log TRƯỚC khi xóa kênh
                                    console.log(`Log generated for ${textCh.name}. Size: ${htmlLogData?.length || 0} bytes`);
                                } else {
                                    console.warn(`Bot lacks SendMessages/AttachFiles permission in log channel ${logChannelId}. Skipping log generation.`);
                                }
                            } else {
                                console.warn(`Could not fetch bot member to check perms in log channel ${logChannelId}`);
                            }
                        } else {
                            console.warn(`Log channel ${logChannelId} not found or not a text channel.`);
                        }
                    } catch (logPrepError) {
                        console.error(`Failed to prepare log for channel ${textCh.id} before deletion:`, logPrepError);
                        // Không dừng việc xóa, chỉ log lỗi chuẩn bị
                    }
                } else if (logChannelId === textCh.id) {
                    console.warn(`Log channel is the same as the channel being deleted (${textCh.id}). Skipping log.`);
                }
                else {
                    console.log(`Log channel not configured for guild ${guild.id}.`);
                }
                // --- Kết thúc chuẩn bị Log ---


                // --- Xóa Kênh ---
                try {
                    await textCh.delete(`Channel deleted by ${userDeleting.tag} (${userDeleting.id})`);
                    console.log(`✅ Channel ${channelName} (ID was: ${textCh.id}) deleted successfully by ${userDeleting.tag}.`);

                    // Gửi log nếu đã tạo thành công và kênh log hợp lệ
                    if (logChannel && htmlLogData) {
                        try {
                            // Fetch lại kênh log để đảm bảo nó vẫn tồn tại (phòng trường hợp bị xóa trong lúc tạo log)
                            const currentLogChannel = guild.channels.cache.get(logChannel.id) ?? await guild.channels.fetch(logChannel.id).catch(() => null);
                            if (currentLogChannel instanceof TextChannel) { // Kiểm tra lại type
                                await currentLogChannel.send({
                                    content: `🗑️ **Log Đã Lưu**\nKênh \`#${channelName}\` (ID cũ: ${textCh.id}) đã bị xóa bởi ${userDeleting}.\nLog nội dung đính kèm:`,
                                    files: [{ attachment: Buffer.from(htmlLogData, 'utf-8'), name: `log-${channelName}-${Date.now()}.html` }],
                                });
                                console.log(`Log for ${channelName} sent to ${logChannel.name}.`);
                            } else {
                                console.warn(`Log channel ${logChannel.id} seems to have been deleted or changed type before the log could be sent.`);
                            }
                        } catch (logSendError) {
                            console.error(`❌ Failed to send log file to ${logChannel?.id} for deleted channel ${channelName}:`, logSendError);
                            // Cố gắng gửi thông báo lỗi vào kênh log nếu gửi file thất bại
                            if (logChannel) { // Chỉ gửi nếu logChannel đã được xác định ban đầu
                                try {
                                    // Fetch lại lần nữa trước khi gửi lỗi
                                    const errorLogChannel = guild.channels.cache.get(logChannel.id) ?? await guild.channels.fetch(logChannel.id).catch(() => null);
                                    if (errorLogChannel instanceof TextChannel) {
                                        await errorLogChannel.send(`❌ Lỗi gửi file log cho kênh \`#${channelName}\` đã xóa bởi ${userDeleting}.`);
                                    }
                                } catch { /* ignore secondary error */ }
                            }
                        }
                    } else if (logChannel && !htmlLogData) {
                        // Trường hợp kênh log có nhưng tạo log lỗi / không tạo được
                        try {
                            const errorLogChannel = guild.channels.cache.get(logChannel.id) ?? await guild.channels.fetch(logChannel.id).catch(() => null);
                            if (errorLogChannel instanceof TextChannel) {
                                await errorLogChannel.send(`🗑️ Kênh \`#${channelName}\` đã xóa bởi ${userDeleting}, nhưng đã xảy ra lỗi khi tạo file log.`);
                            }
                        } catch { }
                    }

                    // Không cần followUp vì kênh đã bị xóa và tương tác đã được deferUpdate

                } catch (deleteError) {
                    console.error(`❌ Error deleting channel ${channelName} (intended ID: ${textCh.id}):`, deleteError);
                    // Không thể followUp interaction vì kênh đã bị xóa (hoặc lỗi xóa)
                    // Gửi lỗi vào kênh log nếu có thể
                    if (logChannel) {
                        try {
                            const errorLogChannel = guild.channels.cache.get(logChannel.id) ?? await guild.channels.fetch(logChannel.id).catch(() => null);
                            if (errorLogChannel instanceof TextChannel) {
                                await errorLogChannel.send(`❌ Lỗi khi xóa kênh \`#${channelName}\` bởi ${userDeleting}: ${String(deleteError)}`);
                            }
                        } catch { }
                    }
                    // Không thể gửi phản hồi cho người dùng qua interaction này nữa.
                }
                // --- Kết thúc xóa kênh ---

            } catch (error) {
                console.error(`[Price Delete Channel] Error preparing ${textCh.id} for deletion:`, error);
                // Cố gắng followUp nếu kênh chưa bị xóa và interaction còn hiệu lực
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ Lỗi không mong muốn khi chuẩn bị xóa kênh.', ephemeral: true }).catch(console.error);
                } else if (interaction.channel && interaction.isRepliable()) { // Chỉ followUp nếu kênh còn tồn tại và repliable
                    await interaction.followUp({ content: '❌ Lỗi không mong muốn khi chuẩn bị xóa kênh.', ephemeral: true }).catch(console.error);
                }
            }
        } // --- Kết thúc action 'delete_channel' ---

    }, // Kết thúc handleButtonInteraction

    // Xử lý khi submit modal form hết hàng
    async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
        if (!interaction.guild || !interaction.channel || !(interaction.channel instanceof TextChannel)) {
            await interaction.reply({ content: 'Lỗi: Tương tác này chỉ hoạt động trong kênh văn bản của máy chủ.', ephemeral: true });
            return;
        }

        const customId = interaction.customId;
        if (!customId.startsWith('out_of_stock_form:')) return;

        const productId = parseInt(customId.split(':')[1], 10);
        if (isNaN(productId)) {
            await interaction.reply({ content: '❌ ID sản phẩm không hợp lệ.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Lấy thông tin từ form
        const name = interaction.fields.getTextInputValue('customer_name');
        const phone = interaction.fields.getTextInputValue('customer_phone');
        const address = interaction.fields.getTextInputValue('customer_address');

        // Tìm lại thông tin sản phẩm
        let foundProduct: Product | null = null;
        const categories = await getCategories(interaction.guild.id);
        for (const cat of categories) {
            const prods = await getProducts(interaction.guild.id, cat.id);
            const p = prods.find(x => x.id === productId);
            if (p) {
                foundProduct = p;
                break;
            }
        }

        if (!foundProduct) {
            await interaction.editReply('❌ Sản phẩm không còn tồn tại.');
            return;
        }

        // Tạo embed thông báo đã nhận thông tin
        const orderEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📝 Đơn đặt hàng (${foundProduct.name})`)
            .setDescription(`Sản phẩm đã hết hàng, vui lòng chờ shop liên hệ lại!`)
            .addFields(
                { name: '👤 Khách hàng', value: name, inline: true },
                { name: '📞 Điện thoại', value: phone, inline: true },
                { name: '🏠 Địa chỉ', value: address },
                { name: '🛒 Sản phẩm', value: foundProduct.name },
                { name: '💰 Giá', value: new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(foundProduct.price) }
            )
            .setTimestamp();

        // Gửi embed vào kênh thanh toán
        await interaction.channel.send({ embeds: [orderEmbed] });
        await interaction.editReply('✅ Đã gửi thông tin đặt hàng, shop sẽ liên hệ với bạn sớm!');
    },
};

export default command;
