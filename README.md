# AutoPayBot 🤖💰

Bot Discord tự động hóa việc bán hàng và thanh toán trực tuyến với tích hợp PayOS. Hỗ trợ quản lý sản phẩm, tạo kênh thanh toán riêng tư và xử lý đơn hàng tự động.

## ✨ Tính năng chính

### 🛒 Quản lý sản phẩm
- **Tạo danh mục sản phẩm**: Tổ chức sản phẩm theo danh mục
- **Thêm/chỉnh sửa sản phẩm**: Quản lý tên, mô tả, giá cả
- **Quản lý kho hàng**: Theo dõi số lượng tồn kho
- **Hiển thị sản phẩm**: Giao diện đẹp với embed và button tương tác

### 💳 Hệ thống thanh toán
- **Tích hợp PayOS**: Thanh toán trực tuyến an toàn
- **Tạo kênh riêng tư**: Mỗi giao dịch có kênh riêng
- **QR Code thanh toán**: Tự động tạo mã QR
- **Webhook xử lý**: Cập nhật trạng thái đơn hàng real-time
- **Cooldown bảo vệ**: Chống spam tạo link thanh toán

### 🔧 Quản lý hệ thống
- **Phân quyền Admin**: Chỉ admin mới có thể quản lý
- **Logging**: Ghi log các giao dịch và hoạt động
- **Cấu hình kênh**: Thiết lập kênh mở/đóng cho thanh toán
- **Database tự động**: Tự động tạo bảng và cấu trúc DB

## 🚀 Cài đặt

### Yêu cầu hệ thống
- Node.js 16.0.0 trở lên
- MySQL/MariaDB
- Discord Bot Token
- PayOS API credentials

### 1. Clone repository
```bash
git clone <repository-url>
cd AutoPayBot
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình môi trường
Tạo file `.env` với nội dung:

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

### 4. Thiết lập Database
Bot sẽ tự động tạo database và các bảng cần thiết khi khởi động lần đầu.

### 5. Chạy bot
```bash
# Development
npm run dev

# Production
npm start
```

## 📋 Lệnh Discord

### Lệnh Slash Commands
- `/help` - Hiển thị danh sách lệnh
- `/createcategories` - Tạo danh mục sản phẩm
- `/addproduct` - Thêm sản phẩm mới
- `/addstock` - Thêm số lượng hàng tồn kho
- `/setcategory` - Thiết lập danh mục cho kênh thanh toán
- `/setlog` - Thiết lập kênh ghi log
- `/priceandpay` - Hiển thị sản phẩm và tạo thanh toán

### Prefix Commands
Tất cả slash commands cũng hỗ trợ prefix (mặc định: `!`)

## 🏗️ Cấu trúc dự án

```
AutoPayBot/
├── commands/
│   └── system/           # Các lệnh hệ thống
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
├── expressServer.ts      # Express server cho webhook
├── index.ts              # Entry point
├── payosUtils.ts         # PayOS utilities
├── webhookHandler.ts     # Webhook handler
└── package.json
```

## 💾 Database Schema

### Bảng chính
- `categories` - Danh mục sản phẩm
- `products` - Thông tin sản phẩm
- `orders` - Đơn hàng và trạng thái thanh toán
- `stock_categories` - Danh mục kho hàng
- `stock_items` - Sản phẩm trong kho
- `channel_categories` - Cấu hình kênh thanh toán
- `log_configs` - Cấu hình logging

## 🔄 Workflow thanh toán

1. **Khách hàng chọn sản phẩm** từ menu
2. **Bot tạo kênh riêng tư** cho giao dịch
3. **Tạo link PayOS** với QR code
4. **Khách hàng thanh toán** qua QR code
5. **Webhook nhận thông báo** từ PayOS
6. **Cập nhật trạng thái** đơn hàng tự động
7. **Gửi thông báo** và đóng kênh

## 🛡️ Bảo mật

- **Xác thực webhook**: Sử dụng HMAC-SHA256
- **Phân quyền**: Chỉ admin có thể quản lý
- **Kênh riêng tư**: Mỗi giao dịch có kênh riêng
- **Cooldown**: Chống spam tạo link thanh toán
- **Validation**: Kiểm tra dữ liệu đầu vào

## 🔧 Cấu hình PayOS

1. Đăng ký tài khoản tại [PayOS](https://payos.vn)
2. Tạo ứng dụng và lấy API credentials
3. Cấu hình webhook URL: `https://yourdomain.com/payos-webhook`
4. Thêm credentials vào file `.env`

## 📝 Logging

Bot ghi log các hoạt động quan trọng:
- Tạo đơn hàng
- Thanh toán thành công/thất bại
- Lỗi hệ thống
- Webhook events

## 🤝 Đóng góp

1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Push to branch
5. Tạo Pull Request

## 📄 License

MIT License - xem file [LICENSE](LICENSE) để biết thêm chi tiết.

## 🆘 Hỗ trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra logs trong console
2. Xác nhận cấu hình `.env` đúng
3. Kiểm tra kết nối database
4. Tạo issue trên GitHub

## 🔮 Tính năng sắp tới

- [ ] Hỗ trợ nhiều phương thức thanh toán
- [ ] Dashboard web quản lý
- [ ] Báo cáo doanh thu
- [ ] Hệ thống coupon/giảm giá
- [ ] Tích hợp email notifications
- [ ] Multi-language support

---

**Được phát triển với ❤️ bởi NMQ**