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
