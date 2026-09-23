import { LogModule } from "../log.module";
import { ChildProcess, exec, type ExecOptions, spawn, type SpawnOptions } from "node:child_process";
import { log } from "../../utils/logs.utils";
import { inject, injectable } from "inversify";
import { text } from "node:stream/consumers";
import { type SpawnResult } from "@shared/types/process.types";
import { IpcModule } from "@main/modules/ipc.module";

@injectable()
export class ProcessModule extends LogModule {
	@inject(IpcModule)
	private readonly ipcModule!: IpcModule;
	/**
	 * Map des processus enfants lancés par leur PID
	 * @private
	 */
	private readonly cache: Map<string, ChildProcess> = new Map();

	public constructor() {
		super("ProcessModule");
	}

	@log.debug()
	public async execute(command: string, options: ExecOptions = {}) {
		return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
			exec(command, options, (error, stdout, stderr) => {
				if (error) {
					this.logger.error("Command failed", { command, stdout, stderr });
					reject(error);
				} else {
					resolve({
						stdout: stdout.toString(),
						stderr: stderr.toString(),
					});
				}
			});
		});
	}

	@log.debug()
	async spawn(command: string, args: string[], options: SpawnOptions): Promise<SpawnResult> {
		const process = spawn(command, args, { ...options, stdio: "pipe" });

		const pid = process.pid?.toString();

		if (!pid) {
			return { error: await text(process.stderr) };
		}

		this.cache.set(pid, process);

		process.stderr.on("data", (data: Buffer) => {
			this.logger.debug("Process stderr", { pid: pid, data: data.toString("utf-8") });
			this.ipcModule.sendIpcToMainContent("process:spawn:stderr", pid, data.toString("utf-8"));
		});

		process.stdout.on("data", (data: Buffer) => {
			this.logger.debug("Process stdout", { pid: pid, data: data.toString("utf-8") });
			this.ipcModule.sendIpcToMainContent("process:spawn:stdout", pid, data.toString("utf-8"));
		});

		process.once("close", (code, signal) => {
			this.logger.info("Process exit", { pid: pid, code: code, signal: signal });
			process.stderr.removeAllListeners();
			process.stdout.removeAllListeners();
			this.ipcModule.sendIpcToMainContent("process:spawn:exit", pid, code, signal);
		});

		return { pid: pid };
	}

	kill(pid: string, signal: NodeJS.Signals | number) {
		const process = this.cache.get(pid);

		if (!process) {
			this.logger.error("Process not found", { pid: pid });
			return;
		}

		process.kill(signal);
		this.cache.delete(pid);
	}
}
