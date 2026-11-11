import { describe, expect, it, vi } from "vite-plus/test";
import { log } from "./logs.utils";
describe("log decorator", () => {
	function wrap(fn: (...args: any[]) => unknown, options: Parameters<typeof log>[0] = true) {
		const logger = { structured: vi.fn() };
		const descriptor = { value: fn, configurable: true };
		log(options)({}, "run", descriptor);
		return { run: descriptor.value.bind({ logger }), logger };
	}

	it("records selected parameters and duration without changing results", () => {
		const { run, logger } = wrap(function (value) {
			return value;
		});
		expect(run(42)).toBe(42);
		expect(logger.structured.mock.calls[0][2]).toMatchObject({ event: "enter", params: { value: 42 } });
		expect(logger.structured.mock.calls[1][2]).toMatchObject({ event: "exit", durationMs: expect.any(Number) });
	});
	it("records synchronous and asynchronous failures once and rethrows", async () => {
		const error = new Error("failure");
		const sync = wrap(() => {
			throw error;
		});
		expect(() => sync.run()).toThrow(error);
		const async = wrap(() => Promise.reject(error));
		await expect(async.run()).rejects.toBe(error);
		for (const item of [sync, async]) {
			expect(item.logger.structured).toHaveBeenCalledTimes(2);
			expect(item.logger.structured.mock.calls[1]).toEqual(["error", "Exit run", expect.objectContaining({ error, event: "exit" })]);
		}
	});
	it("keeps custom formatter output in params", () => {
		const { run, logger } = wrap(
			() => 1,
			() => "custom"
		);
		run();
		expect(logger.structured.mock.calls[0][2]).toMatchObject({ params: "custom" });
	});
});
