import { describe, expect, it } from "vite-plus/test";
import { mapWithConcurrency } from "./concurrency";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
	it("keeps the order and never exceeds the limit", async () => {
		let running = 0;
		let peak = 0;

		const results = await mapWithConcurrency(
			[5, 1, 4, 2, 3],
			2,
			async (value) => {
				running++;
				peak = Math.max(peak, running);
				await delay(value);
				running--;
				return value * 10;
			},
			new AbortController()
		);

		expect(results).toEqual([50, 10, 40, 20, 30]);
		expect(peak).toBe(2);
	});

	it("aborts, starts nothing new and waits for running calls before throwing", async () => {
		const controller = new AbortController();
		const started: number[] = [];
		let running = 0;

		const promise = mapWithConcurrency(
			[0, 1, 2, 3, 4, 5],
			3,
			async (index) => {
				started.push(index);
				running++;
				try {
					if (index === 1) throw new Error("OpenEncodeSessionEx failed");
					await delay(20);
				} finally {
					running--;
				}
			},
			controller
		);

		await expect(promise).rejects.toThrow("OpenEncodeSessionEx failed");
		expect(controller.signal.aborted).toBe(true);
		expect(running).toBe(0);
		expect(started).toEqual([0, 1, 2]);
	});

	it("throws when aborted from outside (cancel)", async () => {
		const controller = new AbortController();

		const promise = mapWithConcurrency(
			[1, 2, 3, 4],
			1,
			async () => {
				controller.abort();
				await delay(1);
			},
			controller
		);

		await expect(promise).rejects.toThrow("Aborted");
	});
});
