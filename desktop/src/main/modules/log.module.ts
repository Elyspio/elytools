import { utilities, WinstonModule } from "nest-winston";
import path from "node:path";
import * as fs from "node:fs";
import { MainContextModule } from "./context/main.context.module";
import { LoggerService } from "@nestjs/common";
import * as winston from "winston";
import * as util from "node:util";
import { mainContainer } from "@main/di/container.di";

export type AppLoggerService = Omit<LoggerService, "debug"> &
	Pick<Required<LoggerService>, "debug"> & {
		info: LoggerService["log"];
	};

/**
 * Classe de base des modules permettant de gérer les logs
 */
export class LogModule {
	private static logFolder: string;
	public logger: AppLoggerService;

	protected constructor(name: string, filename = "main.log") {
		this.logger = LogModule.create(name, filename);
	}

	/**
	 *
	 * @param name
	 * @param filename
	 */
	public static create(name: string, filename = "main.log"): AppLoggerService {
		const logger = WinstonModule.createLogger({
			format: winston.format.combine(
				winston.format.timestamp(),
				utilities.format.nestLike(name, {
					colors: true,
					prettyPrint: true,
				})
			),
			level: "debug",
			transports: [
				new winston.transports.Console(),
				new winston.transports.File({
					filename: path.join(this.getLogFolder(), filename),
					maxsize: 10485760,
					maxFiles: 3,
					zippedArchive: true,
					format: winston.format.combine(
						winston.format.timestamp(),
						utilities.format.nestLike(name, {
							colors: false,
							prettyPrint: true,
						})
					),
				}),
			],
			exitOnError: false,
			handleExceptions: false,
			handleRejections: false,
		}) as AppLoggerService;

		const oldMethods = {
			log: logger.log.bind(logger),
			debug: logger.debug?.bind(logger),
			error: logger.error.bind(logger),
			warn: logger.warn.bind(logger),
		};

		logger.log = (...args: any[]) => {
			oldMethods.log(`${args.map((arg) => util.inspect(arg, false, null)).join(" ")}`);
		};
		logger.debug = (...args: any[]) => {
			oldMethods.debug?.(`${args.map((arg) => util.inspect(arg, false, null)).join(" ")}`);
		};
		logger.error = (...args: any[]) => {
			oldMethods.error(`${args.map((arg) => util.inspect(arg, false, null)).join(" ")}`);
		};
		logger.warn = (...args: any[]) => {
			oldMethods.warn(`${args.map((arg) => util.inspect(arg, false, null)).join(" ")}`);
		};

		logger.info = logger.log;

		return logger;
	}

	public static getRendererLogger() {
		return new LogModule("Renderer").logger;
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
