import { Client, Guild } from 'discord.js';
import { updateBotPresence } from '../handlers/updateBotPresence';

export function registerGuildCreateEvent(client: Client) {
    client.on('guildCreate', async (guild: Guild) => {
        console.log(`Joined a new guild: ${guild.name} (${guild.id})`);
        await updateBotPresence(client);
    });
}