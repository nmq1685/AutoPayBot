import { Client, Message, EmbedBuilder } from 'discord.js';
import type { ICommand } from '../types/ICommand';

export function registerMessageCreateEvent(client: Client, prefix: string) {
    client.on('messageCreate', async (message: Message) => {
        if (message.author.bot || !message.content.startsWith(prefix) || !message.guild) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase() || '';

        let command = (client.commands as Map<string, ICommand>).get(commandName);

        if (!command) {
            command = Array.from((client.commands as Map<string, ICommand>).values()).find(
                (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
            );
        }

        if (!command) return;

        try {
            if (typeof command.execute !== 'function') {
                console.error(`Command ${commandName} does not have a valid execute function.`);
                return;
            }
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing prefix command ${commandName}:`, error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('❌ An error occurred while executing the command!');
            try {
                await message.reply({ embeds: [errorEmbed] });
            } catch (replyError) {
                console.error("Failed to send error reply for prefix command:", replyError);
            }
        }
    });
}