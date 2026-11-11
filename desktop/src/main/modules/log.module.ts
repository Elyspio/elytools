import { utilities } from "nest-winston";
import path from "node:path";
import * as fs from "node:fs";
import { MainContextModule } from "./context/main.context.module";
import { LoggerService } from "@nestjs/common";
import * as winston from "winston";
import { mainContainer } from "@main/di/container.di";
import { logArguments, serializeLogEntry, serializeLogValue } from "../utils/log-serialization";

export type AppLoggerService = Omit<LoggerService, "debug"> &
	Pick<Required<LoggerService>, "debug"> & {
		info: LoggerService["log"];
		structured(level: "log" | "debug" | "error", message: string, fields: Record<string, unknown>): void;
	};

export class LogModule {
	private static logFolder: string;
	private static backend: winston.Logger;
	public logger: AppLoggerService;
	protected constructor(name: string) {
		this.logger = LogModule.create(name);
	}
	public static create(name: string): AppLoggerService {
		if (!LogModule.backend) {
			LogModule.backend = winston.createLogger({
				level: mainContainer.get(MainContextModule).allowDebug ? "debug" : "info",
				transports: [
					new winston.transports.Console({
						format: winston.format.combine(winston.format.timestamp(), utilities.format.nestLike("Elytools", { colors: true, prettyPrint: true })),
					}),
					new winston.transports.File({
						filename: path.join(LogModule.getLogFolder(), "main.jsonl"),
						maxsize: 10485760,
						maxFiles: 3,
						zippedArchive: true,
						format: winston.format.printf((info) => serializeLogEntry(info)),
					}),
				],
				format: winston.format.timestamp(),
				exitOnError: false,
			});
		}
		const write = (level: string, args: unknown[], fields: Record<string, unknown> = {}) => {
			LogModule.backend.log({ ...(serializeLogValue(fields) as Record<string, unknown>), timestamp: new Date().toISOString(), level, context: name, ...logArguments(args) });
		};
		const logger = {
			log: (...args: unknown[]) => write("info", args),
			info: (...args: unknown[]) => write("info", args),
			debug: (...args: unknown[]) => write("debug", args),
			warn: (...args: unknown[]) => write("warn", args),
			error: (...args: unknown[]) => write("error", args),
			verbose: (...args: unknown[]) => write("verbose", args),
			fatal: (...args: unknown[]) => write("error", args),
			structured: (level: "log" | "debug" | "error", message: string, fields: Record<string, unknown>) => write(level === "log" ? "info" : level, [message], fields),
		};
		return logger;
	}
	private static getLogFolder() {
		if (LogModule.logFolder) return LogModule.logFolder;
		const folder = path.join(mainContainer.get(MainContextModule).appFolder, "logs");
		if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
		LogModule.logFolder = folder;
		console.log("Log folder:", folder);
		return folder;
	}
}
