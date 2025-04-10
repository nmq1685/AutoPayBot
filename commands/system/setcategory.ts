import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  Interaction,
  Message,
  EmbedBuilder,
} from 'discord.js';
import pool from '../../db';
import { getFooter } from '../../utils/embedFooter';

interface ICommand {
  data: SlashCommandBuilder;
  execute: (interactionOrMessage: Interaction | Message) => Promise<void>;
  handleModalSubmit?: (interaction: ModalSubmitInteraction) => Promise<void>;
}

function formatFooterTimestamp(): string {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `Today at ${time}`;
}

function createEmbed(interactionOrMessage: Interaction | Message, title: string, description: string): EmbedBuilder {
  const user = interactionOrMessage instanceof Message
    ? interactionOrMessage.author
    : (interactionOrMessage as ChatInputCommandInteraction).user;
  const guild = interactionOrMessage.guild;

  return new EmbedBuilder()
    .setColor('#0099ff')
    .setAuthor({ name: `👤 ${user.username}`, iconURL: user.displayAvatarURL() || undefined })
    .setTitle(`🏷️ ${title}`)
    .setThumbnail(guild?.iconURL() || null)
    .setDescription(`🔰 ${description}`)
    .setTimestamp()
    .setFooter(getFooter(guild?.name || 'Unknown Server', guild?.iconURL() || null));
}

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName('setcategory')
    .setDescription('⚙️ Thiết lập danh mục cho kênh thanh toán.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interactionOrMessage: Interaction | Message) {
    try {
      if (!interactionOrMessage.guild) return;
      if (!(interactionOrMessage instanceof ChatInputCommandInteraction)) return;

      if (!interactionOrMessage.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        const embed = createEmbed(interactionOrMessage, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
        await interactionOrMessage.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const guildId = interactionOrMessage.guildId;

      let existingConfig: { openCategoryId: string, closedCategoryId: string } | null = null;
      try {
        const [rows] = await pool.query<any[]>(
          'SELECT openCategoryId, closedCategoryId FROM channel_categories WHERE guildId = ?',
          [guildId]
        );
        if (rows.length > 0) {
          existingConfig = rows[0];
        }
      } catch (error) {
        console.error('Error fetching existing configuration:', error);
      }

      const modal = new ModalBuilder()
        .setCustomId('setcategory:modal')
        .setTitle('⚙️ Thiết lập danh mục cho kênh thanh toán');

      const openCategoryInput = new TextInputBuilder()
        .setCustomId('openCategoryId')
        .setLabel('Nhập ID danh mục mở')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ví dụ: 123456789012345678')
        .setRequired(true);

      if (existingConfig) {
        openCategoryInput.setValue(existingConfig.openCategoryId);
      }

      const closedCategoryInput = new TextInputBuilder()
        .setCustomId('closedCategoryId')
        .setLabel('Nhập ID danh mục đóng')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ví dụ: 987654321098765432')
        .setRequired(true);

      if (existingConfig) {
        closedCategoryInput.setValue(existingConfig.closedCategoryId);
      }

      const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(openCategoryInput);
      const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(closedCategoryInput);
      modal.addComponents(firstActionRow, secondActionRow);

      await interactionOrMessage.showModal(modal);
    } catch (error) {
      console.error('Error in setcategory execute:', error);
    }
  },

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    try {
      if (!interaction.guild) return;
      if (!interaction.customId.startsWith('setcategory:')) return;

      const guildId = interaction.guildId;
      const openCategoryId = interaction.fields.getTextInputValue('openCategoryId');
      const closedCategoryId = interaction.fields.getTextInputValue('closedCategoryId');

      await pool.query(
        `INSERT INTO channel_categories (guildId, openCategoryId, closedCategoryId)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE openCategoryId = VALUES(openCategoryId), closedCategoryId = VALUES(closedCategoryId)`,
        [guildId, openCategoryId, closedCategoryId]
      );

      const embed = createEmbed(interaction, 'Thành Công', `Danh mục mở: **${openCategoryId}**\nDanh mục đóng: **${closedCategoryId}**`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error handling modal submission in setcategory:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Đã xảy ra lỗi khi xử lý yêu cầu của bạn.', ephemeral: true }).catch(() => {});
      }
    }
  },
};

export default command;
