import { Client, ActivityType } from 'discord.js';

export async function updateBotPresence(client: Client): Promise<void> {
    try {
        const guilds = await client.guilds.fetch();
        let totalMembers = 0;
        for (const guild of guilds.values()) {
            const fetchedGuild = await guild.fetch();
            totalMembers += fetchedGuild.memberCount;
        }
        client.user?.setActivity(`with ${totalMembers} members`, {
            type: ActivityType.Playing,
        });
    } catch (error) {
        console.error('Error updating bot presence:', error);
    }
}