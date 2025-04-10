import { VoiceState } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import type { Client } from 'discord.js';

export async function handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
    client: Client
): Promise<void> {
    const connection = getVoiceConnection(newState.guild.id);
    if (
        connection &&
        newState.channelId === null && // User left a voice channel
        oldState.channelId !== null && // User was in a voice channel before
        oldState.channel?.members.size === 1 && // The bot was the only one left
        oldState.channel?.members.has(client.user!.id) // Ensure the bot is the member counted
    ) {
        console.log(
            `Bot left alone in channel ${oldState.channelId}, scheduling disconnect.`
        );
        setTimeout(() => {
            const currentConnection = getVoiceConnection(oldState.guild.id);
            if (
                currentConnection &&
                oldState.channel?.members.size === 1 &&
                oldState.channel?.members.has(client.user!.id)
            ) {
                console.log(`Disconnecting from ${oldState.channelId} due to inactivity.`);
                currentConnection.destroy();
            } else {
                console.log(`Disconnect cancelled for ${oldState.channelId}. Someone joined or bot left manually.`);
            }
        }, 30000);
    }
}