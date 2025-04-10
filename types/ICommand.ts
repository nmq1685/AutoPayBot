export interface ICommand {
    data?: {
        name: string;
        description?: string;
        toJSON?: () => any;
    };
    name?: string;
    aliases?: string[];
    execute: (
        interactionOrMessage: import('discord.js').Interaction | import('discord.js').Message,
        args?: string[]
    ) => Promise<void>;
    autocomplete?: (interaction: import('discord.js').AutocompleteInteraction) => Promise<void>;
    handleModalSubmit?: (interaction: import('discord.js').ModalSubmitInteraction) => Promise<void>;
    handleButtonInteraction?: (interaction: import('discord.js').ButtonInteraction) => Promise<void>;
    handleStringSelectMenuInteraction?: (interaction: import('discord.js').StringSelectMenuInteraction) => Promise<void>;
}