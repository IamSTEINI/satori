import {
	ApplicationCommandType,
	ApplicationCommandOptionType,
	Client,
	CommandInteraction,
} from "discord.js";
import { command } from "../types";
import { Database } from "../db";

export const settings: command = {
	name: "settings",
	description: "Choose the best settings for your server",
	type: ApplicationCommandType.ChatInput,
	options: [
		{
			name: "banscore",
			description:
				"If a user is below that score, the account gets banned from the server",
			type: ApplicationCommandOptionType.Number,
			required: false,
		},
		{
			name: "kickscore",
			description:
				"If a user is below that score, the account gets kicked from the server",
			type: ApplicationCommandOptionType.Number,
			required: false,
		},
		{
			name: "warnmessage",
			description:
				"If a user is near a ban or kick, satori messages the user with that message",
			type: ApplicationCommandOptionType.String,
			required: false,
		},
	],
	run: async (
		client: Client,
		interaction: CommandInteraction,
		db: Database
	) => {
		try {
			if (!interaction.isChatInputCommand()) {
				await interaction.reply({
					content:
						"This command can only be used as a slash command.",
					ephemeral: true,
				});
				return;
			}

			if (!interaction.memberPermissions?.has("Administrator")) {
				await interaction.reply({
					content:
						"You need Administrator permissions to change settings.",
					ephemeral: true,
				});
				return;
			}

			const newBanScore = interaction.options.getNumber("banscore");
			const newKickScore = interaction.options.getNumber("kickscore");
			const newWarnMessage = interaction.options.getString("warnmessage");

			const guild_id = interaction.guildId;

			const result = await db.query(
				"SELECT * FROM guilds WHERE guildId = ?",
				[guild_id]
			);

			let guildSettings = null;
			if (result && result.length > 0) {
				guildSettings = {
					id: result[0].id,
					guildId: result[0].guildId,
					guildName: result[0].guildName,
					description: result[0].description || "",
					ownerId: result[0].ownerId,
					preferredLocale: result[0].preferredLocale,
					banMinScore: result[0].banMinScore,
					kickMinScore: result[0].kickMinScore,
					warnMessage: result[0].warnMessage,
				};
			}

			if (!newBanScore && !newKickScore && !newWarnMessage) {
				const settingsEmbed = {
					title: guildSettings?.guildName + "'s Settings",
					description: "Configure SATORI for your server",
					color: 0xffffff,
					fields: [
						{
							name: "Server ID",
							value: guild_id?.toString() || "Unknown",
							inline: true,
						},
						{
							name: "Current Configuration",
							value: guildSettings
								? `Ban Min Score: ${
										guildSettings.banMinScore || "Not set"
								  }\n` +
								  `Kick Min Score: ${
										guildSettings.kickMinScore || "Not set"
								  }\n` +
								  `Warn Message: ${
										guildSettings.warnMessage ||
										"Default warning"
								  }`
								: "No settings configured yet",
							inline: false,
						},
					],
					footer: {
						text: "SATORI Settings",
					},
					timestamp: new Date().toISOString(),
				};

				await interaction.reply({
					embeds: [settingsEmbed],
					ephemeral: true,
				});
				return;
			}

			let changes = "";

			if (newBanScore) {
				changes += "New ban score: " + newBanScore + "\n";
			}
			if (newKickScore) {
				changes += "New kick score: " + newKickScore + "\n";
			}
			if (newWarnMessage) {
				changes += "New warn message: " + newWarnMessage + "\n";
			}

			if (guildSettings) {
				try {
					await db.run(
						`UPDATE guilds 
						 SET banMinScore = COALESCE(?, banMinScore),
							 kickMinScore = COALESCE(?, kickMinScore),
							 warnMessage = COALESCE(?, warnMessage)
						 WHERE guildId = ?`,
						[newBanScore, newKickScore, newWarnMessage, guild_id]
					);

					console.log("[+] Guild settings updated for " + guild_id);
					const changesEmbed = {
						title: guildSettings?.guildName + "'s Changes",
						description: "Changes made",
						color: 0xffffff,
						fields: [
							{
								name: "Server ID",
								value: guild_id?.toString() || "Unknown",
								inline: true,
							},
							{
								name: "New Configuration",
								value: changes,
								inline: false,
							},
						],
						footer: {
							text: "✅ Changes applied",
						},
						timestamp: new Date().toISOString(),
					};

					await interaction.reply({
						embeds: [changesEmbed],
						ephemeral: true,
					});
				} catch (dbError) {
					console.error("Database error:", dbError);
					await interaction.reply({
						content:
							"Failed to update settings. Database error occurred.",
						ephemeral: true,
					});
				}
			} else {
				await interaction.reply({
					content:
						"Could not find settings for this server. Please contact an admin.",
					ephemeral: true,
				});
			}
		} catch (error) {
			console.error("Error in settings command:", error);
			if (!interaction.replied) {
				await interaction.reply({
					content: "An error occurred while processing your request.",
					ephemeral: true,
				});
			}
		}
	},
};
