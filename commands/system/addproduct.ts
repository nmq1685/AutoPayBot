import {
  ChatInputCommandInteraction,
  Message,
  Interaction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import pool from '../../db';
import { ICommand } from '../../index';
import { getFooter } from '../../utils/embedFooter';

const command: ICommand = {
  data: {
    name: 'addproduct',
    description: 'Thêm sản phẩm và thao tác với danh mục',
    toJSON() {
      return {
        name: 'addproduct',
        description: 'Thêm sản phẩm và thao tác với danh mục',
      };
    },
  },
  name: 'addproduct',
  aliases: [],

  async execute(interactionOrMessage: Interaction | Message): Promise<void> {
    try {
      const isInteraction = 'isChatInputCommand' in interactionOrMessage;
      let guildId: string, userId: string;
      let guildName = '';
      let guildIcon = '';

      if (isInteraction) {
        const interaction = interactionOrMessage as ChatInputCommandInteraction;
        if (!interaction.guildId || !interaction.guild) {
          const embed = createEmbed(interaction, 'Lỗi', '🚫 Lệnh chỉ sử dụng trong máy chủ.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        if (!interaction.memberPermissions || !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
          const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        guildId = interaction.guildId;
        userId = interaction.user.id;
        guildName = interaction.guild.name;
        guildIcon = interaction.guild.iconURL() || '';
      } else {
        const message = interactionOrMessage as Message;
        if (!message.guild) {
          const embed = createEmbed(message, 'Lỗi', '🚫 Lệnh chỉ sử dụng trong máy chủ.');
          await message.reply({ embeds: [embed] });
          return;
        }
        if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const embed = createEmbed(message, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
          await message.reply({ embeds: [embed] });
          return;
        }
        guildId = message.guild.id;
        userId = message.author.id;
        guildName = message.guild.name;
        guildIcon = message.guild.iconURL() || '';
      }

      const [categories]: any = await pool.query('SELECT id, name FROM categories WHERE guildId = ?', [guildId]);
      if (!categories || categories.length === 0) {
        const embed = createEmbed(interactionOrMessage, 'Thông Báo', '❌ Chưa có danh mục nào. Vui lòng tạo danh mục trước.');
        if (isInteraction) {
          await (interactionOrMessage as ChatInputCommandInteraction).reply({ embeds: [embed], ephemeral: true });
        } else {
          await (interactionOrMessage as Message).reply({ embeds: [embed] });
        }
        return;
      }

      const options = categories.map((cat: any) => ({
        label: cat.name,
        value: String(cat.id),
      }));

      const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`addproduct:select_category:${userId}`)
          .setPlaceholder('👉 Chọn danh mục')
          .addOptions(options)
      );

      const embed = createEmbed(interactionOrMessage, 'Chọn Danh Mục', '👉 Vui lòng chọn danh mục muốn thao tác.');

      if (isInteraction) {
        await (interactionOrMessage as ChatInputCommandInteraction).reply({
          embeds: [embed],
          components: [selectMenu],
        });
      } else {
        await (interactionOrMessage as Message).reply({
          embeds: [embed],
          components: [selectMenu],
        });
      }
    } catch (error) {
      console.error('Error in addproduct execute:', error);
    }
  },

  async handleStringSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
    try {
      const [prefix, action, userId, ...rest] = interaction.customId.split(':');
      if (prefix !== 'addproduct' || userId !== interaction.user.id) return;

      if (action === 'select_category') {
        const categoryId = interaction.values[0];

        const embed = createEmbed(interaction, 'Quản Lý Sản Phẩm', '⚙️ Chọn hành động muốn thực hiện cho danh mục đã chọn.');

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`addproduct:add:${userId}:${categoryId}`)
            .setLabel('➕ Thêm sản phẩm')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`addproduct:delete:${userId}:${categoryId}`)
            .setLabel('🗑️ Xóa sản phẩm')
            .setStyle(ButtonStyle.Danger)
        );

        // Refresh dropdown menu (reset selection)
        const [categories]: any = await pool.query('SELECT id, name FROM categories WHERE guildId = ?', [interaction.guildId]);
        const options = categories.map((cat: any) => ({
          label: cat.name,
          value: String(cat.id),
        }));
        const refreshedMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addproduct:select_category:${userId}`)
            .setPlaceholder('👉 Chọn danh mục')
            .addOptions(options)
        );

        await interaction.reply({ content: '✅ Đã chọn danh mục!', ephemeral: true });
        await interaction.message.edit({ embeds: [embed], components: [refreshedMenu, buttons] });
      } else if (action === 'select_delete') {
        const categoryId = rest[0];
        const productId = interaction.values[0];

        const embed = createEmbed(interaction, 'Xác Nhận', '❓ Bạn có chắc chắn muốn xóa sản phẩm này?');

        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`addproduct:confirm_delete:${interaction.user.id}:${productId}`)
            .setLabel('✅ Xác nhận xóa')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`addproduct:cancel_delete:${interaction.user.id}:${productId}`)
            .setLabel('❌ Hủy')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [confirmRow] });
      }
    } catch (error) {
      console.error('Error in addproduct handleStringSelectMenuInteraction:', error);
    }
  },

  async handleButtonInteraction(interaction: ButtonInteraction) {
    try {
      const [prefix, action, userId, id] = interaction.customId.split(':');
      if (prefix !== 'addproduct' || userId !== interaction.user.id) return;

      if (action === 'add') {
        const categoryId = id;
        const modal = new ModalBuilder()
          .setCustomId(`addproduct:addmodal:${userId}:${categoryId}`)
          .setTitle('➕ Thêm sản phẩm');

        const nameInput = new TextInputBuilder()
          .setCustomId('product_name')
          .setLabel('Tên sản phẩm ✏️')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descriptionInput = new TextInputBuilder()
          .setCustomId('product_description')
          .setLabel('Mô tả sản phẩm 📄')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId('product_price')
          .setLabel('Giá sản phẩm 💲')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
        );

        await interaction.showModal(modal);
      } else if (action === 'delete') {
        const categoryId = id;
        const [products]: any = await pool.query('SELECT id, name FROM products WHERE guildId = ? AND categoryId = ?', [
          interaction.guildId,
          categoryId,
        ]);
        if (!products || products.length === 0) {
          const embed = createEmbed(interaction, 'Thông Báo', '❌ Không có sản phẩm nào để xóa trong danh mục này.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const options = products.map((p: any) => ({
          label: p.name,
          value: String(p.id),
        }));

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addproduct:select_delete:${interaction.user.id}:${categoryId}`)
            .setPlaceholder('👉 Chọn sản phẩm cần xóa')
            .addOptions(options)
        );

        await interaction.reply({ content: '👉 Chọn sản phẩm muốn xóa:', components: [selectMenu], ephemeral: true });
      } else if (action === 'confirm_delete') {
        const productId = id;
        try {
          await pool.query('DELETE FROM products WHERE id = ?', [productId]);
          const embed = createEmbed(interaction, 'Thành Công', '✅ Sản phẩm đã được xóa thành công!');
          await interaction.update({ embeds: [embed], components: [], content: '👉' });
        } catch (err) {
          console.error('Error deleting product:', err);
          const embed = createEmbed(interaction, 'Lỗi', '❌ Có lỗi xảy ra khi xóa sản phẩm.');
          await interaction.update({ embeds: [embed], components: [], content: '👉' });
        }
      } else if (action === 'cancel_delete') {
        const embed = createEmbed(interaction, 'Thông Báo', 'ℹ️ Hủy xóa sản phẩm.');
        await interaction.update({ embeds: [embed], components: [], content: '👉' });
      }
    } catch (error) {
      console.error('Error in addproduct handleButtonInteraction:', error);
    }
  },

  async handleModalSubmit(interaction: ModalSubmitInteraction) {
    try {
      const [prefix, action, userId, categoryId] = interaction.customId.split(':');
      if (prefix !== 'addproduct' || action !== 'addmodal' || userId !== interaction.user.id) return;

      const productName = interaction.fields.getTextInputValue('product_name');
      const productDescription = interaction.fields.getTextInputValue('product_description');
      const productPrice = interaction.fields.getTextInputValue('product_price');
      const price = parseFloat(productPrice);

      if (isNaN(price)) {
        const embed = createEmbed(interaction, 'Lỗi', '❌ Giá sản phẩm không hợp lệ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      try {
        await pool.query(
          'INSERT INTO products (guildId, categoryId, name, description, price) VALUES (?, ?, ?, ?, ?)',
          [interaction.guildId, categoryId, productName, productDescription, price]
        );
        const embed = createEmbed(interaction, 'Thành Công', '✅ Sản phẩm đã được thêm thành công!');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        console.error('Error inserting product:', err);
        const embed = createEmbed(interaction, 'Lỗi', '❌ Có lỗi xảy ra khi thêm sản phẩm.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      console.error('Error in addproduct handleModalSubmit:', error);
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
    .setTitle(`✨⭐ ${title.toUpperCase()} ⭐✨`)
    .setThumbnail(guild?.iconURL() || null)
    .setDescription(`**${title}**\n${description}`)
    .setFooter(getFooter(guild?.name || '', guild?.iconURL() || null))
    .setColor(0x00ae86);
}

export default command;
