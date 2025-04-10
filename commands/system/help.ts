import { ChatInputCommandInteraction, Interaction, Message, EmbedBuilder } from 'discord.js';
import { ICommand } from '../../index';
import { getFooter } from '../../utils/embedFooter';

const command: ICommand = {
  data: {
    name: 'help',
    description: 'Hiển thị danh sách các lệnh',
    toJSON() {
      return {
        name: 'help',
        description: 'Hiển thị danh sách các lệnh',
      };
    },
  },
  name: 'help',
  aliases: ['h', 'commands'],

  async execute(interactionOrMessage: Interaction | Message): Promise<void> {
    try {
      const isInteraction = 'isChatInputCommand' in interactionOrMessage;

      let userName = '';
      let userAvatar = '';
      let guildName = '';
      let guildIcon = '';

      if (isInteraction) {
        const interaction = interactionOrMessage as ChatInputCommandInteraction;
        userName = interaction.user.username;
        userAvatar = interaction.user.displayAvatarURL();
        guildName = interaction.guild?.name || '';
        guildIcon = interaction.guild?.iconURL() || '';
      } else {
        const message = interactionOrMessage as Message;
        userName = message.author.username;
        userAvatar = message.author.displayAvatarURL();
        guildName = message.guild?.name || '';
        guildIcon = message.guild?.iconURL() || '';
      }

      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', hour12: true };
      const formattedTime = `Today at ${now.toLocaleString('en-US', options)}`;

      const helpText = `
✨ **Danh sách các lệnh hữu ích:** ✨

🔹 **\`/addproduct\`** ➕ — *Thêm sản phẩm và thao tác với danh mục*
🔹 **\`/addstock\`** 📦 — *Thêm số lượng hàng tồn kho*
🔹 **\`/createcategories\`** 🗂️ — *Tạo danh mục sản phẩm*
🔹 **\`/priceandpay\`** 💰 — *Quản lý giá và thanh toán*
🔹 **\`/setcategory\`** 🏷️ — *Thiết lập danh mục cho sản phẩm*
🔹 **\`/setlog\`** 📝 — *Thiết lập ghi log hệ thống*
🔹 **\`/help\`** ❓ — *Hiển thị danh sách các lệnh*
`;

      const embed = new EmbedBuilder()
        .setAuthor({ name: `👤 ${userName}`, iconURL: userAvatar })
        .setTitle('✨📚 HỆ THỐNG TRỢ GIÚP - HELP MENU 📚✨')
        .setThumbnail(guildIcon || null)
        .setDescription(helpText)
        .setFooter(getFooter(guildName, guildIcon || null))
        .setColor(0x00ae86);

      if (isInteraction) {
        const interaction = interactionOrMessage as ChatInputCommandInteraction;
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } else {
        const message = interactionOrMessage as Message;
        await message.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error in help command:', error);
    }
  },
};

export default command;
