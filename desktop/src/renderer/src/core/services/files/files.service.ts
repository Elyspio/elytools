import { inject, injectable } from "inversify";
import { PathService } from "@services/files/path.service";

@injectable()
class FilesService {
	constructor(@inject(PathService) private readonly pathService: PathService) {}

	public async delete(folder: string, match: RegExp, progress?: (number: number) => void) {
		const folders = await this.find(folder, { match });
		let completed = 0;

		const promises = folders.map(async (f) => {
			await window.preload.ipc.send.file.delete(f);
			if (progress) {
				progress(++completed);
			}
		});

		return Promise.all(promises);
	}

	public async deleteNodes(
		nodes: {
			type?: "folder" | "file";
			path: string;
		}[]
	) {
		const promises = nodes.map(async ({ path, type }) => {
			switch (type) {
				case "folder":
					return window.preload.ipc.send.file.delete(path, { recursive: true });
				case "file":
					return window.preload.ipc.send.file.delete(path);
			}
		});

		await Promise.all(promises);
	}

	public async find(
		folder: string,
		filter?: {
			match: RegExp;
			inverse?: boolean;
		}
	): Promise<string[]> {
		const files: string[] = [];

		const _files = (await window.preload.ipc.send.file.readdir(folder)).map((f) => this.escapePath(this.pathService.join(folder, f)));

		for (const node of _files) {
			try {
				if (await this.isDir(node)) {
					files.push(...(await this.find(node, filter)));
				} else {
					if (filter === undefined) {
						files.push(node);
					} else {
						const match = Boolean(node.match(filter.match)?.length);
						if ((match && !filter.inverse) || (!match && filter.inverse)) files.push(node);
					}
				}
			} catch {
				//
			}
		}

		return files;
	}

	public async list(folder: string, ignore?: string[]) {
		const files: string[] = [];

		const _files = (await window.preload.ipc.send.file.readdir(folder)).map((f) => this.escapePath(this.pathService.join(folder, f)));

		const promises = _files.map(async (node) => {
			try {
				if (await this.isDir(node)) {
					files.push(node);

					if (!ignore?.some((i) => node.includes(i))) {
						files.push(...(await this.list(node, ignore)));
					}
				}
			} catch {
				//
			}
		});

		await Promise.all(promises);

		return files;
	}

	public async scanDirectoriesByName(
		root: string,
		matchNames: string[],
		options?: {
			ignoreNames?: string[];
			progress?: (scannedFolders: number) => void;
		}
	): Promise<string[]> {
		const names = new Set(matchNames.map((name) => name.toLowerCase()));
		const ignore = new Set((options?.ignoreNames ?? []).map((name) => name.toLowerCase()));
		const results = new Set<string>();
		const queue: string[] = [root];
		let scanned = 0;

		ignore.add("node_modules");

		while (queue.length > 0) {
			const current = queue.pop();
			if (!current) continue;

			try {
				const entries = await window.preload.ipc.send.file.readdirEntries(current);
				scanned += 1;
				options?.progress?.(scanned);

				for (const entry of entries) {
					if (!entry.isDirectory || entry.isSymbolicLink) continue;

					const entryName = entry.name.toLowerCase();
					const nextPath = this.pathService.join(current, entry.name);

					if (names.has(entryName)) {
						results.add(nextPath);
						continue;
					}

					if (ignore.has(entryName)) continue;

					queue.push(nextPath);
				}
			} catch {
				//
			}
		}

		return Array.from(results);
	}

	public async estimateDirectorySize(folder: string, progress?: (scannedFiles: number) => void): Promise<number> {
		const total = await window.preload.ipc.send.file.getDirectorySize(folder);
		progress?.(1);
		return total;
	}

	public async estimateDirectoriesSize(directories: string[], progress?: (processed: number, total: number) => void): Promise<number> {
		let totalSize = 0;
		let processed = 0;

		await Promise.all(
			directories.map(async (dir) => {
				const size = await this.estimateDirectorySize(dir, () => {
					processed += 1;
					progress?.(processed, directories.length);
				});
				totalSize += size;
			})
		);

		return totalSize;
	}

	public escapePath = (path: string) => path.replaceAll("\\", "\\\\");

	async readText(filePath: string) {
		return await window.preload.ipc.send.file.readText(filePath);
	}

	async checkPathExists(path: string) {
		return await window.preload.ipc.send.file.exists(path);
	}

	async ensureDir(dir: string) {
		if (await this.checkPathExists(dir)) return;
		await window.preload.ipc.send.file.mkdir(dir);
	}

	async move(from: string, to: string) {
		await window.preload.ipc.send.file.rename(from, to);
	}

	private async isDir(path: string) {
		return (await window.preload.ipc.send.file.lstat(path)).isDirectory();
	}
}

export default FilesService;
