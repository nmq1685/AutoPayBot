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
  InteractionType,
} from 'discord.js';
import pool from '../../db';
import { ICommand } from '../../index';
import { getFooter } from '../../utils/embedFooter';

const command: ICommand = {
  data: {
    name: 'addstock',
    toJSON() {
      return {
        name: 'addstock',
        description: 'Quản lý kho hàng (stock) và sản phẩm trong kho.',
      };
    },
  },
  name: 'addstock',
  aliases: ['stock'],

  async execute(interactionOrMessage: Interaction | Message): Promise<void> {
    try {
      let interaction: ChatInputCommandInteraction | null = null;
      let message: Message | null = null;
      let guildId: string | null = null;
      let userId: string | null = null;

      if (
        interactionOrMessage.type === InteractionType.ApplicationCommand &&
        interactionOrMessage.isChatInputCommand()
      ) {
        interaction = interactionOrMessage;
        guildId = interaction.guildId;
        userId = interaction.user.id;
      } else if (interactionOrMessage instanceof Message) {
        message = interactionOrMessage;
        if (!message.guild || !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
          const embed = createEmbed(message, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này hoặc lệnh chỉ dùng trong server.');
          await message.reply({ embeds: [embed] });
          return;
        }
        guildId = message.guild.id;
        userId = message.author.id;
      } else {
        return;
      }

      if (!guildId || !userId) return;

      if (interaction) {
        const perms = interaction.member?.permissions;
        if (!perms || !(perms instanceof PermissionsBitField) || !perms.has(PermissionsBitField.Flags.Administrator)) {
          const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
      }

      const embed = createEmbed(interactionOrMessage, 'Quản Lý Kho Hàng', 'Chọn một hành động để thực hiện:');

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`addstock:create:${userId}`)
          .setLabel('➕ Tạo Stock')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`addstock:manage_items:${userId}`)
          .setLabel('✏️ Thêm/Xóa SP')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`addstock:edit:${userId}`)
          .setLabel('🔧 Sửa Stock')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`addstock:delete:${userId}`)
          .setLabel('🗑️ Xóa Stock')
          .setStyle(ButtonStyle.Danger)
      );

      if (interaction) {
        await interaction.reply({ embeds: [embed], components: [buttons] });
      } else if (message) {
        await message.reply({ embeds: [embed], components: [buttons] });
      }
    } catch (error) {
      console.error('Error in addstock execute:', error);
    }
  },

  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    try {
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const userId = parts[2] || parts[parts.length - 1];
      const guildId = interaction.guildId;

      // Kiểm tra xem người dùng có quyền quản trị hay không thay vì chỉ kiểm tra người gọi lệnh
      const perms = interaction.member?.permissions;
      if (!perms || !(perms instanceof PermissionsBitField) || !perms.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Lệnh này chỉ hoạt động trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (action === 'create') {
        const modal = new ModalBuilder()
          .setCustomId(`addstock:create_modal:${userId}`)
          .setTitle('➕ Tạo Danh Mục Stock Mới');

        const nameInput = new TextInputBuilder()
          .setCustomId('stock_category_name')
          .setLabel('Tên danh mục Stock ✏️')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));

        await interaction.showModal(modal);
      } else if (action === 'add_item') {
        // Xử lý thêm sản phẩm vào stock
        const categoryId = parts[2];

        // Lấy danh sách sản phẩm từ bảng products
        const [products]: any = await pool.query(
          'SELECT id, name FROM products WHERE guildId = ?',
          [guildId]
        );

        if (!products || products.length === 0) {
          const embed = createEmbed(interaction, 'Thông Báo', '❌ Chưa có sản phẩm nào. Vui lòng tạo sản phẩm trước bằng lệnh /addproduct.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        // Tạo menu chọn sản phẩm
        const options = products.map((product: any) => ({
          label: product.name,
          value: String(product.id),
        }));

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addstock:select_product:${categoryId}:${userId}`)
            .setPlaceholder('👉 Chọn sản phẩm để thêm vào stock')
            .addOptions(options)
        );

        const embed = createEmbed(interaction, 'Thêm Sản Phẩm Vào Stock', '👉 Vui lòng chọn sản phẩm để thêm vào stock:');
        await interaction.reply({ embeds: [embed], components: [selectMenu], ephemeral: true });
      } else if (action === 'delete_item_select') {
        // Xử lý chọn sản phẩm để xóa
        const categoryId = parts[2];

        // Lấy danh sách sản phẩm trong danh mục
        const [stockItems]: any = await pool.query(
          'SELECT id, value FROM stock_items WHERE guildId = ? AND stockCategoryId = ?',
          [guildId, categoryId]
        );

        if (!stockItems || stockItems.length === 0) {
          const embed = createEmbed(interaction, 'Thông Báo', '❌ Không có sản phẩm nào trong danh mục này.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const options = stockItems.map((item: any) => {
          let itemData;
          try {
            itemData = JSON.parse(item.value);
          } catch (e) {
            itemData = { name: 'Unknown Item' };
          }
          return {
            label: itemData.name || 'Unknown Item',
            value: String(item.id),
          };
        });

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addstock:confirm_delete_item:${categoryId}:${userId}`)
            .setPlaceholder('🔮 Chọn sản phẩm cần xóa')
            .addOptions(options)
        );

        const embed = createEmbed(interaction, 'Xóa Sản Phẩm', '🔮 Vui lòng chọn sản phẩm cần xóa:');
        await interaction.reply({ embeds: [embed], components: [selectMenu], ephemeral: true });
      } else if (['manage_items', 'edit', 'delete'].includes(action)) {
        const [stockCategories]: any = await pool.query(
          'SELECT id, name FROM stock_categories WHERE guildId = ?',
          [guildId]
        );
        if (!stockCategories || stockCategories.length === 0) {
          const embed = createEmbed(interaction, 'Thông Báo', '❌ Chưa có danh mục Stock nào.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const options = stockCategories.map((cat: any) => ({
          label: cat.name,
          value: String(cat.id),
        }));

        let nextAction = '';
        if (action === 'manage_items') nextAction = 'select_manage';
        else if (action === 'edit') nextAction = 'select_edit';
        else if (action === 'delete') nextAction = 'select_delete';

        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addstock:${nextAction}:${userId}`)
            .setPlaceholder('👉 Chọn danh mục Stock')
            .addOptions(options)
        );

        const embed = createEmbed(interaction, 'Chọn Danh Mục', '👉 Vui lòng chọn danh mục Stock.');

        await interaction.update({ embeds: [embed], components: [selectMenu] });
      }
    } catch (error) {
      console.error('Error in addstock handleButtonInteraction:', error);
    }
  },

  async handleStringSelectMenuInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
      const parts = interaction.customId.split(':');
      const action = parts[1];
      const userId = parts[2] || parts[parts.length - 1];
      const guildId = interaction.guildId;

      // Kiểm tra xem người dùng có quyền quản trị hay không thay vì chỉ kiểm tra người gọi lệnh
      const perms = interaction.member?.permissions;
      if (!perms || !(perms instanceof PermissionsBitField) || !perms.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Lệnh này chỉ hoạt động trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (action === 'select_manage') {
        const categoryId = interaction.values[0];

        const embed = createEmbed(interaction, 'Quản Lý Sản Phẩm Trong Stock', 'Chọn hành động:');

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`addstock:add_item:${categoryId}:${userId}`)
            .setLabel('➕ Thêm Sản phẩm')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`addstock:delete_item_select:${categoryId}:${userId}`)
            .setLabel('🗑️ Xóa sản phẩm')
            .setStyle(ButtonStyle.Danger)
        );

        // Refresh dropdown
        const [stockCategories]: any = await pool.query('SELECT id, name FROM stock_categories WHERE guildId = ?', [guildId]);
        const options = stockCategories.map((cat: any) => ({
          label: cat.name,
          value: String(cat.id),
        }));
        const refreshedMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`addstock:select_manage:${userId}`)
            .setPlaceholder('👉 Chọn danh mục Stock')
            .addOptions(options)
        );

        await interaction.reply({ content: '✅ Đã chọn danh mục!', ephemeral: true });
        await interaction.message.edit({ embeds: [embed], components: [refreshedMenu, buttons] });
      } else if (action === 'select_product') {
        // Xử lý chọn sản phẩm để thêm vào stock
        const categoryId = parts[2];
        const productId = interaction.values[0];

        // Lấy thông tin sản phẩm
        const [products]: any = await pool.query(
          'SELECT name FROM products WHERE id = ?',
          [productId]
        );

        if (!products || products.length === 0) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Không tìm thấy sản phẩm.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        const productName = products[0].name;

        // Hiển thị modal nhập số lượng
        const modal = new ModalBuilder()
          .setCustomId(`addstock:add_item_modal:${categoryId}:${productId}:${userId}`)
          .setTitle('➕ Thêm Sản Phẩm Vào Stock');

        const valueInput = new TextInputBuilder()
          .setCustomId('stock_item_value')
          .setLabel(`Giá trị/mã sản phẩm 💳`)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Nhập mã sản phẩm hoặc giá trị của sản phẩm');

        const quantityInput = new TextInputBuilder()
          .setCustomId('stock_item_quantity')
          .setLabel(`Số lượng 📊 (${productName})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue('1');

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput)
        );

        await interaction.showModal(modal);
      } else if (action === 'confirm_delete_item') {
        // Xử lý xóa sản phẩm đã chọn
        // Lấy ID sản phẩm đã chọn
        const itemId = interaction.values[0];

        try {
          // Lấy thông tin sản phẩm trước khi xóa
          const [items]: any = await pool.query(
            'SELECT value FROM stock_items WHERE id = ? AND guildId = ?',
            [itemId, guildId]
          );

          if (!items || items.length === 0) {
            const embed = createEmbed(interaction, 'Lỗi', '❌ Không tìm thấy sản phẩm.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }

          let itemData;
          try {
            itemData = JSON.parse(items[0].value);
          } catch (e) {
            itemData = { name: 'Unknown Item' };
          }
          const itemName = itemData.name || 'Unknown Item';

          // Xóa sản phẩm
          await pool.query('DELETE FROM stock_items WHERE id = ?', [itemId]);

          const embed = createEmbed(interaction, 'Thành Công', `✅ Đã xóa sản phẩm: **${itemName}**`);
          await interaction.update({ embeds: [embed], components: [] });
        } catch (err) {
          console.error('Error deleting stock item:', err);
          const embed = createEmbed(interaction, 'Lỗi', '❌ Có lỗi xảy ra khi xóa sản phẩm.');
          await interaction.update({ embeds: [embed], components: [] });
        }
      }
    } catch (error) {
      console.error('Error in addstock handleStringSelectMenuInteraction:', error);
    }
  },

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    try {
      const parts = interaction.customId.split(':');
      const action = parts[1];
      // userId không cần thiết vì chúng ta đã kiểm tra quyền quản trị
      const guildId = interaction.guildId;

      // Kiểm tra xem người dùng có quyền quản trị hay không thay vì chỉ kiểm tra người gọi lệnh
      const perms = interaction.member?.permissions;
      if (!perms || !(perms instanceof PermissionsBitField) || !perms.has(PermissionsBitField.Flags.Administrator)) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Bạn không có quyền quản trị để sử dụng lệnh này.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (!guildId) {
        const embed = createEmbed(interaction, 'Lỗi', '🚫 Lệnh này chỉ hoạt động trong máy chủ.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (action === 'create_modal') {
        const stockName = interaction.fields.getTextInputValue('stock_category_name').trim();
        if (!stockName) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Tên danh mục Stock không được để trống.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        try {
          const [existing]: any = await pool.query(
            'SELECT id FROM stock_categories WHERE guildId = ? AND name = ?',
            [guildId, stockName]
          );
          if (existing.length > 0) {
            const embed = createEmbed(interaction, 'Lỗi', `❌ Danh mục Stock "${stockName}" đã tồn tại.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }

          await pool.query('INSERT INTO stock_categories (guildId, name) VALUES (?, ?)', [guildId, stockName]);
          const embed = createEmbed(interaction, 'Thành Công', `✅ Đã tạo danh mục Stock: **${stockName}**`);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          console.error('Error inserting stock category:', err);
          const embed = createEmbed(interaction, 'Lỗi', '❌ Có lỗi xảy ra khi tạo danh mục Stock.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } else if (action === 'add_item_modal') {
        const categoryId = parts[2];
        const productId = parts[3];
        const itemValue = interaction.fields.getTextInputValue('stock_item_value').trim();
        const quantityStr = interaction.fields.getTextInputValue('stock_item_quantity').trim();
        const quantity = parseInt(quantityStr, 10);

        if (!itemValue) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Giá trị/mã sản phẩm không được để trống.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        if (isNaN(quantity) || quantity <= 0) {
          const embed = createEmbed(interaction, 'Lỗi', '❌ Số lượng phải là số nguyên dương.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        try {
          // Kiểm tra xem danh mục có tồn tại không
          const [categories]: any = await pool.query(
            'SELECT id FROM stock_categories WHERE id = ? AND guildId = ?',
            [categoryId, guildId]
          );

          if (!categories || categories.length === 0) {
            const embed = createEmbed(interaction, 'Lỗi', '❌ Danh mục Stock không tồn tại.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }

          // Kiểm tra xem sản phẩm có tồn tại không
          const [products]: any = await pool.query(
            'SELECT id, name FROM products WHERE id = ? AND guildId = ?',
            [productId, guildId]
          );

          if (!products || products.length === 0) {
            const embed = createEmbed(interaction, 'Lỗi', '❌ Sản phẩm không tồn tại.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
          }

          const productName = products[0].name;

          // Thêm sản phẩm vào stock
          for (let i = 0; i < quantity; i++) {
            await pool.query(
              'INSERT INTO stock_items (guildId, stockCategoryId, productId, value) VALUES (?, ?, ?, ?)',
              [guildId, categoryId, productId, itemValue]
            );
          }

          const embed = createEmbed(interaction, 'Thành Công', `✅ Đã thêm **${quantity}** sản phẩm **${productName}** vào stock.`);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (err) {
          console.error('Error adding stock item:', err);
          const embed = createEmbed(interaction, 'Lỗi', '❌ Có lỗi xảy ra khi thêm sản phẩm.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Error in addstock handleModalSubmit:', error);
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

  // Không cần formattedTime vì chúng ta sử dụng getFooter

  return new EmbedBuilder()
    .setAuthor({ name: `👤 ${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle(`✨📦✨ ${title.toUpperCase()} ✨📦✨`)
    .setThumbnail(guild?.iconURL() || null)
    .setDescription(`**${title}**\n${description}`)
    .setFooter(getFooter(guild?.name || '', guild?.iconURL() || null))
    .setColor(0x3498db);
}

export default command;
