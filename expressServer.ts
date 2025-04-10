import express, { Request } from 'express';
import { Client } from 'discord.js';
import { registerWebhookRoute } from './webhookHandler';

/**
 * Khởi tạo và chạy Express server cho webhook PayOS
 * @param client Discord client
 * @param pool Database pool
 * @param PAYOS_CHECKSUM_KEY Checksum key để xác thực webhook
 * @param port Cổng server (default 3001)
 * @returns server instance
 */
export function startExpressServer(
    client: Client,
    pool: any,
    PAYOS_CHECKSUM_KEY: string,
    port: number | string = 3001
) {
    const app = express();

    // Middleware parse JSON + lưu raw body để xác thực chữ ký
    app.use(express.json({
        verify: (req: Request & { rawBody?: Buffer }, res, buf) => {
            req.rawBody = buf;
        }
    }));

    // Đăng ký route webhook
    registerWebhookRoute(app, client, pool, PAYOS_CHECKSUM_KEY);

    const server = app.listen(port, () => {
        console.log(`🚀 PayOS Webhook server listening on port ${port}`);
    });

    return { app, server };
}
