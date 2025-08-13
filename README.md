# AutoPayBot 🤖💰

A Discord bot that automates online sales and payments with PayOS integration. Supports product management, private payment channels, and automatic order processing.

## ✨ Key Features

### 🛒 Product management
- **Create product categories**: Organise products into categories
- **Add/edit products**: Manage name, description, price
- **Inventory tracking**: Monitor stock levels
- **Display products**: Attractive embeds with interactive buttons

### 💳 Payment system
- **PayOS integration**: Secure online payments
- **Private channels**: Each transaction gets a dedicated channel
- **Payment QR codes**: Automatic QR code generation
- **Webhook processing**: Real-time order status updates
- **Cooldown protection**: Prevent spam when creating payment links

### 🔧 System management
- **Admin permissions**: Only admins can manage the bot
- **Logging**: Record transactions and actions
- **Channel configuration**: Configure open/closed payment channels
- **Automatic database setup**: Tables and structure created at first launch

## 🚀 Installation

### Requirements
- Node.js 16.0.0 or higher
- MySQL/MariaDB
- Discord Bot Token
- PayOS API credentials

### 1. Clone the repository
```bash
git clone <repository-url>
cd AutoPayBot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
Create a `.env` file with the following content:
```env
# Discord Bot
TOKEN=your_discord_bot_token
PREFIX=!

# Database
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=autopaybot
DB_PORT=3306

# PayOS
PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key
PAYOS_WEBHOOK_URL=https://yourdomain.com/payos-webhook

# Server
PORT=3001
```

### 4. Database setup
The bot automatically creates the database and required tables on first run.

### 5. Start the bot
```bash
# Development
npm run dev

# Production
npm start
```

## 📋 Discord Commands

### Slash Commands
- `/help` – Display the command list
- `/createcategories` – Create product categories
- `/addproduct` – Add a new product
- `/addstock` – Add stock quantity
- `/setcategory` – Set the payment channel category
- `/setlog` – Set the logging channel
- `/priceandpay` – Show products and create payment links

### Prefix Commands
All slash commands also support a prefix (default: `!`).

## 🏗️ Project Structure

```
AutoPayBot/
├── commands/
│   └── system/           # System commands
│       ├── addproduct.ts
│       ├── addstock.ts
│       ├── createcategories.ts
│       ├── help.ts
│       ├── priceandpay.ts
│       ├── setcategory.ts
│       └── setlog.ts
├── events/               # Event handlers
│   ├── guildCreate.ts
│   ├── guildDelete.ts
│   ├── interactionCreate.ts
│   ├── messageCreate.ts
│   └── ready.ts
├── handlers/             # Utility handlers
│   ├── registerCommands.ts
│   ├── updateBotPresence.ts
│   └── voiceStateHandler.ts
├── types/                # TypeScript interfaces
│   └── ICommand.ts
├── utils/                # Utility functions
│   └── embedFooter.ts
├── db.ts                 # Database configuration
├── expressServer.ts      # Express server for the webhook
├── index.ts              # Entry point
├── payosUtils.ts         # PayOS utilities
├── webhookHandler.ts     # Webhook handler
└── package.json
```

## 💾 Database Schema

### Main tables
- `categories` – Product categories
- `products` – Product information
- `orders` – Orders and payment status
- `stock_categories` – Inventory categories
- `stock_items` – Inventory items
- `channel_categories` – Payment channel configuration
- `log_configs` – Logging configuration

## 🔄 Payment Workflow

1. **Customer selects products** from the menu  
2. **Bot creates a private channel** for the transaction  
3. **Generate PayOS link** with QR code  
4. **Customer pays** via QR code  
5. **Webhook receives notification** from PayOS  
6. **Order status updates** automatically  
7. **Notification sent** and channel closed  

## 🛡️ Security

- **Webhook verification** using HMAC-SHA256  
- **Permissions**: only admins can manage the bot  
- **Private channels**: each transaction has its own channel  
- **Cooldown**: prevents spam when creating payment links  
- **Validation**: input data is validated  

## 🔧 PayOS Configuration

1. Register at [PayOS](https://payos.vn)  
2. Create an app and obtain API credentials  
3. Set up the webhook URL: `https://yourdomain.com/payos-webhook`  
4. Add the credentials to the `.env` file  

## 📝 Logging

The bot logs important activities:
- Order creation
- Successful/failed payments
- System errors
- Webhook events

## 🤝 Contributing

1. Fork the repository  
2. Create a feature branch  
3. Commit your changes  
4. Push to your branch  
5. Open a Pull Request  

## 📄 License

MIT License – see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter issues:
1. Check console logs  
2. Verify your `.env` configuration  
3. Ensure database connectivity  
4. Open an issue on GitHub  

## 🔮 Upcoming Features

- [ ] Support for additional payment methods  
- [ ] Web dashboard  
- [ ] Revenue reports  
- [ ] Coupon/discount system  
- [ ] Email notifications  
- [ ] Multi-language support  

---

**Built with ❤️ by NMQ**
