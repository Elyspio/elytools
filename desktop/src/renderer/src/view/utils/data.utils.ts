export function convertSizeToHumanFormat(sizeInBytes: number) {
	if (sizeInBytes < 1024) {
		return `${sizeInBytes} B`;
	}

	const sizeInKB = sizeInBytes / 1024;
	if (sizeInKB < 1024) {
		return `${sizeInKB.toFixed(2)} KB`;
	}

	const sizeInMB = sizeInKB / 1024;
	if (sizeInMB < 1024) {
		return `${sizeInMB.toFixed(2)} MB`;
	}

	const sizeInGB = sizeInMB / 1024;

	return `${sizeInGB.toFixed(2)} GB`;
}

/**
 * Size change from `before` to `after` as a signed percentage ("−42 %", "+3 %"), or "" below 1 %
 */
export function formatSizeChange(before: number, after: number) {
	if (before <= 0) return "";
	const change = Math.round((after / before - 1) * 100);
	if (change === 0) return "";
	return `${change < 0 ? "−" : "+"}${Math.abs(change)} %`;
}
