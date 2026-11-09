import { injectable } from "inversify";
import type { UpdateStatus } from "@shared/types/update.types";

@injectable()
export class UpdateService {
	public status() {
		return window.preload.ipc.send.update.status();
	}

	public onStatus(callback: (status: UpdateStatus) => void) {
		return window.preload.ipc.on.update.status(callback);
	}

	public check() {
		return window.preload.ipc.send.update.check();
	}

	public download() {
		return window.preload.ipc.send.update.download();
	}

	public quitAndInstall() {
		return window.preload.ipc.send.update.quitAndInstall();
	}
}
