import { Client, Guild } from 'discord.js';
import { updateBotPresence } from '../handlers/updateBotPresence';

export function registerGuildDeleteEvent(client: Client) {
    client.on('guildDelete', async (guild: Guild) => {
        console.log(`Left a guild: ${guild.name} (${guild.id})`);
        await updateBotPresence(client);
    });
}