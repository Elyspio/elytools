import { describe, expect, it } from "vite-plus/test";
import { serializeLogValue, logArguments, serializeLogEntry } from "./log-serialization";
describe("JSONL serialization", () => {
	it("preserves structured arguments and escapes line breaks", () => {
		const line = JSON.stringify(logArguments(["hello\nworld", { count: 4n }]));
		expect(line.split("\n")).toHaveLength(1);
		expect(JSON.parse(line)).toEqual({ message: "hello\nworld", args: [{ count: "4" }] });
	});
	it("handles cycles, repeated objects, buffers and errors", () => {
		const item: Record<string, unknown> = {};
		item.self = item;
		expect(serializeLogValue([item, item, Buffer.alloc(3)])).toEqual([{ self: "[Circular]" }, { self: "[Circular]" }, "<Buffer 3 bytes>"]);
		expect(serializeLogValue(new Error("failed", { cause: new Error("cause") }))).toMatchObject({ name: "Error", message: "failed", cause: { message: "cause" } });
	});
	it("survives throwing getters and toJSON", () => {
		const value = {
			get broken() {
				throw new Error("getter");
			},
			toJSON() {
				throw new Error("json");
			},
		};
		expect(() => JSON.stringify(serializeLogValue(value))).not.toThrow();
	});
});

it("omits redundant lifecycle messages and keeps ordinary messages", () => {
	for (const event of ["enter", "exit"]) {
		const entry = JSON.parse(
			serializeLogEntry({ timestamp: "now", level: "info", context: "Settings", message: `${event} onSettingsChanged`, event, method: "onSettingsChanged", durationMs: 2 })
		);
		expect(entry).not.toHaveProperty("message");
		expect(entry).toMatchObject({ event, method: "onSettingsChanged", durationMs: 2 });
	}
	expect(JSON.parse(serializeLogEntry({ level: "info", message: "Settings saved" }))).toHaveProperty("message", "Settings saved");
});
