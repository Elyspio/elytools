import { injectable } from "inversify";

import { SpawnResult, SpawnResultError } from "@shared/types/process.types";

const processGuards = {
	spawn: {
		isError: (result: SpawnResult): result is SpawnResultError => (result as SpawnResultError).error !== undefined,
	},
};

@injectable()
export class ProcessService {
	async spawn(binary: string, param: string[], folder?: string) {
		const result = await window.preload.ipc.send.process.spawn(binary, param, { cwd: folder });

		if (processGuards.spawn.isError(result)) {
			throw new TypeError(`Error spawning process ${binary} with params ${param.join(" ")} in folder ${folder}: ${result.error}`);
		}

		return result.pid;
	}

	async exec(command: string, args: string[] = [], folder?: string) {
		return window.preload.ipc.send.process.exec(command, args, { cwd: folder });
	}

	async isInstalled(app: string) {
		let command = "";
		switch (window.preload.config.platform) {
			case "win32":
				command = `where`;
				break;
			case "linux":
				command = `which`;
				break;
		}

		try {
			return (await this.exec(command, [app], process.cwd())).stderr.length === 0;
		} catch {
			return false;
		}
	}

	async kill(pid: string) {
		return window.preload.ipc.send.process.kill(pid, "SIGKILL");
	}
}
