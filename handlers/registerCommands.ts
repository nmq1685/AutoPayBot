import { REST, Routes, Client } from 'discord.js';
import type { ICommand } from '../types/ICommand';

export async function registerCommands(client: Client, token: string): Promise<void> {
    const commands = Array.from((client.commands as Map<string, ICommand>).values()).map((cmd: ICommand) => {
        if (cmd.data && typeof cmd.data.toJSON === 'function') {
            return cmd.data.toJSON();
        } else if (cmd.data) {
            return cmd.data;
        }
        return {};
    });
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        if (!client.user) throw new Error('Client user is not available yet.');
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: commands,
        });
        console.log('Global commands registered successfully.');
    } catch (error) {
        console.error('Error registering global commands:', error);
    }
}