import { LogModule } from "../log.module";
import { type ChildProcess, spawn } from "node:child_process";
import { log } from "../../utils/logs.utils";
import { injectable } from "inversify";

export type RunOptions = {
	/** Kills the process when aborted */
	signal?: AbortSignal;
	/** Called with each chunk the process writes on stderr (ffmpeg progress) */
	onStderr?: (chunk: string) => void;
	/** Kills the process when it runs longer than this, in milliseconds */
	timeoutMs?: number;
	/** Kills the process when it writes nothing for this long, in milliseconds (a program reporting its progress) */
	stallMs?: number;
};

/** The process was killed by the `timeoutMs` or `stallMs` watchdog of {@link RunOptions} */
export class ProcessStuckError extends Error {
	public constructor(command: string, reason: "timeout" | "stall", milliseconds: number) {
		super(reason === "timeout" ? `${command} did not finish within ${milliseconds / 1000} s` : `${command} stopped responding (no output for ${milliseconds / 1000} s)`);
		this.name = "ProcessStuckError";
	}
}

export type RunResult = { code: number | null; stdout: string; stderr: string };

@injectable()
export class ProcessModule extends LogModule {
	/** Processes still running, killed when the app quits */
	private readonly running = new Set<ChildProcess>();

	public constructor() {
		super("ProcessModule");
	}

	/**
	 * Runs a command to completion, without a shell: the arguments reach the program as they are.
	 * Only the end of stderr is kept (summary lines such as the ffmpeg metrics); stdout is kept whole.
	 */
	@log.debug((command: string, args: string[]) => `${command} ${args.join(" ")}`)
	public async run(command: string, args: string[], { signal, onStderr, timeoutMs, stallMs }: RunOptions = {}): Promise<RunResult> {
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, signal });
			let stdout = "";
			let stderr = "";
			let error: Error | null = null;

			this.running.add(child);

			// Watchdogs: a hardware encoder can hang without failing
			const stop = (reason: "timeout" | "stall", milliseconds: number) => {
				error ??= new ProcessStuckError(command, reason, milliseconds);
				child.kill();
			};
			const timeout = timeoutMs === undefined ? undefined : setTimeout(() => stop("timeout", timeoutMs), timeoutMs);
			let stall: NodeJS.Timeout | undefined;
			const alive = () => {
				if (stallMs === undefined) return;
				clearTimeout(stall);
				stall = setTimeout(() => stop("stall", stallMs), stallMs);
			};
			alive();

			child.stdout.on("data", (data: Buffer) => {
				alive();
				stdout += data.toString("utf-8");
			});
			child.stderr.on("data", (data: Buffer) => {
				alive();
				const chunk = data.toString("utf-8");
				stderr = (stderr + chunk).slice(-64 * 1024);
				onStderr?.(chunk);
			});
			child.once("error", (e) => {
				// Not started (e.g. ffmpeg missing): no "close" will follow
				if (child.pid === undefined) {
					this.running.delete(child);
					clearTimeout(timeout);
					clearTimeout(stall);
					reject(e);
				} else error ??= e;
			});
			// Settles only once the process is gone, so callers can clean its files up safely
			child.once("close", (code) => {
				this.running.delete(child);
				clearTimeout(timeout);
				clearTimeout(stall);
				if (error) reject(error);
				else resolve({ code, stdout, stderr });
			});
		});
	}

	/**
	 * Kills every process still running (app quit): they are not children Windows ends with the app.
	 */
	public killAll() {
		for (const child of this.running) {
			this.logger.info("Killing process on quit", { pid: child.pid });
			child.kill();
		}
		this.running.clear();
	}
}
