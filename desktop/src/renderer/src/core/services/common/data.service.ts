import { injectable } from "inversify";

@injectable()
export class DataService {
	public groupBy<T>(arr: T[], selector: (item: T) => string) {
		const data: Record<string, T[]> = {};

		for (const a of arr) {
			const keyA = selector(a);
			data[keyA] ??= [];
			data[keyA].push(a);
		}

		return data;
	}

	public maxBy<T>(arr: T[], selector: (item: T) => number) {
		let elem: T | null = null;
		let elemValue: number | null = null;
		for (const a of arr) {
			const currentValue = selector(a);

			if (currentValue > (elemValue ?? Number.NEGATIVE_INFINITY)) {
				elemValue = currentValue;
				elem = a;
			}
		}

		return elem;
	}

	public minBy<T>(arr: T[], selector: (item: T) => number) {
		let elem: T | null = null;
		let elemValue: number | null = null;
		for (const a of arr) {
			const currentValue = selector(a);

			if (currentValue < (elemValue ?? Number.POSITIVE_INFINITY)) {
				elemValue = currentValue;
				elem = a;
			}
		}

		return elem;
	}
}
