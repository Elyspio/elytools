/**
 * Limits how many holders run at once (e.g. the NVENC sessions of the driver). Waiters are served in order.
 */
export class Semaphore {
	private available: number;
	private readonly waiters: { grant: () => void; cancel: (error: Error) => void }[] = [];

	public constructor(public readonly total: number) {
		this.available = total;
	}

	/**
	 * Waits for a free slot and returns the function releasing it (safe to call more than once).
	 * Rejects when `signal` aborts before a slot is granted.
	 */
	public async acquire(signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) throw new Error("Aborted");

		if (this.available > 0) {
			this.available--;
		} else {
			await new Promise<void>((resolve, reject) => {
				const waiter = {
					grant: () => {
						signal?.removeEventListener("abort", onAbort);
						resolve();
					},
					cancel: reject,
				};

				const onAbort = () => {
					this.waiters.splice(this.waiters.indexOf(waiter), 1);
					reject(new Error("Aborted"));
				};

				signal?.addEventListener("abort", onAbort, { once: true });
				this.waiters.push(waiter);
			});
		}

		let released = false;
		return () => {
			if (released) return;
			released = true;
			const next = this.waiters.shift();
			// The slot goes straight to the next waiter
			if (next) next.grant();
			else this.available++;
		};
	}
}
