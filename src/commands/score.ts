import {
	ApplicationCommandType,
	ApplicationCommandOptionType,
	Client,
	CommandInteraction,
	ChatInputCommandInteraction,
} from "discord.js";
import { command } from "../types";
import { Database } from "../db";

export const score: command = {
	name: "score",
	description:
		"Shows your SATORI score (or another user's if you're an admin)",
	type: ApplicationCommandType.ChatInput,
	options: [
		{
			name: "user",
			description: "Get another user's score (Admin only)",
			type: ApplicationCommandOptionType.User,
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

			const targetUser = interaction.options.getUser("user");
			let author_id = interaction.user.id;
			let isCheckingOtherUser = false;

			if (targetUser) {
				if (!interaction.memberPermissions?.has("Administrator")) {
					await interaction.reply({
						content:
							"You need Administrator permissions to check other users' scores.",
						ephemeral: true,
					});
					return;
				}
				author_id = targetUser.id;
				isCheckingOtherUser = true;
			}

			const result = await db.query(
				"SELECT score FROM messages WHERE authorId = ?",
				[author_id]
			);

			if (!result.length) {
				const message = isCheckingOtherUser
					? `${
							targetUser!.displayName
					  } has no messages to calculate a score.`
					: "You have no messages to calculate a score.";
				await interaction.reply({
					content: message,
					ephemeral: true,
				});
				return;
			}

			const validScores = result.filter(
				(row: any) => row.score !== null && row.score !== undefined
			);
			if (!validScores.length) {
				const message = isCheckingOtherUser
					? `${
							targetUser!.displayName
					  } has no messages with a score to calculate.`
					: "You have no messages with a score to calculate.";
				await interaction.reply({
					content: message,
					ephemeral: true,
				});
				return;
			}

			const totalScore = validScores.reduce(
				(sum: number, row: any) => sum + row.score,
				0
			);
			const averageScore = totalScore / validScores.length;

			const indicator =
				averageScore >= 4.5
					? "🌟 VERY GOOD"
					: averageScore >= 3.5
					? "👍 GOOD"
					: averageScore >= 2.5
					? "😐 AVERAGE"
					: averageScore >= 1.5
					? "👎 BAD"
					: "⚠️ VERY BAD";

			const titlePrefix = isCheckingOtherUser
				? `${targetUser!.displayName}'s`
				: "Your";
			const scoreTitle = `${titlePrefix} SATORI Score Report`;

			await interaction.reply({
				embeds: [
					{
						title: scoreTitle,
						description: [
							`**Average Score:** \`${averageScore.toFixed(2)}\``,
							"",
							indicator,
							"",
							`_Based on **${result.length}** messages_`,
							`_5 is BEST_`,
						].join("\n"),
						color:
							averageScore >= 4.5
								? 0xffd700
								: averageScore >= 3.5
								? 0x43b581
								: averageScore >= 2.5
								? 0xfaa61a
								: averageScore >= 1.5
								? 0xf04747
								: 0x992d22,
						footer: {
							text: "SATORI",
						},
						timestamp: new Date().toISOString(),
					},
				],
				ephemeral: isCheckingOtherUser,
			});
		} catch (error) {
			console.error("Error fetching score:", error);
			await interaction.reply({
				content: "Sorry, there was an error fetching your score.",
				flags: 1 << 6,
			});
		}
	},
};
