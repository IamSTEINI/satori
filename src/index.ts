import "dotenv/config";
import { Client, Interaction } from "discord.js";
import { SharedDatabase } from "./shared-db";
import fetch from "node-fetch";
import { commands } from "./commands";
import interactionCreate from "./interactionCreate";

const client = new Client({
	intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
});

let discord_message_db: any;

const messageQueue: any[] = [];

async function processQueue() {
	while (true) {
		const item = messageQueue.shift();
		if (!item) {
			await new Promise((res) => setTimeout(res, 500));
			continue;
		}
		try {
			const author = item.author;
			const contentResults = await discord_message_db.query(
				"SELECT cleanContent FROM messages WHERE authorId = ?",
				[author]
			);
			const timeResults = await discord_message_db.query(
				"SELECT createdTimestamp FROM messages WHERE authorId = ?",
				[author]
			);

			if (contentResults.length > 0) {
				contentResults.pop();
			}
			if (timeResults.length > 0) {
				timeResults.pop();
			}
			let shouldAddScore = true;

			// Levenshtein distance percentage (thanks gpt)
			function similarity(a: string, b: string): number {
				const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
					Array.from({ length: b.length + 1 }, (_, j) =>
						i === 0 ? j : i
					)
				);

				for (let i = 1; i <= a.length; i++) {
					for (let j = 1; j <= b.length; j++) {
						if (a[i - 1] === b[j - 1]) {
							matrix[i][j] = matrix[i - 1][j - 1];
						} else {
							matrix[i][j] = Math.min(
								matrix[i - 1][j - 1] + 1,
								matrix[i][j - 1] + 1,
								matrix[i - 1][j] + 1
							);
						}
					}
				}
				const distance = matrix[a.length][b.length];
				const maxLen = Math.max(a.length, b.length);
				return maxLen === 0 ? 1 : 1 - distance / maxLen;
			}

			const threshold = 0.5 + Math.random() * 0.2; // random threshold between 0.5 and 0.7 in %
			const similarMessages = contentResults
				.slice(-10)
				.filter(
					(row: any) =>
						similarity(item.cleanContent, row.cleanContent) >= threshold
				);

			const isSimilar = similarMessages.length > 0;

			if (isSimilar) {
				console.log(
					`[!] Message ${item.id} is too similar to the following previous messages:`
				);
				similarMessages.forEach((row: any) => {
					console.log(`    - "${row.cleanContent}"`);
				});
			}

			if (isSimilar) {
				console.log(
					`[!] Message ${item.id} is too similar to a previous message. Skipping score update.`
				);
				shouldAddScore = false;
				continue;
			}
			const latestTimestampStr = timeResults
				.map((row: any) => row.createdTimestamp)
				.sort()
				.pop();
			if (latestTimestampStr) {
				const latestTimestamp = Number(latestTimestampStr);
				const now = Date.now();
				const diffMs = now - latestTimestamp;
				const diffMinutes = diffMs / (1000 * 60);
				const minMinutes = 0; // CHANGE IF NEEDED
				const maxMinutes = 0; // CHANGE IF NEEDED
				const randomMinutes =
					minMinutes + Math.random() * (maxMinutes - minMinutes);
				if (diffMinutes < randomMinutes) {
					shouldAddScore = false;
					console.log(
						`[!] Last message from author ${author} is within ${randomMinutes.toFixed(
							2
						)} minutes. Skipping score.`
					);
					continue;
				}
			}

			if (!shouldAddScore) continue;

			const res = await fetch("http://127.0.0.1:3001/sentiment", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: item.cleanContent }),
			});
			const data = (await res.json()) as { score?: number };
			const score = data.score ?? null;
			await discord_message_db.run(
				`UPDATE messages SET score = ? WHERE id = ?`,
				[score, item.id]
			);
			console.log(`[+] Score ${score} added to message ${item.id}`);

			// CHECKING USER SCORE AND GUILD SETTINGS
			const result = await discord_message_db.query(
				"SELECT score FROM messages WHERE authorId = ?",
				[author]
			);

			const validScores = result.filter(
				(row: any) => row.score !== null && row.score !== undefined
			);
			if (!validScores.length) {
				return;
			}
			if (!result.length) {
				return;
			}

			const totalScore = validScores.reduce(
				(sum: number, row: any) => sum + row.score,
				0
			);
			const averageScore = totalScore / validScores.length;
			const guild_settings_result = await discord_message_db.query(
				"SELECT * FROM guilds WHERE guildId = ?",
				[item.guildId]
			);

			let guildSettings = null;
			if (guild_settings_result.length > 0) {
				guildSettings = {
					id: guild_settings_result[0].id,
					guildId: guild_settings_result[0].guildId,
					guildName: guild_settings_result[0].guildName,
					description: guild_settings_result[0].description || "",
					ownerId: guild_settings_result[0].ownerId,
					preferredLocale: guild_settings_result[0].preferredLocale,
					banMinScore: guild_settings_result[0].banMinScore,
					kickMinScore: guild_settings_result[0].kickMinScore,
					warnMessage: guild_settings_result[0].warnMessage,
				};
			}
			console.log(
				`[i] User ${author} average score: ${averageScore.toFixed(
					2
				)} on guild: ` + item.guildId
			);
			if (guildSettings) {
				console.log(
					`[i] Guild settings for ${guildSettings.guildName}:` +
						`\n    - Ban threshold: ${
							guildSettings.banMinScore !== null
								? guildSettings.banMinScore.toFixed(2)
								: "Not set"
						}` +
						`\n    - Kick threshold: ${
							guildSettings.kickMinScore !== null
								? guildSettings.kickMinScore.toFixed(2)
								: "Not set"
						}` +
						`\n    - Warning message: ${
							guildSettings.warnMessage || "Not set"
						}`
				);
			}

			if (guildSettings) {
				if (averageScore < guildSettings.banMinScore) {
					console.log(
						`[!] USER ${author} SHOULD BE BANNED FROM ${
							guildSettings.guildName
						} - Average score: ${averageScore.toFixed(2)}`
					);
					try {
						const guild = client.guilds.cache.get(item.guildId);
						if (guild) {
							const member = await guild.members.fetch(author);
							if (member) {
								await member.ban({
									reason: `SATORI | Automatic ban: Average sentiment score ${averageScore.toFixed(
										2
									)} below threshold ${guildSettings.banMinScore.toFixed(
										2
									)}`,
								});
								console.log(
									`[+] User ${author} has been banned from ${guildSettings.guildName}`
								);
							} else {
								console.log(
									`[-] Could not find user ${author} in guild ${guildSettings.guildName}`
								);
							}
						} else {
							console.log(
								`[-] Could not find guild ${item.guildId}`
							);
						}
					} catch (error) {
						console.error(
							`[-] Failed to ban user ${author}:`,
							error
						);
					}
				} else if (averageScore < guildSettings.kickMinScore) {
					console.log(
						`[!] USER ${author} SHOULD BE KICKED FROM ${
							guildSettings.guildName
						} - Average score: ${averageScore.toFixed(2)}`
					);
					try {
						const guild = client.guilds.cache.get(item.guildId);
						if (guild) {
							const member = await guild.members.fetch(author);
							if (member) {
								await member.kick(
									`SATORI | Automatic kick: Average sentiment score ${averageScore.toFixed(
										2
									)} below threshold ${guildSettings.kickMinScore.toFixed(
										2
									)}`
								);
								console.log(
									`[+] User ${author} has been kicked from ${guildSettings.guildName}`
								);
							} else {
								console.log(
									`[-] Could not find user ${author} in guild ${guildSettings.guildName}`
								);
							}
						} else {
							console.log(
								`[-] Could not find guild ${item.guildId}`
							);
						}
					} catch (error) {
						console.error(
							`[-] Failed to kick user ${author}:`,
							error
						);
					}
				}
			}
		} catch (err) {
			console.error("[-] Sentiment fetch failed:", err);
		}
	}
}

processQueue();

client.on("messageCreate", async (message) => {
	if (message.author.bot) return;
	// blacklisted messages, since we dont wanna see the own command
	if (
		message.cleanContent.trim().startsWith("/score") ||
		message.cleanContent.trim().startsWith("/settings")
	) {
		return;
	}

	if (message.guild) {
		try {
			const guildExists = await discord_message_db.query(
				"SELECT id FROM guilds WHERE id = ?",
				[message.guild.id]
			);

			if (guildExists.length === 0) {
				await discord_message_db.run(
					`INSERT INTO guilds (
						id, guildId, guildName, description, ownerId, preferredLocale, 
						banMinScore, kickMinScore, warnMessage
					) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
					[
						message.guild.id,
						message.guild.id,
						message.guild.name,
						message.guild.description || "",
						message.guild.ownerId,
						message.guild.preferredLocale,
					]
				);
				console.log(
					`[+] Guild ${message.guild.name} (${message.guild.id}) added to database`
				);
			}
		} catch (error) {
			console.error(
				`[-] Failed to check/add guild ${message.guild.id}:`,
				error
			);
		}
	}

	const messageData = {
		channelId: message.channelId,
		guildId: message.guildId ?? "",
		id: message.id,
		createdTimestamp: message.createdTimestamp,
		type: Number(message.type),
		content: message.content,
		authorId: message.author.id,
		nonce: message.nonce ?? "",
		attachments: message.attachments.map((att) => att.url),
		editedTimestamp: message.editedTimestamp ?? null,
		mentions: JSON.stringify({
			everyone: message.mentions.everyone,
			users: message.mentions.users.map((user) => user.id),
			roles: message.mentions.roles.map((role) => role.id),
			crosspostedChannels: message.mentions.crosspostedChannels.map(
				(channel) => channel.channelId
			),
			repliedUser: message.mentions.repliedUser?.id ?? null,
			members: message.mentions.members?.map((member) => member.id),
			channels: message.mentions.channels.map((channel) => channel.id),
		}),
		webhookId: message.webhookId ?? null,
		groupActivityApplicationId: message.groupActivityApplication ?? null,
		applicationId: message.applicationId ?? null,
		activity: JSON.stringify(message.activity ?? {}),
		flags: Number(message.flags.bitfield),
		reference: JSON.stringify(message.reference ?? {}),
		poll: JSON.stringify(message.poll ?? {}),
		cleanContent: message.cleanContent,
	};

	try {
		await discord_message_db.run(
			`INSERT INTO messages (
				channelId, guildId, id, createdTimestamp, type, content, authorId, nonce, attachments,
				editedTimestamp, mentions, webhookId, groupActivityApplicationId, applicationId, activity,
				flags, reference, poll, cleanContent, score
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
			[
				messageData.channelId,
				messageData.guildId,
				messageData.id,
				String(messageData.createdTimestamp),
				messageData.type,
				messageData.content,
				messageData.authorId,
				messageData.nonce,
				JSON.stringify(messageData.attachments),
				messageData.editedTimestamp !== null
					? String(messageData.editedTimestamp)
					: null,
				messageData.mentions,
				messageData.webhookId,
				messageData.groupActivityApplicationId,
				messageData.applicationId,
				messageData.activity,
				messageData.flags,
				messageData.reference,
				messageData.poll,
				messageData.cleanContent,
			]
		);
		console.log(`[+] Message ${message.id} inserted successfully`);
		if (message.member?.permissions.has("Administrator")) {
			console.log(
				`[i] Skipping message ${message.id} from administrator ${message.author.tag}`
			);
			return;
		}

		messageQueue.push({
			id: message.id,
			author: message.author.id,
			cleanContent: message.cleanContent,
			guildId: message.guildId,
		});
	} catch (error) {
		console.error(`[-] Failed to insert message ${message.id}:`, error);
	}
});

(async () => {
	discord_message_db = await SharedDatabase.getInstance();
	console.log("[+] Database connected");

	client.on("ready", async () => {
		if (!client.user || !client.application) {
			return;
		}
		console.log(`[+] ${client.user?.username} is ready`);
		await discord_message_db
			.run(
				`
			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				channelId TEXT,
				guildId TEXT,
				createdTimestamp TEXT,
				type INTEGER,
				content TEXT,
				authorId TEXT,
				nonce TEXT,
				attachments TEXT,
				editedTimestamp TEXT,
				mentions TEXT,
				webhookId TEXT,
				groupActivityApplicationId TEXT,
				applicationId TEXT,
				activity TEXT,
				flags INTEGER,
				reference TEXT,
				poll TEXT,
				cleanContent TEXT,
				score INTEGER
			)
		`
			)
			.then(() => {
				console.log("[+] Created database");
			});
		await discord_message_db
			.run(
				`
			CREATE TABLE IF NOT EXISTS guilds (
				id TEXT PRIMARY KEY,
				guildId TEXT,
				guildName TEXT,
				description TEXT,
				ownerId TEXT,
				preferredLocale TEXT,
				banMinScore REAL,
				kickMinScore REAL,
				warnMessage TEXT,
			)
		`
			)
			.then(() => {
				console.log("[+] Created guilds table");
			});

		console.log(commands);

		await client.application.commands.set(commands);
		console.log("[+] Commands registered successfully");
	});

	interactionCreate(client, discord_message_db);
	client.login(process.env.TOKEN);

	process.on("SIGINT", async () => {
		console.log("[+] Shutting down gracefully...");
		await SharedDatabase.close();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		console.log("[+] Shutting down gracefully...");
		await SharedDatabase.close();
		process.exit(0);
	});
})();
