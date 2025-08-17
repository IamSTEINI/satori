import { Client, CommandInteraction, Events, Interaction } from "discord.js";
import { commands } from "./commands";
import { Database } from "./db";


export default (client: Client, db: Database): void => {
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
        if(interaction.isCommand()) {
            await handleSlashCommand(client, interaction, db);
        }
    })
}

const handleSlashCommand = async (client: Client, interaction: CommandInteraction, db: Database): Promise<void> => {
    const slashCommand = commands.find(c => c.name === interaction.commandName)
    if(!slashCommand) {
        interaction.reply({
            content: "Command not found"
        });
        return;
    }
    
    try {
        slashCommand?.run(client, interaction, db);
    }
    catch(error) {
        console.log(error)
    }
}