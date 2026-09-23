import * as util from "node:util";
import { AppLoggerService } from "../modules/log.module";

function getArguments(logArguments: LogArgument | undefined, args: unknown[], argsName: string[]) {
	if (logArguments === undefined) return "";

	if (typeof logArguments === "function") {
		return logArguments(...args);
	}

	if (logArguments !== false) {
		return argsName.reduce((previousValue, currentValue, currentIndex) => {
			if (logArguments !== true) {
				if (Array.isArray(logArguments) && !logArguments.includes(currentIndex)) return previousValue;
			}
			return `${previousValue} ${currentValue}=${util.inspect(args[currentIndex], false, null)}`;
		}, "");
	}

	return "";
}

function getSafeArgNames(func: Function, count: number) {
	const parsed = getFunctionArgs(func)
		.map((arg) => arg.trim())
		.filter((arg) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(arg));

	if (parsed.length >= count) {
		return parsed;
	}

	return Array.from({ length: count }, (_, index) => `arg${index}`);
}

/**
 * Gestion de comment les paramètres vont être loggué
 *
 * true | undefined => on log tous les paramètres
 *
 * false => on ne log aucun paramètre
 *
 * [0,1] => Seulement les deux premiers paramètres vont être loggué
 *
 * (a,b,c) => string => fn custom pour formatter les paramètres commme on le souhaite
 */
type LogArgument = number[] | ((...args: any[]) => string) | boolean;

/**
 * Gère le log de fin de la fonction en fonction du type de retour (promise vs primitive)
 * @param logger le logger du module
 * @param level le niveau de log
 * @param startAt l'instant en ms où la fonction a démarré
 * @param str le log construit avec les paramètres
 * @param result
 */
function handleResult(logger: AppLoggerService, level: "debug" | "log", startAt: number, str: string, result: unknown) {
	const promiseResult = result as Promise<unknown> | undefined;
	if (typeof promiseResult?.then === "function" && typeof promiseResult?.catch === "function") {
		return promiseResult
			.catch((err: any) => {
				const exitMessage = `Exit ${str} (${formatTime(startAt)})`;
				logger.error(exitMessage, err);
				throw err;
			})
			.then((res: unknown) => {
				const exitMessage = `Exit ${str} (${formatTime(startAt)})`;
				logger[level](exitMessage);
				return res;
			});
	}

	const exitMessage = `Exit ${str} (${formatTime(startAt)})`;
	logger[level](exitMessage);

	return result;
}

interface ILoggable {
	logger: AppLoggerService;
}

/**
 * Décorateur permettant de logger les entrées et sorties des méthodes
 *
 * ! La classe doit avoir un attribut logger et avoir une variable static nommée "instance" qui contient une instance de la classe !
 * @param logArguments
 * @param level
 */
export function log(logArguments?: LogArgument, level: "debug" | "log" = "log") {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const targetFunc = descriptor.value;
		descriptor.value = function (...args: any[]) {
			const method = propertyKey;
			const logger = (this as ILoggable).logger;

			if (!logger) {
				throw new Error("Logger not found in target " + target.constructor.name);
			}

			let str = `${method}`;

			const argsName = getSafeArgNames(targetFunc, args.length);

			let argsStr = getArguments(logArguments, args, argsName);

			if (argsStr) {
				argsStr = argsStr.trim();
				str = `${str} ${argsStr}`;
			}

			logger[level](`Enter ${str}`);

			const startAt = performance.now();

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
			const result = targetFunc.apply(this, args);

			return handleResult(logger, level, startAt, str, result);
		};
		return descriptor;
	};
}

/**
 * Wrapper de la fonction log avec le level forcé à debug
 * @param logArguments
 */
log.debug = (logArguments: number[] | ((...args: any[]) => string) | boolean = true) => log(logArguments, "debug");

/**
 * Récupère le nom de la fonction passé en paramètre
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getFunctionArgs(func: Function) {
	try {
		const source = String(func);
		// Filter to printable ASCII (plus tab/LF/CR) only
		if (
			![...source].every((c) => {
				const code = c.charCodeAt(0);
				return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
			})
		) {
			return [];
		}

		return source
			.replaceAll(/\/\/.*$/gm, "")
			.replaceAll(/\s+/g, "")
			.replaceAll(/\/[*][^/*]*[*]\//g, "")
			.split("){", 1)[0]
			.replace(/^[^(]*[(]/, "")
			.replaceAll(/=[^,]+/g, "")
			.split(",")
			.filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * Renvoie le temps en ms entre l'instant passé en paramètre et maintenant
 * @param startedAt
 */
function formatTime(startedAt: number) {
	return `${(performance.now() - startedAt).toFixed(3)}ms`;
}
