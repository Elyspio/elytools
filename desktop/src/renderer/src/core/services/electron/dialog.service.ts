import { injectable } from "inversify";
import { SelectPathsOptions } from "@shared/types/dialog.types";

@injectable()
export class DialogService {
	/**
	 * @param returnFiles flag to make the function return files in the folder
	 */
	public async selectFolder<WithFiles extends boolean>(returnFiles: WithFiles) {
		const result = await window.preload.ipc.send.dialog.selectDirectory<WithFiles>(returnFiles);

		if (!result) return null;

		return result;
	}

	public async selectFiles() {
		const result = await window.preload.ipc.send.dialog.selectPaths({
			allowFiles: true,
			allowDirectories: false,
			multiSelections: true,
		});

		if (!result) return [];

		return result.map((path) => ({
			path,
			name: path.split(/[\\/]/).at(-1) ?? path,
			size: 0,
			type: "file" as const,
		}));
	}

	public async selectPaths(options?: SelectPathsOptions) {
		return (await window.preload.ipc.send.dialog.selectPaths(options)) ?? [];
	}
}
