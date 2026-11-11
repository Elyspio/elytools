import { describe, expect, it } from "vite-plus/test";
import { serializeLogValue, logArguments } from "./log-serialization";
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
