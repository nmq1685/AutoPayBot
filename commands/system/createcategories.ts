import {
  ChatInputCommandInteraction,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SelectMenuBuilder,
  EmbedBuilder,
  Interaction,
  ModalSubmitInteraction,
  MessageComponentInteraction,
  SelectMenuInteraction,
  ComponentType,
  Client,
  GuildMember,
  PermissionsBitField,
  ButtonInteraction,
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import pool from '../../db';
import { getFooter } from '../../utils/embedFooter';

const createCategories = {
  data: new SlashCommandBuilder()
    .setName('createcategories')
    .setDescription('Quản lý danh mục')
    .toJSON(),
  name: 'createcategories',

  async execute(interactionOrMessage: Interaction | Message) {
    try {
      let userId: string;
      let client: Client;
      let guildId: string | null;
      let member: GuildMember | null;

      if ('isChatInputCommand' in interactionOrMessage && interactionOrMessage.isChatInputCommand()) {
        userId = interactionOrMessage.user.id;
        client = interactionOrMessage.client;
        guildId = interactionOrMessage.guildId;
        member = interactionOrMessage.member as GuildMember;
      } else {
        userId = (interactionOrMessage as Message).author.id;
        client = (interactionOrMessage as Message).client;
        guildId = (interactionOrMessage as Message).guildId;
        member = (interactionOrMessage as Message).member as GuildMember;
      }

      if (!guildId) throw new Error('Lệnh này chỉ sử dụng được trong máy chủ.');
      if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        throw new Error('Chỉ quản trị viên mới có thể sử dụng lệnh này.');
      }

      const embed = createEmbed(interactionOrMessage, 'Quản Lý Danh Mục', 'Chọn một hành động bên dưới:');

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('createcategories:create')
          .setLabel('Tạo danh mục')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('➕'),
        new ButtonBuilder()
          .setCustomId('createcategories:delete')
          .setLabel('Xóa danh mục')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId('createcategories:edit')
          .setLabel('Chỉnh danh mục')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✏️')
      );

      let replyMsg;
      if ('isChatInputCommand' in interactionOrMessage && interactionOrMessage.isChatInputCommand()) {
        replyMsg = await interactionOrMessage.reply({ embeds: [embed], components: [buttons], fetchReply: true });
      } else {
        replyMsg = await (interactionOrMessage as Message).reply({ embeds: [embed], components: [buttons] });
      }

      const collector = replyMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000,
        filter: (i: MessageComponentInteraction) => i.user.id === userId,
      });

      collector.on('end', async () => {
        try {
          const disabledRows = replyMsg.components.map((row: any) => {
            const newRow = new ActionRowBuilder<ButtonBuilder>();
            row.components.forEach((component: any) => {
              const button = ButtonBuilder.from(component);
              if (!button.data.disabled) button.setDisabled(true);
              newRow.addComponents(button);
            });
            return newRow;
          });
          await replyMsg.edit({ components: disabledRows.map(r => r.toJSON()) });
        } catch (err) {
          console.error('Lỗi khi vô hiệu hóa nút:', err);
        }
      });
    } catch (err) {
      console.error('Lỗi trong createcategories execute:', err);
      const embed = createEmbed(interactionOrMessage, 'Lỗi', err instanceof Error ? err.message : 'Lỗi không xác định.');
      if ('isChatInputCommand' in interactionOrMessage && interactionOrMessage.isChatInputCommand()) {
        await interactionOrMessage.reply({ embeds: [embed], ephemeral: true });
      } else {
        await (interactionOrMessage as Message).reply({ embeds: [embed] });
      }
    }
  },

  async handleButtonInteraction(interaction: ButtonInteraction) {
    try {
      const subId = interaction.customId.split(':')[1];
      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', 'Lệnh này chỉ sử dụng được trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const member = await interaction.guild?.members.fetch(userId).catch(() => null);
      if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', 'Chỉ quản trị viên mới có thể sử dụng chức năng này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subId === 'create') {
        const modal = new ModalBuilder()
          .setTitle('Tạo Danh Mục')
          .setCustomId('createcategories:modal_createCategory');
        const input = new TextInputBuilder()
          .setCustomId('categoryName')
          .setLabel('Tên danh mục')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
      } else if (subId === 'delete' || subId === 'edit') {
        const [rows]: any = await pool.query('SELECT id, name FROM categories WHERE guildId = ?', [guildId]);
        const categories = rows as Array<{ id: number; name: string }>;
        if (categories.length === 0) {
          const embed = createEmbed(interaction, 'Thông Báo', '❌ Không có danh mục nào.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        const options = categories.map(cat => ({ label: cat.name, value: String(cat.id) }));
        const selectMenu = new SelectMenuBuilder()
          .setCustomId(`createcategories:select_${subId}Category`)
          .setPlaceholder('Chọn danh mục')
          .addOptions(options);
        const selectRow = new ActionRowBuilder<SelectMenuBuilder>().addComponents(selectMenu);
        const embed = createEmbed(interaction, 'Chọn Danh Mục', '👉 Vui lòng chọn danh mục.');
        await interaction.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
      }
    } catch (err) {
      console.error('Lỗi trong createcategories handleButtonInteraction:', err);
      if (!interaction.replied) {
        const embed = createEmbed(interaction, 'Lỗi', 'Đã xảy ra lỗi khi xử lý nút.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },

  async handleStringSelectMenuInteraction(interaction: SelectMenuInteraction) {
    try {
      const subId = interaction.customId.split(':')[1];
      const guildId = interaction.guildId;

      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', 'Lệnh này chỉ sử dụng được trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', 'Chỉ quản trị viên mới có thể sử dụng chức năng này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subId === 'select_deleteCategory') {
        const selectedId = interaction.values[0];
        const [rows]: any = await pool.query('SELECT id, name FROM categories WHERE guildId = ?', [guildId]);
        const categories = rows as Array<{ id: number; name: string }>;
        const category = categories.find(c => String(c.id) === selectedId);
        if (!category) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Danh mục không tồn tại.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('createcategories:confirm_deleteCategory')
            .setLabel('Xác nhận')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('createcategories:cancel_deleteCategory')
            .setLabel('Hủy')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
        );
        const embed = createEmbed(interaction, 'Xác Nhận', `⚠️ Bạn có chắc chắn muốn xóa danh mục **${category.name}**?\nID: ${category.id}`);
        await interaction.reply({ embeds: [embed], components: [confirmRow], ephemeral: true });
      } else if (subId === 'select_editCategory') {
        const selectedId = interaction.values[0];
        const [rows]: any = await pool.query('SELECT id, name FROM categories WHERE guildId = ?', [guildId]);
        const categories = rows as Array<{ id: number; name: string }>;
        const category = categories.find(c => String(c.id) === selectedId);
        if (!category) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Danh mục không tồn tại.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        const modal = new ModalBuilder()
          .setTitle('Chỉnh sửa Danh Mục')
          .setCustomId(`createcategories:modal_editCategory_${selectedId}`);
        const input = new TextInputBuilder()
          .setCustomId('newCategoryName')
          .setLabel('Tên danh mục mới')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(category.name);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        await interaction.showModal(modal);
      }
    } catch (err) {
      console.error('Lỗi trong createcategories handleStringSelectMenuInteraction:', err);
      if (!interaction.replied) {
        const embed = createEmbed(interaction, 'Lỗi', 'Đã xảy ra lỗi khi xử lý menu.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    try {
      const customId = interaction.customId;
      const guildId = interaction.guildId;

      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', 'Lệnh này chỉ sử dụng được trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
      if (!member || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', 'Chỉ quản trị viên mới có thể sử dụng chức năng này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (customId === 'createcategories:modal_createCategory') {
        const categoryName = interaction.fields.getTextInputValue('categoryName');
        await pool.query('INSERT INTO categories (guildId, name) VALUES (?, ?)', [guildId, categoryName]);
        const embed = createEmbed(interaction, 'Thành Công', `✅ Danh mục **${categoryName}** đã được tạo thành công!`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (customId.startsWith('createcategories:modal_editCategory_')) {
        const idPart = customId.replace('createcategories:modal_editCategory_', '');
        const newName = interaction.fields.getTextInputValue('newCategoryName');
        await pool.query('UPDATE categories SET name = ? WHERE id = ? AND guildId = ?', [newName, idPart, guildId]);
        const embed = createEmbed(interaction, 'Thành Công', `✏️ Danh mục đã được cập nhật thành **${newName}**.`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (err) {
      console.error('Lỗi trong createcategories handleModalSubmit:', err);
      if (!interaction.replied) {
        const embed = createEmbed(interaction, 'Lỗi', 'Đã xảy ra lỗi khi xử lý modal.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};

function createEmbed(
  interactionOrMessage: Interaction | Message,
  title: string,
  description: string
): EmbedBuilder {
  const isInteraction = 'isChatInputCommand' in interactionOrMessage;
  const user = isInteraction
    ? (interactionOrMessage as ChatInputCommandInteraction).user
    : (interactionOrMessage as Message).author;
  const guild = isInteraction
    ? (interactionOrMessage as ChatInputCommandInteraction).guild
    : (interactionOrMessage as Message).guild;

  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
  const formattedTime = `Today at ${now.toLocaleString('en-US', options)}`;

  return new EmbedBuilder()
    .setAuthor({ name: `👤 ${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle(`✨🛠️✨ ${title.toUpperCase()} ✨🛠️✨`)
    .setThumbnail(guild?.iconURL() || null)
    .setDescription(`**${title}**\n${description}`)
    .setFooter(getFooter(guild?.name || '', guild?.iconURL() || null))
    .setColor('#0099ff');
}

export default createCategories;
