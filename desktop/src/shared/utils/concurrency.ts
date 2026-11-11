/**
 * Runs `fn` on every item with at most `limit` calls at once, keeping the order of the results.
 *
 * On the first failure, `controller` is aborted (so running work can stop its processes), no new item
 * is started, and the error is thrown only once every running call has settled: nothing is left
 * running behind the caller's back.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, controller: AbortController): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	let next = 0;
	let failure: { error: unknown } | null = null;

	const worker = async () => {
		while (next < items.length && !failure && !controller.signal.aborted) {
			const index = next++;
			try {
				results[index] = await fn(items[index], index);
			} catch (error) {
				failure ??= { error };
				controller.abort();
			}
		}
	};

	await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));

	if (failure) throw (failure as { error: unknown }).error;
	if (controller.signal.aborted) throw new Error("Aborted");

	return results;
}
