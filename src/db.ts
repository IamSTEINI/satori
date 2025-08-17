import {
	DuckDBInstance,
	DuckDBConnection,
	VARCHAR,
	BIGINT,
	INTEGER,
} from "@duckdb/node-api";

export class Database {
	private instance: DuckDBInstance | null = null;
	private connection: DuckDBConnection | null = null;

	constructor(private dbPath: string = "database.duckdb") {}

	async connect(): Promise<void> {
		this.instance = await DuckDBInstance.create(this.dbPath);
		this.connection = await this.instance.connect();
	}

	async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
		if (!this.connection) throw new Error("Not connected");
		const reader = await this.connection.runAndReadAll(sql, params);
		return reader.getRowObjects() as T[];
	}

	async run(sql: string, params: any[] = []): Promise<void> {
		if (!this.connection) throw new Error("Not connected");

		if (params.length > 0) {
			const prepared = await this.connection.prepare(sql);

			for (let i = 0; i < params.length; i++) {
				const value = params[i];
				const paramIndex = i + 1;

				if (value === null || value === undefined) {
					prepared.bindNull(paramIndex);
				} else if (typeof value === "string") {
					prepared.bindVarchar(paramIndex, value);
				} else if (typeof value === "number") {
					if (Number.isInteger(value)) {
						prepared.bindInteger(paramIndex, value);
					} else {
						prepared.bindDouble(paramIndex, value);
					}
				} else if (typeof value === "bigint") {
					prepared.bindBigInt(paramIndex, value);
				} else if (typeof value === "boolean") {
					prepared.bindBoolean(paramIndex, value);
				} else if (value && typeof value === "object") {
					if (typeof value.valueOf === "function") {
						const primitiveValue = value.valueOf();
						if (typeof primitiveValue === "number") {
							prepared.bindInteger(paramIndex, primitiveValue);
						} else if (typeof primitiveValue === "bigint") {
							prepared.bindBigInt(paramIndex, primitiveValue);
						} else {
							prepared.bindVarchar(
								paramIndex,
								String(primitiveValue)
							);
						}
					} else {
						prepared.bindVarchar(paramIndex, JSON.stringify(value));
					}
				} else {
					prepared.bindVarchar(paramIndex, String(value));
				}
			}

			await prepared.run();
		} else {
			await this.connection.run(sql);
		}
	}

	async close(): Promise<void> {
		if (this.connection) {
			this.connection.closeSync();
			this.connection = null;
		}
		if (this.instance) {
			this.instance = null;
		}
	}
}
