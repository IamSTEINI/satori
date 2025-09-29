import { command } from "./types";

const commands: command[] = []
const scoreCommandModule = require("./commands/score");
const settingsCommandModule = require("./commands/settings");
const scoreCommand: command = scoreCommandModule["score"];
const settingsCommand: command = settingsCommandModule["settings"];

commands.push(scoreCommand)
commands.push(settingsCommand)

export { commands }