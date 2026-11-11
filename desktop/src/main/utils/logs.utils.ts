import type { AppLoggerService } from "../modules/log.module";
type LogArgument = number[] | ((...args: any[]) => string) | boolean;

export function log(logArguments?: LogArgument, level: "debug" | "log" = "log") {
	return (target: any, method: string, descriptor: PropertyDescriptor) => {
		const original = descriptor.value;
		descriptor.value = function (...args: unknown[]) {
			const logger = (this as { logger: AppLoggerService }).logger;
			if (!logger) throw new Error("Logger not found in target " + target.constructor.name);
			const parsed = getFunctionArgs(original)
				.map((name) => name.trim())
				.filter((name) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name));
			const names = parsed.length >= args.length ? parsed : args.map((_, i) => `arg${i}`);
			const params =
				typeof logArguments === "function"
					? logArguments(...args)
					: logArguments === undefined || logArguments === false
						? undefined
						: Object.fromEntries(names.flatMap((name, i) => (Array.isArray(logArguments) && !logArguments.includes(i) ? [] : [[name, args[i]]])));
			const fields = { method, ...(params === undefined ? {} : { params }) };
			logger.structured(level, `Enter ${method}`, { event: "enter", ...fields });
			const startAt = performance.now();

			const finish = (error?: unknown, failed = false) =>
				logger.structured(failed ? "error" : level, `Exit ${method}`, {
					event: "exit",
					...fields,
					durationMs: Number((performance.now() - startAt).toFixed(3)),
					...(failed ? { error } : {}),
				});

			let result: unknown;
			try {
				result = original.apply(this, args);
			} catch (error) {
				finish(error, true);
				throw error;
			}
			if (result && typeof (result as PromiseLike<unknown>).then === "function") {
				return Promise.resolve(result).then(
					(value) => {
						finish();
						return value;
					},
					(error) => {
						finish(error, true);
						throw error;
					}
				);
			}
			finish();
			return result;
		};
		return descriptor;
	};
}

log.debug = (args: LogArgument = true) => log(args, "debug");

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getFunctionArgs(func: Function) {
	try {
		const source = String(func);
		// Filter to printable ASCII (plus tab/LF/CR) only
		if (/[^\t\n\r -~]/.test(source)) {
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
