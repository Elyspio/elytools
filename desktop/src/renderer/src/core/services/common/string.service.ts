import { injectable } from "inversify";

@injectable()
export class StringService {
	/**
	 * Calcule la distance de Levenshtein entre deux chaînes de caractères
	 * @param a
	 * @param b
	 */
	getLevenshteinDistance(a: string, b: string): number {
		const matrix = Array.from({ length: a.length + 1 }, () => Array.from<number>({ length: b.length + 1 }).fill(0));

		for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
		for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

		for (let i = 1; i <= a.length; i++) {
			for (let j = 1; j <= b.length; j++) {
				const cost = a[i - 1] === b[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1, // Suppression
					matrix[i][j - 1] + 1, // Insertion
					matrix[i - 1][j - 1] + cost // Substitution
				);
			}
		}
		return matrix[a.length][b.length];
	}

	findSimilar<T>(arr: T[], keySelector: (x: T) => string, threshold = 4) {
		const distances = arr.reduce(
			(acc, x) => {
				const xKey = keySelector(x);
				acc[xKey] = {};

				for (const y of arr) {
					const yKey = keySelector(y);
					acc[xKey][yKey] = this.getLevenshteinDistance(xKey, yKey);
				}

				return acc;
			},
			{} as Record<string, Record<string, number>>
		);

		console.log({ distances });

		const arrByKey = arr.reduce(
			(acc, x) => {
				acc[keySelector(x)] = x;
				return acc;
			},
			{} as Record<string, T>
		);

		const similarGroups: T[][] = [];

		const usedKeys = new Set<string>();

		for (const [xKey, data] of Object.entries(distances)) {
			const nearData = Object.entries(data)
				.filter(([key, _]) => !usedKeys.has(key))
				.filter(([, distance]) => distance <= threshold);

			usedKeys.add(xKey);
			if (nearData.length > 1) {
				const group = nearData.map(([yKey]) => arrByKey[yKey]);
				similarGroups.push(group);
				for (const [yKey] of nearData) {
					usedKeys.add(yKey);
				}
			}
		}

		return similarGroups;
	}
}
