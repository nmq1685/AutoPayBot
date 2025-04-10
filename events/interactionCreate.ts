import { Client, Interaction, EmbedBuilder } from 'discord.js';
import type { ICommand } from '../types/ICommand';

export function registerInteractionCreateEvent(client: Client) {
    client.on('interactionCreate', async (interaction: Interaction) => {

        const sendErrorReply = async (content: string) => {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription(`❌ ${content}`);
            try {
                if (interaction.isRepliable()) {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                    } else {
                        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            } catch (replyError) {
                console.error("Failed to send error reply:", replyError);
            }
        };

        if (!interaction.guild) {
            if (interaction.isRepliable()) {
                await sendErrorReply('This interaction can only be used in a server.');
            }
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = (client.commands as Map<string, ICommand>).get(interaction.commandName);
            if (command && typeof command.autocomplete === 'function') {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
                }
            } else {
                console.warn(`No autocomplete handler found for command: ${interaction.commandName}`);
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = (client.commands as Map<string, ICommand>).get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                await sendErrorReply(`Command '${interaction.commandName}' not found!`);
                return;
            }
            if (typeof command.execute !== 'function') {
                console.error(`Command ${interaction.commandName} does not have a valid execute function.`);
                await sendErrorReply(`Command '${interaction.commandName}' is not configured correctly.`);
                return;
            }
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing slash command ${interaction.commandName}:`, error);
                await sendErrorReply('An error occurred while executing the command!');
            }
            return;
        }

        if (interaction.isModalSubmit()) {
            try {
                if (interaction.customId.startsWith('webhook:submit_info:')) {
                    const parts = interaction.customId.split(':');
                    const orderId = parts[2];
                    const userId = parts[3];

                    if (interaction.user.id !== userId) {
                        await interaction.reply({ content: 'Bạn không được phép gửi thông tin cho đơn hàng này.', ephemeral: true });
                        return;
                    }

                    const info = interaction.fields.getTextInputValue('info_text');

                    await interaction.reply({ content: '✅ Đã nhận thông tin của bạn.', ephemeral: true });

                    const channel = interaction.channel;
                    if (channel && channel.isTextBased() && 'send' in channel) {
                        const { EmbedBuilder } = require('discord.js');
                        const infoEmbed = new EmbedBuilder()
                            .setColor(0x0099ff)
                            .setTitle('📦 Thông Tin Nhận Hàng')
                            .setDescription(info)
                            .setFooter({ text: `Order ID: ${orderId}` })
                            .setTimestamp();

                        await (channel as any).send({ content: `<@${userId}>`, embeds: [infoEmbed] });
                    }
                    return;
                }

                const customIdParts = interaction.customId.split(':');
                const commandName = customIdParts[0];
                const command = (client.commands as Map<string, ICommand>).get(commandName);

                if (command && typeof command.handleModalSubmit === 'function') {
                    await command.handleModalSubmit(interaction);
                } else {
                    console.warn(`No modal submit handler found for command ${commandName} or command not found for customId ${interaction.customId}`);
                    await sendErrorReply('Could not process this submission type.');
                }
            } catch (error) {
                console.error('Error handling modal submit:', error);
                await sendErrorReply('Error processing your submission.');
            }
            return;
        }

        if (interaction.isButton()) {
            try {
                if (interaction.customId.startsWith('webhook:collect_info:')) {
                    const parts = interaction.customId.split(':');
                    const orderId = parts[2];
                    const userId = parts[3];

                    if (interaction.user.id !== userId) {
                        await interaction.reply({ content: 'Bạn không được phép nhập thông tin cho đơn hàng này.', ephemeral: true });
                        return;
                    }

                    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

                    const modal = new ModalBuilder()
                        .setCustomId(`webhook:submit_info:${orderId}:${userId}`)
                        .setTitle('Nhập Thông Tin Nhận Hàng');

                    const infoInput = new TextInputBuilder()
                        .setCustomId('info_text')
                        .setLabel('Thông tin nhận hàng')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    const row = new ActionRowBuilder().addComponents(infoInput);
                    modal.addComponents(row);

                    await interaction.showModal(modal);
                    return;
                }

                const customIdParts = interaction.customId.split(':');
                const commandName = customIdParts[0];
                const command = (client.commands as Map<string, ICommand>).get(commandName);

                if (command && typeof command.handleButtonInteraction === 'function') {
                    await command.handleButtonInteraction(interaction);
                } else {
                    console.warn(`No button handler found for command ${commandName} or command not found for customId ${interaction.customId}`);
                    await interaction.reply({ content: "This button is either outdated or invalid.", ephemeral: true }).catch(() => {});
                }
            } catch (error) {
                console.error(`Error dispatching button interaction with customId ${interaction.customId}:`, error);
                await sendErrorReply('An error occurred while processing this button.');
            }
            return;
        }

        if (interaction.isStringSelectMenu()) {
            try {
                const customIdParts = interaction.customId.split(':');
                const commandName = customIdParts[0];
                const command = (client.commands as Map<string, ICommand>).get(commandName);

                if (command && typeof command.handleStringSelectMenuInteraction === 'function') {
                    await command.handleStringSelectMenuInteraction(interaction);
                } else {
                    console.warn(`No string select menu handler found for command ${commandName} or command not found for customId ${interaction.customId}`);
                    await interaction.reply({ content: "This menu is either outdated or invalid.", ephemeral: true }).catch(() => {});
                }
            } catch (error) {
                console.error(`Error dispatching string select menu interaction with customId ${interaction.customId}:`, error);
                await sendErrorReply('An error occurred while processing this menu selection.');
            }
            return;
        }

        // Các loại interaction khác nếu cần
    });
}