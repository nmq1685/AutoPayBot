// db.ts
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, // Đảm bảo đã chỉ định tên cơ sở dữ liệu
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true, // Cho phép nhiều câu lệnh SQL trong một query
});

(async function initDB() {
  let connection;
  try {
    connection = await pool.getConnection(); // Lấy một kết nối từ pool
    console.log('Connected to database pool.');

    // Tạo database nếu chưa tồn tại
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    console.log(`Database '${process.env.DB_NAME}' checked/created.`);

    // Sử dụng database
    await connection.query(`USE \`${process.env.DB_NAME}\`;`);
    console.log(`Using database '${process.env.DB_NAME}'.`);

    // Tạo bảng categories để lưu danh mục sản phẩm
    await connection.query(`CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      INDEX guildId_idx (guildId)
    );`);
    console.log("Table 'categories' checked/created.");

    // Tạo bảng products để lưu sản phẩm, liên kết theo danh mục và id máy chủ (guildId)
    await connection.query(`CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(64) NOT NULL,
      categoryId INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT NULL, -- Cho phép null
      price DECIMAL(15, 2) NOT NULL, -- Tăng độ chính xác và phạm vi
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE,
      INDEX guildId_categoryId_idx (guildId, categoryId)
    );`);
    console.log("Table 'products' checked/created.");

    // Tạo bảng channel_categories để lưu trữ cấu hình danh mục cho kênh thanh toán
    await connection.query(`CREATE TABLE IF NOT EXISTS channel_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(64) NOT NULL UNIQUE,
      openCategoryId VARCHAR(64) NOT NULL,
      closedCategoryId VARCHAR(64) NOT NULL
    );`);
    console.log("Table 'channel_categories' checked/created.");

    // Tạo bảng log_configs để lưu trữ cấu hình kênh log cho các máy chủ
    await connection.query(`CREATE TABLE IF NOT EXISTS log_configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(64) NOT NULL UNIQUE,
      logChannelId VARCHAR(64) NOT NULL
    );`);
    console.log("Table 'log_configs' checked/created.");

    // === BẢNG MỚI CHO ĐƠN HÀNG ===
    await connection.query(`CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(64) NOT NULL,
      userId VARCHAR(64) NOT NULL,
      channelId VARCHAR(64) NOT NULL,
      productId INT NOT NULL,
      orderCode BIGINT NOT NULL UNIQUE, -- Dùng BIGINT cho orderCode từ Date.now()
      amount DECIMAL(15, 2) NOT NULL,
      payosPaymentLinkId VARCHAR(255) NULL, -- ID link thanh toán từ PayOS
      status ENUM('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED') NOT NULL DEFAULT 'PENDING',
      payosCreatedAt TIMESTAMP NULL, -- Thời gian tạo link PayOS (nếu có)
      payosPaidAt TIMESTAMP NULL, -- Thời gian thanh toán thành công (nếu có)
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT, -- Hoặc SET NULL nếu muốn giữ đơn hàng khi xóa sản phẩm
      INDEX guildId_userId_idx (guildId, userId),
      INDEX status_idx (status)
    );`);
    console.log("Table 'orders' checked/created.");
    // === KẾT THÚC BẢNG MỚI ===

    // === THÊM CỘT discordMessageId VÀO BẢNG orders NẾU CHƯA CÓ ===
    try {
      const alterQuery = 'ALTER TABLE orders ADD COLUMN discordMessageId VARCHAR(255) NULL DEFAULT NULL AFTER payosPaymentLinkId;';
      console.log(`Attempting to execute: ${alterQuery}`);
      await connection.query(alterQuery);
      console.log('✅ Successfully added discordMessageId column to orders table (if it did not exist).');
    } catch (alterError: any) {
      // Bỏ qua lỗi nếu cột đã tồn tại
      if (alterError.code === 'ER_DUP_FIELDNAME' || (alterError.message && alterError.message.includes('Duplicate column name'))) {
        console.warn('⚠️ Column discordMessageId already exists in orders table. Skipping ALTER query.');
      } else {
        // Log các lỗi khác
        console.error('❌ Error altering orders table:', alterError.message || alterError);
        // Không cần thoát, chỉ log lỗi
      }
    }

    // === THÊM CỘT paymentMessageId VÀO BẢNG orders NẾU CHƯA CÓ ===
    try {
      const alterQuery2 = 'ALTER TABLE orders ADD COLUMN paymentMessageId VARCHAR(255) NULL DEFAULT NULL AFTER discordMessageId;';
      console.log(`Attempting to execute: ${alterQuery2}`);
      await connection.query(alterQuery2);
      console.log('✅ Successfully added paymentMessageId column to orders table (if it did not exist).');
    } catch (alterError: any) {
      // Bỏ qua lỗi nếu cột đã tồn tại
      if (alterError.code === 'ER_DUP_FIELDNAME' || (alterError.message && alterError.message.includes('Duplicate column name'))) {
        console.warn('⚠️ Column paymentMessageId already exists in orders table. Skipping ALTER query.');
      } else {
        // Log các lỗi khác
        console.error('❌ Error altering orders table (paymentMessageId):', alterError.message || alterError);
        // Không cần thoát, chỉ log lỗi
      }
    }
    // === KẾT THÚC THÊM CỘT ===

    // === BẢNG MỚI CHO STOCK ===
    // Tạo bảng stock_categories để lưu danh mục kho
    await connection.query(`CREATE TABLE IF NOT EXISTS stock_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_guild_stock_name (guildId, name)
    );`);
    console.log("Table 'stock_categories' checked/created.");

    // Tạo bảng stock_items để lưu sản phẩm trong kho
    await connection.query(`CREATE TABLE IF NOT EXISTS stock_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guildId VARCHAR(255) NOT NULL,
      stockCategoryId INT NOT NULL,
      productId INT NOT NULL,
      value TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stockCategoryId) REFERENCES stock_categories(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    );`);
    console.log("Table 'stock_items' checked/created.");
    // === KẾT THÚC BẢNG STOCK ===


    console.log("✅ Database initialization complete. All tables are ready.");

  } catch (err) {
    console.error('❌ Error initializing database:', err);
    // Cân nhắc việc thoát ứng dụng nếu không thể khởi tạo DB
    // process.exit(1);
  } finally {
    if (connection) {
      connection.release(); // Luôn trả kết nối về pool
      console.log('Database connection released.');
    }
  }
})();

export default pool;
