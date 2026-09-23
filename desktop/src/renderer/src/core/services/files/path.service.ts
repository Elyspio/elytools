import { injectable } from "inversify";

@injectable()
export class PathService {
	private sep!: string;

	constructor() {
		void window.preload.ipc.send.system.getMeta().then((meta) => {
			this.sep = meta.pathSeparator;
		});
	}

	public join(...paths: string[]): string {
		return paths.join(this.sep);
	}

	public dirname(filePath: string): string {
		return filePath.slice(0, filePath.lastIndexOf(this.sep));
	}

	public filename(filePath: string): string {
		return filePath.slice(filePath.lastIndexOf(this.sep) + 1);
	}
}
