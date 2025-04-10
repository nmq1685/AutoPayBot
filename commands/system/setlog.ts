import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import pool from '../../db';
import { getFooter } from '../../utils/embedFooter';

export const data = new SlashCommandBuilder()
  .setName('setlog')
  .setDescription('Cấu hình kênh nhận log cho máy chủ')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

function createEmbed(interaction: ChatInputCommandInteraction | ModalSubmitInteraction, title: string, description: string): EmbedBuilder {
  const user = interaction.user;
  const guild = interaction.guild;

  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
  const formattedTime = `Today at ${now.toLocaleString('en-US', options)}`;

  return new EmbedBuilder()
    .setAuthor({ name: `👤 ${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle(`📝 ${title}`)
    .setThumbnail(guild?.iconURL() || null)
    .setDescription(description)
    .setFooter(getFooter(guild?.name || '', guild?.iconURL() || null))
    .setColor(0x00ae86);
}

// Xử lý khi lệnh slash /setlog được gọi
export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    const guildId = interaction.guildId;
    let logChannelId = '';

    try {
      const [rows]: any = await pool.query("SELECT logChannelId FROM log_configs WHERE guildId = ?", [guildId]);
      if (rows.length > 0) {
        logChannelId = rows[0].logChannelId;
      }
    } catch (error) {
      console.error("Lỗi truy vấn DB:", error);
    }

    const modal = new ModalBuilder()
      .setCustomId('setlogModal')
      .setTitle('Cấu hình kênh log');

    const logChannelInput = new TextInputBuilder()
      .setCustomId('logChannelId')
      .setLabel('ID kênh log')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Nhập ID kênh log')
      .setRequired(true);

    if (logChannelId) {
      logChannelInput.setValue(logChannelId);
    }

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(logChannelInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in setlog execute:', error);
  }
}

// Xử lý khi modal được submit
export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  try {
    if (interaction.customId !== 'setlogModal') return;

    const guildId = interaction.guildId;
    const newLogChannelId = interaction.fields.getTextInputValue('logChannelId');

    try {
      const [rows]: any = await pool.query("SELECT * FROM log_configs WHERE guildId = ?", [guildId]);
      if (rows.length > 0) {
        await pool.query("UPDATE log_configs SET logChannelId = ? WHERE guildId = ?", [newLogChannelId, guildId]);
      } else {
        await pool.query("INSERT INTO log_configs (guildId, logChannelId) VALUES (?, ?)", [guildId, newLogChannelId]);
      }
      const embed = createEmbed(interaction, 'Thành Công', 'Cấu hình kênh log đã được cập nhật!');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error("Lỗi cập nhật DB:", error);
      const embed = createEmbed(interaction, 'Lỗi', 'Đã xảy ra lỗi khi cập nhật cấu hình.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('Error in setlog handleModalSubmit:', error);
  }
}
