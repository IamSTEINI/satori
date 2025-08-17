import { ChatInputApplicationCommandData, Client, CommandInteraction } from "discord.js";
import { Database } from "./db";

export interface command extends ChatInputApplicationCommandData {
    category?: string;
    run: (client: Client, interaction: CommandInteraction, db: Database) => void;
}
