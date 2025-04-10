import { Client } from 'discord.js';
import { registerCommands } from '../handlers/registerCommands';
import { updateBotPresence } from '../handlers/updateBotPresence';

export function registerReadyEvent(client: Client) {
    client.once('ready', async () => {
        if (!client.user) {
            console.error('Client user is null on ready event.');
            return;
        }
        console.log('Bot is ready!');
        try {
            await registerCommands(client, process.env.TOKEN!);
            await updateBotPresence(client);
            console.log(`Discord Bot username: ${client.user.username}`);
        } catch (error) {
            console.error('Error during ready event:', error);
        }
    });
}