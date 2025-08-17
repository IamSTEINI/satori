import { command } from "./types";

const commands: command[] = []
const commandModule = require("./commands/score");
const command: command = commandModule["score"];

commands.push(command)

export { commands }