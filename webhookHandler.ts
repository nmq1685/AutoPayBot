import express, { Request, Response } from 'express';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { isValidSignatureManual } from './payosUtils';
import { getOrderByOrderCode, updateOrderStatus } from './commands/system/priceandpay';

/**
 * Đăng ký route webhook PayOS vào Express app
 * @param app Express app
 * @param client Discord client
 * @param pool Database pool
 * @param PAYOS_CHECKSUM_KEY Checksum key để xác thực webhook
 */
export function registerWebhookRoute(
    app: express.Express,
    client: Client,
    pool: any,
    PAYOS_CHECKSUM_KEY: string
) {
    app.post('/payos-webhook', async (req: Request, res: Response): Promise<void> => {
        console.log('[Webhook] Received request:', req.method, req.url);
        console.log('[Webhook] Body:', JSON.stringify(req.body, null, 2));

        const webhookData = req.body;
        const receivedSignature = webhookData.signature;

        if (!webhookData || !webhookData.data || !receivedSignature) {
            console.error('[Webhook] Invalid webhook data or missing signature.');
            res.status(400).send({ success: false, message: 'Invalid data or signature.' });
            return;
        }

        if (!PAYOS_CHECKSUM_KEY) {
            console.error('[Webhook] PAYOS_CHECKSUM_KEY is not configured.');
            res.status(500).send({ success: false, message: 'Webhook verification key not configured.' });
            return;
        }

        let isValid = false;
        try {
            isValid = isValidSignatureManual(webhookData.data, receivedSignature, PAYOS_CHECKSUM_KEY);
            console.log(`[Webhook Verify Manual] Verification result: ${isValid}`);
        } catch (error) {
            console.error('[Webhook] Error during manual signature verification:', error);
            isValid = false;
        }

        if (!isValid) {
            console.error('[Webhook] Invalid signature.');
            res.status(400).send({ success: false, message: 'Invalid signature.' });
            return;
        }

        console.log('[Webhook] Signature verified successfully.');

        try {
            const paymentData = webhookData.data;

            if (paymentData.code === '00') {
                console.log(`[Webhook] Payment success for orderCode: ${paymentData.orderCode}`);
                const orderCode = Number(paymentData.orderCode);

                const order = await getOrderByOrderCode(orderCode);

                if (!order) {
                    console.warn(`[Webhook] Order not found in DB for orderCode: ${orderCode}`);
                    res.status(200).send({ success: true, message: 'Order not found, but webhook acknowledged.' });
                    return;
                }

                if (order.status === 'PENDING' && order.discordMessageId && order.channelId) {
                    console.log(`[Webhook] Processing PENDING order ID: ${order.id}, Message ID: ${order.discordMessageId}, Channel ID: ${order.channelId}`);

                    const paymentTime = paymentData.transactionDateTime ? new Date(paymentData.transactionDateTime) : new Date();
                    const updateSuccess = await updateOrderStatus(orderCode, 'PAID', order.payosPaymentLinkId, paymentTime);

                    if (updateSuccess) {
                        console.log(`[Webhook] DB status updated to PAID for orderCode: ${orderCode}`);

                        try {
                            const channel = await client.channels.fetch(order.channelId).catch(err => {
                                console.error(`[Webhook] Failed to fetch channel ${order.channelId}:`, err);
                                return null;
                            });

                            if (channel instanceof TextChannel) {
                                const message = await channel.messages.fetch(order.discordMessageId).catch(err => {
                                    console.error(`[Webhook] Failed to fetch message ${order.discordMessageId} in channel ${channel.id}:`, err);
                                    return null;
                                });

                                if (message && message.editable) {
                                    const originalEmbed = message.embeds[0];
                                    const successEmbed = new EmbedBuilder(originalEmbed?.toJSON() ?? {})
                                        .setTitle(`✅ Thanh Toán Thành Công - ${originalEmbed?.title?.replace('💳 Thanh Toán - ', '') ?? 'Sản phẩm'}`)
                                        .setColor(0x00ff00)
                                        .setDescription(
                                            `🎉 Đơn hàng **#${orderCode}** đã được thanh toán thành công!\n\n` +
                                            (originalEmbed?.description?.split('\n\n')[0] ?? `**Sản phẩm:** Unknown\n**Giá:** Unknown`) +
                                            `\n\nCảm ơn bạn đã mua hàng!`
                                        )
                                        .setImage(null)
                                        .setFields([])
                                        .setTimestamp();

                                    let deliveryMessage = 'Cảm ơn bạn đã mua hàng!';
                                    let dmSuccessful = false;

                                    try {
                                        const [stockItems]: any = await pool.query(
                                            "SELECT id, value FROM stock_items WHERE guildId = ? AND productId = ? ORDER BY RAND() LIMIT 1",
                                            [order.guildId, order.productId]
                                        );

                                        if (stockItems && stockItems.length > 0) {
                                            const selectedStockItem = stockItems[0];

                                            try {
                                                const buyer = await client.users.fetch(order.userId);
                                                await buyer.send(`🎉 Cảm ơn bạn đã mua hàng! Đây là thông tin sản phẩm của bạn (Đơn hàng #${orderCode}):\n\`\`\`\n${selectedStockItem.value}\n\`\`\``);
                                                console.log(`[Webhook] Sent stock item via DM to user ${order.userId}`);
                                                dmSuccessful = true;

                                                try {
                                                    await pool.query("DELETE FROM stock_items WHERE id = ?", [selectedStockItem.id]);
                                                    console.log(`[Webhook] Deleted stock item ID ${selectedStockItem.id}`);
                                                    deliveryMessage = 'Cảm ơn bạn đã mua hàng! Sản phẩm đã được gửi qua tin nhắn riêng (DM).';
                                                } catch (deleteError) {
                                                    console.error(`[Webhook] Failed to delete stock item ID ${selectedStockItem.id}:`, deleteError);
                                                    deliveryMessage = 'Cảm ơn bạn đã mua hàng! Sản phẩm đã được gửi qua DM, nhưng có lỗi khi cập nhật kho.';
                                                }
                                            } catch (dmError) {
                                                console.error(`[Webhook] Failed to DM user ${order.userId}:`, dmError);
                                                deliveryMessage = 'Cảm ơn bạn đã mua hàng! Không thể gửi sản phẩm qua DM. Vui lòng liên hệ hỗ trợ.';
                                            }
                                        } else {
                                            console.log(`[Webhook] No stock items found for product ${order.productId}.`);

                                            try {
                                                const infoEmbed = new EmbedBuilder()
                                                    .setColor(0x0099ff)
                                                    .setTitle('📝 Nhập Thông Tin Đơn Hàng')
                                                    .setDescription('Sản phẩm đã hết hàng trong kho.\nVui lòng nhấn nút bên dưới để nhập thông tin nhận hàng.')
                                                    .setTimestamp();

                                                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

                                                const infoButton = new ButtonBuilder()
                                                    .setCustomId(`webhook:collect_info:${order.id}:${order.userId}`)
                                                    .setLabel('Nhập Thông Tin')
                                                    .setStyle(ButtonStyle.Primary);

                                                const row = new ActionRowBuilder().addComponents(infoButton);

                                                await (channel as any).send({ content: `<@${order.userId}>`, embeds: [infoEmbed], components: [row] });
                                                console.log(`[Webhook] Sent info request embed for order ${order.id}`);
                                            } catch (infoErr) {
                                                console.error(`[Webhook] Failed to send info request embed:`, infoErr);
                                            }
                                        }
                                    } catch (stockErr) {
                                        console.error(`[Webhook] Error checking stock:`, stockErr);
                                        deliveryMessage = 'Cảm ơn bạn đã mua hàng! Có lỗi khi kiểm tra kho. Vui lòng liên hệ hỗ trợ.';
                                    }

                                    successEmbed.setDescription(
                                        `🎉 Đơn hàng **#${orderCode}** đã được thanh toán thành công!\n\n` +
                                        (originalEmbed?.description?.split('\n\n')[0] ?? `**Sản phẩm:** Unknown\n**Giá:** Unknown`) +
                                        `\n\n${deliveryMessage}`
                                    );

                                    await message.edit({ embeds: [successEmbed], components: message.components });
                                    console.log(`[Webhook] Updated Discord message ${order.discordMessageId}`);

                                    // Nếu có paymentMessageId, cập nhật luôn embed thanh toán VietQR
                                    if (order.paymentMessageId) {
                                        try {
                                            const paymentMsg = await channel.messages.fetch(order.paymentMessageId);
                                            if (paymentMsg) {
                                                const embeds = paymentMsg.embeds;
                                                if (embeds.length > 0) {
                                                    const paymentEmbed = EmbedBuilder.from(embeds[0]);
                                                    paymentEmbed.setColor(0x00ff00);
                                                    paymentEmbed.setDescription('✅ Đơn hàng này đã được thanh toán thành công. Cảm ơn bạn!');
                                                    paymentEmbed.setImage(null); // Bỏ ảnh QR code
                                                    await paymentMsg.edit({ embeds: [paymentEmbed], components: [] });
                                                    console.log(`[Webhook] Updated payment instruction message ${order.paymentMessageId}`);
                                                }
                                            }
                                        } catch (err) {
                                            console.error(`[Webhook] Failed to update payment instruction message ${order.paymentMessageId}:`, err);
                                        }
                                    }

                                    const [remainingStock]: [any[], any] = await pool.query(
                                        "SELECT 1 FROM stock_items WHERE guildId = ? AND productId = ? LIMIT 1",
                                        [order.guildId, order.productId]
                                    );

                                    if (dmSuccessful || remainingStock.length === 0) {
                                        await channel.send(`✅ Thanh toán cho đơn hàng **#${orderCode}** đã được xác nhận! Cảm ơn <@${order.userId}>.`).catch(err => {
                                            console.error(`[Webhook] Failed to send confirmation message:`, err);
                                        });
                                    } else {
                                        await channel.send(`⚠️ Thanh toán thành công, nhưng không thể gửi sản phẩm qua DM cho <@${order.userId}>.`).catch(err => {
                                            console.error(`[Webhook] Failed to send DM failure notice:`, err);
                                        });
                                    }
                                }
                            }
                        } catch (discordError) {
                            console.error(`[Webhook] Error updating Discord message:`, discordError);
                        }
                    } else {
                        console.error(`[Webhook] Failed to update DB status for orderCode: ${orderCode}`);
                    }
                } else if (order.status !== 'PENDING') {
                    console.log(`[Webhook] Order ${orderCode} already processed (status: ${order.status}).`);
                } else {
                    console.warn(`[Webhook] Order ${orderCode} missing discordMessageId or channelId.`);
                }
            } else {
                console.log(`[Webhook] Received non-success status (${paymentData.code}) for orderCode: ${paymentData.orderCode}`);
            }

            res.status(200).send({ success: true });
        } catch (error) {
            console.error('[Webhook] Error processing webhook data:', error);
            res.status(500).send({ success: false, message: 'Internal server error.' });
        }
    });
}
