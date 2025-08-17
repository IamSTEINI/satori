import { Database } from "./db";

class SharedDatabase {
	private static instance: Database | null = null;
	private static isConnected: boolean = false;

	static async getInstance(): Promise<Database> {
		if (!SharedDatabase.instance) {
			SharedDatabase.instance = new Database("./discord_messages.duckdb");
			await SharedDatabase.instance.connect();
			SharedDatabase.isConnected = true;
			console.log("[+] Shared database connection established");
		}
		return SharedDatabase.instance;
	}

	static async close(): Promise<void> {
		if (SharedDatabase.instance && SharedDatabase.isConnected) {
			await SharedDatabase.instance.close();
			SharedDatabase.instance = null;
			SharedDatabase.isConnected = false;
			console.log("[+] Shared database connection closed");
		}
	}

	static isDbConnected(): boolean {
		return SharedDatabase.isConnected;
	}
}

export { SharedDatabase };
