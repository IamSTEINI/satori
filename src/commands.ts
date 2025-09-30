import { command } from "./types";

const commands: command[] = []
import { score } from "./commands/score"
import { settings }  from "./commands/settings"

commands.push(score)
commands.push(settings)

export { commands }