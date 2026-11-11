import { describe, expect, it } from "vite-plus/test";
import { Semaphore } from "./semaphore";

describe("Semaphore", () => {
	it("grants up to its total, then makes the next caller wait for a release", async () => {
		const semaphore = new Semaphore(2);
		const first = await semaphore.acquire();
		await semaphore.acquire();

		let granted = false;
		const third = semaphore.acquire().then((release) => {
			granted = true;
			return release;
		});

		await Promise.resolve();
		expect(granted).toBe(false);

		first();
		await third;
		expect(granted).toBe(true);
	});

	it("serves the waiters in order", async () => {
		const semaphore = new Semaphore(1);
		const release = await semaphore.acquire();
		const order: number[] = [];

		const a = semaphore.acquire().then((r) => (order.push(1), r));
		const b = semaphore.acquire().then((r) => (order.push(2), r));

		release();
		(await a)();
		(await b)();

		expect(order).toEqual([1, 2]);
	});

	it("releases only once", async () => {
		const semaphore = new Semaphore(1);
		const release = await semaphore.acquire();
		release();
		release();

		await semaphore.acquire();
		let granted = false;
		void semaphore.acquire().then(() => (granted = true));
		await Promise.resolve();

		expect(granted).toBe(false);
	});

	it("rejects a waiter whose signal aborts and keeps the slot for the others", async () => {
		const semaphore = new Semaphore(1);
		const release = await semaphore.acquire();
		const controller = new AbortController();

		const aborted = semaphore.acquire(controller.signal);
		const next = semaphore.acquire();
		controller.abort();

		await expect(aborted).rejects.toThrow("Aborted");
		release();
		await expect(next).resolves.toBeTypeOf("function");
		await expect(semaphore.acquire(controller.signal)).rejects.toThrow("Aborted");
	});
});
