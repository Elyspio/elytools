import { Client, type ConnectConfig, type FileEntryWithStats, type SFTPWrapper, type Stats as SshStats } from "ssh2";
import { inject, injectable } from "inversify";
import fs, { constants as fsConstants } from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { LogModule } from "@main/modules/log.module";
import { ConfigModule } from "@main/modules/config/config.module";
import { SecureStorageModule } from "@main/modules/security/secure-storage.module";
import { IpcModule } from "@main/modules/ipc.module";
import { type SshFolderConfiguration, type SshMachineConfiguration } from "@shared/config/app.config";
import type {
	SshCommandChunkEvent,
	SshCommandCompletedEvent,
	SshCommandRequest,
	SshCommandRun,
	SshConnectionState,
	SshDirectoryEntry,
	SshDirectoryListing,
	SshFolder,
	SshFolderInput,
	SshMachine,
	SshMachineInput,
	SshTransfer,
	SshTransferProgressEvent,
	SshTransferStatus,
} from "@shared/types/ssh.types";

type SessionState = {
	id: string;
	machineId: string;
	path: string;
};

type ConnectionHolder = {
	client: Client;
	state: SshConnectionState;
	connectPromise?: Promise<Client>;
	sftp?: SFTPWrapper;
};

type TransferTask = {
	id: string;
	sessionId: string;
	machineId: string;
	direction: "upload" | "download";
	sourcePath: string;
	targetPath: string;
	totalBytes: number;
	transferredBytes: number;
	cancelled: boolean;
	readStream?: NodeJS.ReadableStream & { destroy?: () => void };
	writeStream?: NodeJS.WritableStream & { destroy?: () => void };
};

type CommandTargetRuntime = {
	runId: string;
	runTargetId: string;
	machineId: string;
	cancelled: boolean;
	stream?: {
		close: () => void;
		destroy: () => void;
		stderr?: {
			on: (event: string, listener: (...args: any[]) => void) => unknown;
		};
		on: (event: string, listener: (...args: any[]) => void) => unknown;
		once: (event: string, listener: (...args: any[]) => void) => unknown;
		write: (chunk: string) => void;
	};
};

@injectable()
export class SshModule extends LogModule {
	private readonly connections = new Map<string, ConnectionHolder>();
	private readonly sessions = new Map<string, SessionState>();
	private readonly transfers = new Map<string, TransferTask>();
	private readonly commandTargets = new Map<string, CommandTargetRuntime>();

	public constructor(
		@inject(ConfigModule) private readonly configModule: ConfigModule,
		@inject(SecureStorageModule) private readonly secureStorageModule: SecureStorageModule,
		@inject(IpcModule) private readonly ipcModule: IpcModule
	) {
		super("SshModule");
	}

	public async listMachines(): Promise<SshMachine[]> {
		const config = await this.configModule.getConfig();
		return [...config.ssh.machines].sort((a, b) => a.name.localeCompare(b.name));
	}

	public async listFolders(): Promise<SshFolder[]> {
		const config = await this.configModule.getConfig();
		return [...config.ssh.folders].sort((a, b) => a.name.localeCompare(b.name));
	}

	public async getMachineCredentials(machineId: string): Promise<{ password?: string; privateKey?: string }> {
		const config = await this.configModule.getConfig();
		const machine = config.ssh.machines.find((m) => m.id === machineId);
		if (!machine) throw new Error(`Machine ${machineId} not found`);
		const result: { password?: string; privateKey?: string } = {};
		if (machine.hasPassword) result.password = await this.secureStorageModule.getMachinePassword(machineId);
		if (machine.hasPrivateKey) result.privateKey = await this.secureStorageModule.getMachinePrivateKey(machineId);
		return result;
	}

	public async saveMachine(input: SshMachineInput): Promise<SshMachine> {
		const config = await this.configModule.getConfig();
		const machineId = input.id ?? randomUUID();
		const current = config.ssh.machines.find((machine) => machine.id === machineId);

		const nextMachine: SshMachineConfiguration = {
			id: machineId,
			name: input.name.trim(),
			host: input.host.trim(),
			port: Number.isFinite(input.port) && input.port > 0 ? input.port : 22,
			user: input.user.trim(),
			publicKey: input.publicKey.trim(),
			hasPassword: current?.hasPassword ?? false,
			hasPrivateKey: current?.hasPrivateKey ?? false,
			folderId: input.folderId !== undefined ? input.folderId : (current?.folderId ?? null),
		};

		if (!nextMachine.name || !nextMachine.host || !nextMachine.user) {
			throw new Error("Name, host and user are required");
		}

		if (input.clearPassword || input.password === "") {
			await this.secureStorageModule.deleteMachinePassword(machineId);
			nextMachine.hasPassword = false;
		} else if (input.password !== undefined) {
			await this.secureStorageModule.setMachinePassword(machineId, input.password);
			nextMachine.hasPassword = true;
		}

		if (input.clearPrivateKey || input.privateKey === "") {
			await this.secureStorageModule.deleteMachinePrivateKey(machineId);
			nextMachine.hasPrivateKey = false;
		} else if (input.privateKey !== undefined) {
			await this.secureStorageModule.setMachinePrivateKey(machineId, input.privateKey);
			nextMachine.hasPrivateKey = true;
		}

		const machines = config.ssh.machines.filter((machine) => machine.id !== machineId);
		machines.push(nextMachine);

		await this.configModule.writeConfig({
			...config,
			ssh: {
				...config.ssh,
				machines,
			},
		});

		await this.disconnectMachine(machineId);

		return nextMachine;
	}

	public async saveFolder(input: SshFolderInput): Promise<SshFolder> {
		const config = await this.configModule.getConfig();
		const folderId = input.id ?? randomUUID();
		const name = input.name.trim();

		if (!name) {
			throw new Error("Folder name is required");
		}

		const folder: SshFolderConfiguration = { id: folderId, name };
		const folders = config.ssh.folders.filter((entry) => entry.id !== folderId);
		folders.push(folder);

		await this.configModule.writeConfig({
			...config,
			ssh: {
				...config.ssh,
				folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
			},
		});

		return folder;
	}

	public async deleteFolder(folderId: string): Promise<void> {
		const config = await this.configModule.getConfig();
		const nextMachines = config.ssh.machines.map((machine) => (machine.folderId === folderId ? { ...machine, folderId: null } : machine));

		await this.configModule.writeConfig({
			...config,
			ssh: {
				...config.ssh,
				machines: nextMachines,
				folders: config.ssh.folders.filter((folder) => folder.id !== folderId),
			},
		});
	}

	public async deleteMachine(machineId: string): Promise<void> {
		const config = await this.configModule.getConfig();

		await this.disconnectMachine(machineId);
		await this.secureStorageModule.deleteMachineSecrets(machineId);
		await this.configModule.writeConfig({
			...config,
			ssh: {
				...config.ssh,
				machines: config.ssh.machines.filter((machine) => machine.id !== machineId),
			},
		});
	}

	public async openSession(machineId: string, requestedPath?: string): Promise<SshDirectoryListing> {
		await this.ensureConnection(machineId);
		const sessionId = randomUUID();
		const initialPath = requestedPath ? await this.resolveRemotePath(machineId, requestedPath) : await this.getHomeDirectory(machineId);

		this.sessions.set(sessionId, {
			id: sessionId,
			machineId,
			path: initialPath,
		});

		return await this.listDirectory(sessionId, initialPath);
	}

	public closeSession(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	public async listDirectory(sessionId: string, requestedPath?: string, useSudo?: boolean): Promise<SshDirectoryListing> {
		const session = this.getSession(sessionId);
		const resolvedPath = await this.resolveRemotePath(session.machineId, requestedPath ?? session.path);

		let entries: SshDirectoryEntry[];
		if (useSudo) {
			entries = await this.listDirectoryAsSudo(session.machineId, resolvedPath);
		} else {
			const sftp = await this.getSftp(session.machineId);
			const rawEntries = await this.readdir(sftp, resolvedPath);
			entries = this.normalizeDirectoryEntries(resolvedPath, rawEntries);
		}

		session.path = resolvedPath;

		return {
			sessionId,
			machineId: session.machineId,
			path: resolvedPath,
			entries,
		};
	}

	private async listDirectoryAsSudo(machineId: string, resolvedPath: string): Promise<SshDirectoryEntry[]> {
		const machine = await this.getMachine(machineId);

		if (machine.user === "root") {
			const sftp = await this.getSftp(machineId);
			const rawEntries = await this.readdir(sftp, resolvedPath);
			return this.normalizeDirectoryEntries(resolvedPath, rawEntries);
		}

		const password = machine.hasPassword ? await this.secureStorageModule.getMachinePassword(machineId) : undefined;
		const findCmd = `find ${this.shellQuote(resolvedPath)} -mindepth 1 -maxdepth 1 -printf '%y\t%s\t%T@\t%f\n'`;
		const result = await this.execRemote(machineId, `sudo -S -p '' ${findCmd}`, password ?? "");

		if (result.exitCode !== 0 && !result.stdout.trim()) {
			throw new Error(`sudo listing failed (exit ${result.exitCode ?? "?"}): ${result.stderr.trim() || "permission denied"}`);
		}

		return this.parseFindOutput(result.stdout, resolvedPath);
	}

	private parseFindOutput(stdout: string, basePath: string): SshDirectoryEntry[] {
		const entries: SshDirectoryEntry[] = [];

		for (const line of stdout.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const tab1 = trimmed.indexOf("\t");
			if (tab1 === -1) continue;
			const tab2 = trimmed.indexOf("\t", tab1 + 1);
			if (tab2 === -1) continue;
			const tab3 = trimmed.indexOf("\t", tab2 + 1);
			if (tab3 === -1) continue;

			const typeChar = trimmed.slice(0, tab1);
			const size = parseInt(trimmed.slice(tab1 + 1, tab2), 10);
			const mtime = parseFloat(trimmed.slice(tab2 + 1, tab3));
			const name = trimmed.slice(tab3 + 1);

			if (!name) continue;

			const type: SshDirectoryEntry["type"] = typeChar === "d" ? "directory" : typeChar === "l" ? "symlink" : "file";

			entries.push({
				name,
				path: path.posix.join(basePath, name),
				type,
				size: Number.isFinite(size) ? size : 0,
				modifiedAt: Number.isFinite(mtime) ? new Date(mtime * 1000).toISOString() : undefined,
			});
		}

		return entries.sort((a, b) => {
			if (a.type === b.type) return a.name.localeCompare(b.name);
			if (a.type === "directory") return -1;
			if (b.type === "directory") return 1;
			return a.name.localeCompare(b.name);
		});
	}

	public async startDownload(sessionId: string, remotePath: string, localDirectory: string): Promise<SshTransfer> {
		const session = this.getSession(sessionId);
		const resolvedRemotePath = await this.resolveRemotePath(session.machineId, remotePath);
		const transfer = this.createTransfer({
			id: randomUUID(),
			sessionId,
			machineId: session.machineId,
			direction: "download",
			sourcePath: resolvedRemotePath,
			targetPath: path.resolve(localDirectory, path.posix.basename(resolvedRemotePath)),
		});

		void this.executeDownload(transfer).catch((error: unknown) => {
			this.handleTransferFailure(transfer, error instanceof Error ? error : new Error(String(error)));
		});

		return this.toTransfer(transfer, "queued");
	}

	public async startUpload(sessionId: string, localPath: string, remoteDirectory: string): Promise<SshTransfer> {
		const session = this.getSession(sessionId);
		const resolvedRemoteDirectory = await this.resolveRemotePath(session.machineId, remoteDirectory);
		const transfer = this.createTransfer({
			id: randomUUID(),
			sessionId,
			machineId: session.machineId,
			direction: "upload",
			sourcePath: path.resolve(localPath),
			targetPath: path.posix.join(resolvedRemoteDirectory, path.basename(localPath)),
		});

		void this.executeUpload(transfer).catch((error: unknown) => {
			this.handleTransferFailure(transfer, error instanceof Error ? error : new Error(String(error)));
		});

		return this.toTransfer(transfer, "queued");
	}

	public cancelTransfer(transferId: string): void {
		const transfer = this.transfers.get(transferId);
		if (!transfer) return;

		transfer.cancelled = true;
		transfer.readStream?.destroy?.();
		transfer.writeStream?.destroy?.();
		this.emitTransferProgress({
			transferId,
			status: "cancelled",
			transferredBytes: transfer.transferredBytes,
			totalBytes: transfer.totalBytes,
		});
		this.transfers.delete(transferId);
	}

	public async runCommand(request: SshCommandRequest): Promise<SshCommandRun> {
		const runId = randomUUID();
		const targets = request.machineIds.map((machineId) => ({
			runTargetId: randomUUID(),
			machineId,
			status: "running" as const,
		}));

		for (const target of targets) {
			this.commandTargets.set(target.runTargetId, {
				runId,
				runTargetId: target.runTargetId,
				machineId: target.machineId,
				cancelled: false,
			});
			void this.executeCommandTarget(runId, target.runTargetId, request, target.machineId).catch((error: unknown) => {
				this.finishCommandTarget(runId, target.runTargetId, target.machineId, null, error instanceof Error ? error.message : String(error), "failed");
			});
		}

		return {
			id: runId,
			command: request.command,
			useSudo: request.useSudo,
			startedAt: new Date().toISOString(),
			targets,
		};
	}

	public stopCommand(runId: string, runTargetId?: string): void {
		for (const target of this.commandTargets.values()) {
			if (target.runId !== runId) continue;
			if (runTargetId && target.runTargetId !== runTargetId) continue;

			target.cancelled = true;
			target.stream?.close();
			target.stream?.destroy();
		}
	}

	private async disconnectMachine(machineId: string): Promise<void> {
		for (const [sessionId, session] of this.sessions.entries()) {
			if (session.machineId === machineId) {
				this.sessions.delete(sessionId);
			}
		}

		const holder = this.connections.get(machineId);
		if (!holder) return;

		holder.client.removeAllListeners();
		holder.client.end();
		holder.sftp?.end?.();
		this.connections.delete(machineId);
		this.emitConnectionStatus(machineId, "disconnected");
	}

	private createTransfer(params: Pick<TransferTask, "id" | "sessionId" | "machineId" | "direction" | "sourcePath" | "targetPath">): TransferTask {
		const transfer: TransferTask = {
			...params,
			totalBytes: 0,
			transferredBytes: 0,
			cancelled: false,
		};
		this.transfers.set(transfer.id, transfer);
		return transfer;
	}

	private toTransfer(transfer: TransferTask, status: SshTransferStatus, error?: string): SshTransfer {
		return {
			id: transfer.id,
			sessionId: transfer.sessionId,
			machineId: transfer.machineId,
			direction: transfer.direction,
			sourcePath: transfer.sourcePath,
			targetPath: transfer.targetPath,
			status,
			transferredBytes: transfer.transferredBytes,
			totalBytes: transfer.totalBytes,
			error,
		};
	}

	private async executeDownload(transfer: TransferTask): Promise<void> {
		const sftp = await this.getSftp(transfer.machineId);
		const remoteStats = await this.statRemote(sftp, transfer.sourcePath);

		if (this.isDirectoryStat(remoteStats)) {
			this.emitTransferProgress({
				transferId: transfer.id,
				status: "running",
				transferredBytes: 0,
				totalBytes: 0,
			});
			await this.executeDirectoryDownloadViaArchive(transfer);
		} else {
			transfer.totalBytes = remoteStats.size;
			this.emitTransferProgress({
				transferId: transfer.id,
				status: "running",
				transferredBytes: transfer.transferredBytes,
				totalBytes: transfer.totalBytes,
			});
			await fsPromises.mkdir(path.dirname(transfer.targetPath), { recursive: true });
			await this.copyRemoteFile(sftp, transfer, transfer.sourcePath, transfer.targetPath);
		}

		if (!transfer.cancelled) {
			this.emitTransferProgress({
				transferId: transfer.id,
				status: "completed",
				transferredBytes: transfer.transferredBytes,
				totalBytes: transfer.totalBytes,
			});
		}

		this.transfers.delete(transfer.id);
	}

	private async executeDirectoryDownloadViaArchive(transfer: TransferTask): Promise<void> {
		const dirName = path.posix.basename(transfer.sourcePath);
		const remoteParent = path.posix.dirname(transfer.sourcePath);
		const archiveName = `${transfer.id}.tar.gz`;
		const remoteArchivePath = `/tmp/${archiveName}`;
		const localArchivePath = path.join(os.tmpdir(), archiveName);
		const localExtractDir = path.dirname(transfer.targetPath);

		try {
			// 1. Create archive on remote
			const result = await this.execRemote(
				transfer.machineId,
				`tar -czf ${this.shellQuote(remoteArchivePath)} -C ${this.shellQuote(remoteParent)} ${this.shellQuote(dirName)}`
			);
			if (result.exitCode !== 0) {
				throw new Error(`Remote tar failed (exit ${result.exitCode}): ${result.stderr.trim() || "unknown error"}`);
			}

			this.assertTransferActive(transfer);

			// 2. Update progress with archive size
			const sftp = await this.getSftp(transfer.machineId);
			const archiveStats = await this.statRemote(sftp, remoteArchivePath);
			transfer.totalBytes = archiveStats.size;
			transfer.transferredBytes = 0;
			this.emitTransferProgress({
				transferId: transfer.id,
				status: "running",
				transferredBytes: 0,
				totalBytes: transfer.totalBytes,
			});

			// 3. Download archive
			await this.copyRemoteFile(sftp, transfer, remoteArchivePath, localArchivePath);

			this.assertTransferActive(transfer);

			// 4. Extract locally using OS tar (available on Windows 10+ and all Linux)
			await fsPromises.mkdir(localExtractDir, { recursive: true });
			await new Promise<void>((resolve, reject) => {
				const proc = spawn("tar", ["-xzf", localArchivePath, "-C", localExtractDir]);
				proc.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`Local tar extract exited with code ${code}`))));
				proc.once("error", reject);
			});
		} finally {
			// Cleanup remote and local temp files
			const sftp = await this.getSftp(transfer.machineId).catch(() => null);
			if (sftp) {
				await new Promise<void>((resolve) => sftp.unlink(remoteArchivePath, () => resolve()));
			}
			await fsPromises.unlink(localArchivePath).catch(() => {});
		}
	}

	/** Escape a string for safe embedding in a POSIX shell single-quoted argument. */
	private shellQuote(value: string): string {
		return `'${value.replace(/'/g, "'\\''")}'`;
	}

	/** Run a command on a remote machine and capture stdout/stderr + exit code.
	 *  Pass `stdinPayload` to write a single line to stdin (e.g. a sudo password for `sudo -S`). */
	private async execRemote(machineId: string, command: string, stdinPayload?: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
		const client = await this.ensureConnection(machineId);
		return new Promise((resolve, reject) => {
			client.exec(command, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}
				let stdout = "";
				let stderr = "";
				if (stdinPayload !== undefined) {
					stream.write(`${stdinPayload}\n`);
				}
				stream.on("data", (chunk: Buffer) => {
					stdout += chunk.toString("utf-8");
				});
				stream.stderr?.on("data", (chunk: Buffer) => {
					stderr += chunk.toString("utf-8");
				});
				stream.once("close", (code: number | null) => resolve({ stdout, stderr, exitCode: code }));
				stream.once("error", (err: Error) => reject(err));
			});
		});
	}

	private async executeUpload(transfer: TransferTask): Promise<void> {
		const sftp = await this.getSftp(transfer.machineId);
		const localStats = await fsPromises.lstat(transfer.sourcePath);
		transfer.totalBytes = await this.getLocalSize(transfer.sourcePath, localStats);
		this.emitTransferProgress({
			transferId: transfer.id,
			status: "running",
			transferredBytes: transfer.transferredBytes,
			totalBytes: transfer.totalBytes,
		});

		if (localStats.isDirectory()) {
			await this.ensureRemoteDirectory(sftp, transfer.targetPath);
			await this.uploadDirectory(sftp, transfer, transfer.sourcePath, transfer.targetPath);
		} else {
			await this.ensureRemoteDirectory(sftp, path.posix.dirname(transfer.targetPath));
			await this.copyLocalFile(sftp, transfer, transfer.sourcePath, transfer.targetPath);
		}

		if (!transfer.cancelled) {
			this.emitTransferProgress({
				transferId: transfer.id,
				status: "completed",
				transferredBytes: transfer.transferredBytes,
				totalBytes: transfer.totalBytes,
			});
		}

		this.transfers.delete(transfer.id);
	}

	private async uploadDirectory(sftp: SFTPWrapper, transfer: TransferTask, localDirectory: string, remoteDirectory: string): Promise<void> {
		this.assertTransferActive(transfer);
		await this.ensureRemoteDirectory(sftp, remoteDirectory);
		const entries = await fsPromises.readdir(localDirectory, { withFileTypes: true });

		for (const entry of entries) {
			this.assertTransferActive(transfer);
			const localPath = path.join(localDirectory, entry.name);
			const remotePath = path.posix.join(remoteDirectory, entry.name);

			if (entry.isDirectory()) {
				await this.uploadDirectory(sftp, transfer, localPath, remotePath);
			} else {
				await this.copyLocalFile(sftp, transfer, localPath, remotePath);
			}
		}
	}

	private async copyRemoteFile(sftp: SFTPWrapper, transfer: TransferTask, remotePath: string, localPath: string): Promise<void> {
		this.assertTransferActive(transfer);
		await fsPromises.mkdir(path.dirname(localPath), { recursive: true });

		await new Promise<void>((resolve, reject) => {
			const readStream = sftp.createReadStream(remotePath);
			const writeStream = fs.createWriteStream(localPath);
			transfer.readStream = readStream;
			transfer.writeStream = writeStream;

			readStream.on("data", (chunk: Buffer) => {
				transfer.transferredBytes += chunk.length;
				this.emitTransferProgress({
					transferId: transfer.id,
					status: transfer.cancelled ? "cancelled" : "running",
					transferredBytes: transfer.transferredBytes,
					totalBytes: transfer.totalBytes,
				});
			});

			const onError = (error: Error) => {
				readStream.destroy();
				writeStream.destroy();
				reject(error);
			};

			readStream.once("error", onError);
			writeStream.once("error", onError);
			writeStream.once("close", () => resolve());

			readStream.pipe(writeStream);
		});
	}

	private async copyLocalFile(sftp: SFTPWrapper, transfer: TransferTask, localPath: string, remotePath: string): Promise<void> {
		this.assertTransferActive(transfer);

		await new Promise<void>((resolve, reject) => {
			const readStream = fs.createReadStream(localPath);
			const writeStream = sftp.createWriteStream(remotePath);
			transfer.readStream = readStream;
			transfer.writeStream = writeStream;

			readStream.on("data", (chunk: Buffer) => {
				transfer.transferredBytes += chunk.length;
				this.emitTransferProgress({
					transferId: transfer.id,
					status: transfer.cancelled ? "cancelled" : "running",
					transferredBytes: transfer.transferredBytes,
					totalBytes: transfer.totalBytes,
				});
			});

			const onError = (error: Error) => {
				readStream.destroy();
				writeStream.destroy();
				reject(error);
			};

			readStream.once("error", onError);
			writeStream.once("error", onError);
			writeStream.once("close", () => resolve());

			readStream.pipe(writeStream);
		});
	}

	private assertTransferActive(transfer: TransferTask): void {
		if (transfer.cancelled) {
			throw new Error("Transfer cancelled");
		}
	}

	private handleTransferFailure(transfer: TransferTask, error: Error): void {
		this.emitTransferProgress({
			transferId: transfer.id,
			status: transfer.cancelled ? "cancelled" : "failed",
			transferredBytes: transfer.transferredBytes,
			totalBytes: transfer.totalBytes,
			error: transfer.cancelled ? undefined : error.message,
		});
		this.transfers.delete(transfer.id);
	}

	private async executeCommandTarget(runId: string, runTargetId: string, request: SshCommandRequest, machineId: string): Promise<void> {
		const machine = await this.getMachine(machineId);
		const password = machine.hasPassword ? await this.secureStorageModule.getMachinePassword(machineId) : undefined;

		if (request.useSudo && machine.user !== "root" && !password) {
			throw new Error(`sudo unavailable on ${machine.name}: no stored password`);
		}

		const client = await this.ensureConnection(machineId);
		const runtime = this.commandTargets.get(runTargetId);
		if (!runtime) {
			throw new Error("SSH command runtime missing");
		}

		const command = request.useSudo && machine.user !== "root" ? `sudo -S -p '' ${request.command}` : request.command;

		await new Promise<void>((resolve, reject) => {
			client.exec(command, { pty: true }, (error, stream) => {
				if (error) {
					reject(error);
					return;
				}

				runtime.stream = stream;

				stream.on("data", (chunk: Buffer) => {
					this.emitCommandChunk({
						runId,
						runTargetId,
						machineId,
						stream: "stdout",
						data: chunk.toString("utf-8"),
						at: new Date().toISOString(),
					});
				});

				stream.stderr?.on("data", (chunk: Buffer) => {
					this.emitCommandChunk({
						runId,
						runTargetId,
						machineId,
						stream: "stderr",
						data: chunk.toString("utf-8"),
						at: new Date().toISOString(),
					});
				});

				stream.once("close", (code: number | null) => {
					const state = this.commandTargets.get(runTargetId);
					this.finishCommandTarget(runId, runTargetId, machineId, code, undefined, state?.cancelled ? "cancelled" : code === 0 ? "completed" : "failed");
					resolve();
				});

				stream.once("error", (streamError: Error) => reject(streamError));

				if (request.useSudo && machine.user !== "root" && password) {
					stream.write(`${password}\n`);
				}
			});
		});
	}

	private finishCommandTarget(
		runId: string,
		runTargetId: string,
		machineId: string,
		exitCode: number | null,
		error?: string,
		status: "completed" | "failed" | "cancelled" = exitCode === 0 ? "completed" : "failed"
	): void {
		const event: SshCommandCompletedEvent = {
			runId,
			runTargetId,
			machineId,
			status,
			exitCode,
			error,
		};
		this.ipcModule.sendIpcToMainContent("ssh:command:completed", event);
		this.commandTargets.delete(runTargetId);
	}

	private emitCommandChunk(event: SshCommandChunkEvent): void {
		this.ipcModule.sendIpcToMainContent("ssh:command:chunk", event);
	}

	private emitTransferProgress(event: SshTransferProgressEvent): void {
		this.ipcModule.sendIpcToMainContent("ssh:transfer:progress", event);
	}

	private emitConnectionStatus(machineId: string, state: SshConnectionState, error?: string): void {
		this.ipcModule.sendIpcToMainContent("ssh:connection:status", {
			machineId,
			state,
			error,
		});
	}

	private async getMachine(machineId: string): Promise<SshMachineConfiguration> {
		const config = await this.configModule.getConfig();
		const machine = config.ssh.machines.find((entry) => entry.id === machineId);
		if (!machine) {
			throw new Error(`Machine ${machineId} not found`);
		}
		return machine;
	}

	private getSession(sessionId: string): SessionState {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`SSH session ${sessionId} not found`);
		}
		return session;
	}

	private async ensureConnection(machineId: string): Promise<Client> {
		const existing = this.connections.get(machineId);
		if (existing?.state === "connected") {
			return existing.client;
		}
		if (existing?.connectPromise) {
			return await existing.connectPromise;
		}

		const machine = await this.getMachine(machineId);
		const client = existing?.client ?? new Client();
		const holder: ConnectionHolder = existing ?? { client, state: "disconnected" };
		holder.client = client;
		holder.state = "connecting";
		holder.sftp = undefined;
		this.connections.set(machineId, holder);
		this.emitConnectionStatus(machineId, "connecting");

		holder.connectPromise = (async () => {
			const password = machine.hasPassword ? await this.secureStorageModule.getMachinePassword(machineId) : undefined;
			const privateKey = machine.hasPrivateKey ? await this.secureStorageModule.getMachinePrivateKey(machineId) : undefined;

			if (!privateKey && !password) {
				throw new Error(`No SSH authentication configured for ${machine.name}`);
			}

			const config: ConnectConfig = {
				host: machine.host,
				port: machine.port,
				username: machine.user,
				privateKey: privateKey || undefined,
				password: privateKey ? undefined : password,
				passphrase: privateKey && password ? password : undefined,
				keepaliveInterval: 10_000,
				keepaliveCountMax: 3,
				readyTimeout: 20_000,
			};

			return await new Promise<Client>((resolve, reject) => {
				const cleanup = () => {
					client.removeListener("ready", onReady);
					client.removeListener("error", onError);
				};

				const onReady = () => {
					holder.state = "connected";
					holder.connectPromise = undefined;
					this.emitConnectionStatus(machineId, "connected");
					cleanup();
					resolve(client);
				};

				const onError = (error: Error) => {
					holder.state = "error";
					holder.connectPromise = undefined;
					holder.sftp = undefined;
					this.emitConnectionStatus(machineId, "error", error.message);
					cleanup();
					reject(error);
				};

				client.once("ready", onReady);
				client.once("error", onError);
				client.once("close", () => {
					holder.state = "disconnected";
					holder.connectPromise = undefined;
					holder.sftp = undefined;
					this.emitConnectionStatus(machineId, "disconnected");
				});
				client.connect(config);
			});
		})();

		return await holder.connectPromise;
	}

	private async getSftp(machineId: string): Promise<SFTPWrapper> {
		const holder = this.connections.get(machineId);
		if (holder?.sftp) {
			return holder.sftp;
		}

		const client = await this.ensureConnection(machineId);
		const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
			client.sftp((error, nextSftp) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(nextSftp);
			});
		});

		const updatedHolder = this.connections.get(machineId);
		if (updatedHolder) {
			updatedHolder.sftp = sftp;
		}

		return sftp;
	}

	private async getHomeDirectory(machineId: string): Promise<string> {
		const sftp = await this.getSftp(machineId);
		return await new Promise<string>((resolve, reject) => {
			sftp.realpath(".", (error, absPath) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(absPath);
			});
		});
	}

	private async resolveRemotePath(machineId: string, remotePath: string): Promise<string> {
		const sftp = await this.getSftp(machineId);
		const inputPath = remotePath.trim() || ".";
		return await new Promise<string>((resolve) => {
			sftp.realpath(inputPath, (error, absPath) => {
				if (!error && absPath) {
					resolve(absPath);
					return;
				}
				resolve(path.posix.normalize(inputPath));
			});
		});
	}

	private async readdir(sftp: SFTPWrapper, remotePath: string): Promise<FileEntryWithStats[]> {
		return await new Promise<FileEntryWithStats[]>((resolve, reject) => {
			sftp.readdir(remotePath, (error, list) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(list);
			});
		});
	}

	private normalizeDirectoryEntries(basePath: string, entries: FileEntryWithStats[]): SshDirectoryEntry[] {
		return entries
			.filter((entry) => entry.filename !== "." && entry.filename !== "..")
			.map((entry) => ({
				name: entry.filename,
				path: path.posix.join(basePath, entry.filename),
				type: this.getEntryType(entry.attrs),
				size: entry.attrs.size,
				modifiedAt: entry.attrs.mtime ? new Date(entry.attrs.mtime * 1000).toISOString() : undefined,
			}))
			.sort((a, b) => {
				if (a.type === b.type) {
					return a.name.localeCompare(b.name);
				}
				if (a.type === "directory") return -1;
				if (b.type === "directory") return 1;
				return a.name.localeCompare(b.name);
			});
	}

	private getEntryType(stats: Pick<SshStats, "mode">): SshDirectoryEntry["type"] {
		if (this.isDirectoryStat(stats)) return "directory";
		if ((stats.mode & fsConstants.S_IFMT) === fsConstants.S_IFLNK) return "symlink";
		return "file";
	}

	private isDirectoryStat(stats: Pick<SshStats, "mode">): boolean {
		return (stats.mode & fsConstants.S_IFMT) === fsConstants.S_IFDIR;
	}

	private async statRemote(sftp: SFTPWrapper, remotePath: string): Promise<SshStats> {
		return await new Promise<SshStats>((resolve, reject) => {
			sftp.stat(remotePath, (error, stats) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stats);
			});
		});
	}

	private async getLocalSize(localPath: string, stats?: fs.Stats): Promise<number> {
		const currentStats = stats ?? (await fsPromises.lstat(localPath));
		if (!currentStats.isDirectory()) {
			return currentStats.size;
		}

		let total = 0;
		const entries = await fsPromises.readdir(localPath, { withFileTypes: true });
		for (const entry of entries) {
			total += await this.getLocalSize(path.join(localPath, entry.name));
		}
		return total;
	}

	private async ensureRemoteDirectory(sftp: SFTPWrapper, remoteDirectory: string): Promise<void> {
		const segments = remoteDirectory.split("/").filter(Boolean);
		let current = remoteDirectory.startsWith("/") ? "/" : "";

		for (const segment of segments) {
			current = current === "/" ? `/${segment}` : current ? `${current}/${segment}` : segment;
			try {
				const stats = await this.statRemote(sftp, current);
				if (!this.isDirectoryStat(stats)) {
					throw new Error(`Remote path ${current} exists and is not a directory`);
				}
			} catch (error) {
				if (error instanceof Error && error.message.includes("not a directory")) {
					throw error;
				}
				await new Promise<void>((resolve, reject) => {
					sftp.mkdir(current, (error) => {
						if (error && !error.message.includes("Failure")) {
							reject(error);
							return;
						}
						resolve();
					});
				});
			}
		}
	}
}
