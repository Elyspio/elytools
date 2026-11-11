import { inspect } from "node:util";

/** Convert arbitrary application values without invoking toJSON or custom inspection hooks. */
export function serializeLogValue(value: unknown, ancestors = new Set<object>()): unknown {
	try {
		if (typeof value === "bigint") return String(value);
		if (typeof value === "function" || typeof value === "symbol") return String(value);
		if (value === null || typeof value !== "object") return value;
		if (ancestors.has(value)) return "[Circular]";
		if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
		if (value instanceof Date) return value.toISOString();
		ancestors.add(value);
		try {
			if (Array.isArray(value)) return value.map((item) => serializeLogValue(item, ancestors));
			const result: Record<string, unknown> = Object.create(null);
			if (value instanceof Error) {
				result.name = value.name;
				result.message = value.message;
				result.stack = value.stack;
				if ("cause" in value) result.cause = serializeLogValue(value.cause, ancestors);
			}
			for (const key of Object.keys(value)) result[key] = serializeLogValue((value as Record<string, unknown>)[key], ancestors);
			return result;
		} finally {
			ancestors.delete(value);
		}
	} catch {
		try {
			return inspect(value, { customInspect: false, getters: false });
		} catch {
			return "[Unserializable]";
		}
	}
}

export function logArguments(values: unknown[]) {
	const message = values.filter((value) => typeof value === "string").join(" ");
	const args = values.filter((value) => typeof value !== "string");
	return { message, ...(args.length ? { args: serializeLogValue(args) } : {}) };
}

/** Lifecycle events already identify their action through event and method. */
export function serializeLogEntry(info: Record<string, unknown>): string {
	const { timestamp, level, context, message, ...fields } = info;
	const lifecycle = (fields.event === "enter" || fields.event === "exit") && typeof fields.method === "string";
	return JSON.stringify(serializeLogValue({ timestamp, level, context, ...(lifecycle ? {} : { message }), ...fields }));
}
