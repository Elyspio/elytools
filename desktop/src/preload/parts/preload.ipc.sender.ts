import { ipcRendererWrapper } from "./preload.ipc.wrapper";
import { GetInformationKey, GetInformationResult } from "../../shared/ipc/ipc.handled.events";
import { appIpcSender } from "./ipc/sender/app.sender.ipc.preload";
import { LatestConfig } from "@shared/config/app.config";
import { ExecOptions, SpawnOptions } from "node:child_process";
import { DirectoryEntry, GetFolderResult } from "@shared/types/dialog.types";
import { ExecResult, SpawnResult } from "@shared/types/process.types";
import { RmDirOptions } from "fs";
import { Stats } from "node:fs";
import { FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import { NyaaTorrentItem, TorrentAddResult } from "@shared/types/torrent.types";
import { OidcAuthStatus } from "@shared/types/auth.types";
import { SelectPathsOptions } from "@shared/types/dialog.types";
import { SshCommandRequest, SshCommandRun, SshDirectoryListing, SshMachine, SshMachineInput, SshTransfer } from "@shared/types/ssh.types";

export function getIpcSender() {
	return {
		app: appIpcSender,

		config: {
			local: {
				async get() {
					return await ipcRendererWrapper.invoke("config:local:get");
				},
				async set(config: LatestConfig) {
					await ipcRendererWrapper.invoke("config:local:set", config);
				},
				async regenerate() {
					return await ipcRendererWrapper.invoke("config:local:regenerate");
				},
			},
		},
		dialog: {
			selectDirectory: async <WithFiles extends boolean>(returnsFiles: WithFiles) => {
				return (await ipcRendererWrapper.invoke("dialog:selectDirectory", returnsFiles)) as GetFolderResult<WithFiles>;
			},
			selectPaths: async (options?: SelectPathsOptions): Promise<string[] | null> => {
				return await ipcRendererWrapper.invoke("dialog:selectPaths", options);
			},
		},
		process: {
			exec: async (command: string, args: string[], options: ExecOptions): Promise<ExecResult> => {
				return await ipcRendererWrapper.invoke("process:exec", command, args, options);
			},
			spawn: async (command: string, args: string[], options: SpawnOptions): Promise<SpawnResult> => {
				return await ipcRendererWrapper.invoke("process:spawn", command, args, options);
			},
			kill: async (pid: string, signal: NodeJS.Signals | number) => {
				return await ipcRendererWrapper.invoke("process:kill", pid, signal);
			},
			ffmpeg: {
				isAvailable: async () => await ipcRendererWrapper.invoke("process:ffmpeg:get:available"),
				convert: async (opts: FfmpegConvertOptions) => {
					return await ipcRendererWrapper.invoke("process:ffmpeg:convert", opts);
				},
				getEncoders: async () => {
					return await ipcRendererWrapper.invoke("process:ffmpeg:get:encoders");
				},
				probe: async (path: string) => {
					return await ipcRendererWrapper.invoke("process:ffmpeg:get:info", path);
				},
			},
		},
		file: {
			write: async (filePath: string, binaryContent: Uint8Array) => {
				return await ipcRendererWrapper.invoke("file:write", filePath, binaryContent);
			},
			readText: async (filePath: string): Promise<string> => {
				return await ipcRendererWrapper.invoke("file:read:text", filePath);
			},
			async getRandomTempFilePath(filename: string) {
				return await ipcRendererWrapper.invoke("file:temp:get", filename);
			},
			async delete(filepath: string, config?: RmDirOptions) {
				return await ipcRendererWrapper.invoke("file:delete", filepath, config);
			},
			async exists(filepath: string) {
				return await ipcRendererWrapper.invoke("file:exists", filepath);
			},
			async mkdir(dirpath: string) {
				return await ipcRendererWrapper.invoke("file:directory:create", dirpath);
			},
			async rename(from: string, to: string) {
				return await ipcRendererWrapper.invoke("file:rename", from, to);
			},
			async lstat(filepath: string): Promise<Stats> {
				return await ipcRendererWrapper.invoke("file:lstat", filepath);
			},
			async readdir(folder: string, recursively?: boolean): Promise<string[]> {
				return await ipcRendererWrapper.invoke("file:directory:read", folder, recursively);
			},
			async readdirEntries(folder: string): Promise<DirectoryEntry[]> {
				return await ipcRendererWrapper.invoke("file:directory:read:entries", folder);
			},
			async getDirectorySize(folder: string): Promise<number> {
				return await ipcRendererWrapper.invoke("file:directory:size", folder);
			},
		},
		system: {
			/**
			 * Récupère des informations sur le système
			 * @param key
			 */
			async getInformation<K extends GetInformationKey>(key: K) {
				return (await ipcRendererWrapper.invoke("system:info:get", key)) as GetInformationResult[K];
			},
			async getMeta() {
				return await ipcRendererWrapper.invoke("system:meta:get");
			},
		},
		update: {
			/**
			 * Vérifie s'il y a une mise à jour disponible
			 */
			check() {
				return ipcRendererWrapper.invoke("update:check");
			},
			/**
			 * Lance le téléchargement de la mise à jour
			 */
			download() {
				return ipcRendererWrapper.invoke("update:download:start");
			},
			/**
			 * Quitte l'application et installe la mise à jour
			 */
			quitAndInstall() {
				return ipcRendererWrapper.invoke("update:quit-and-install");
			},
		},
		window: {
			/**
			 * Récupère l'id de la window
			 */
			getId() {
				return ipcRendererWrapper.invoke("window:id:get");
			},
		},
		auth: {
			oidc: {
				startLogin: async () => {
					await ipcRendererWrapper.invoke("auth:oidc:login:start");
				},
				cancelLogin: () => {
					void ipcRendererWrapper.invoke("auth:oidc:login:cancel");
				},
				logout: async () => {
					await ipcRendererWrapper.invoke("auth:oidc:logout");
				},
				status: async (): Promise<OidcAuthStatus> => {
					return await ipcRendererWrapper.invoke("auth:oidc:status:get");
				},
			},
		},
		ssh: {
			folders: {
				list: async () => {
					return await ipcRendererWrapper.invoke("ssh:folders:list");
				},
				save: async (folder: { id?: string; name: string }) => {
					return await ipcRendererWrapper.invoke("ssh:folder:save", folder);
				},
				delete: async (folderId: string) => {
					await ipcRendererWrapper.invoke("ssh:folder:delete", folderId);
				},
			},
			machines: {
				list: async (): Promise<SshMachine[]> => {
					return await ipcRendererWrapper.invoke("ssh:machines:list");
				},
				save: async (machine: SshMachineInput): Promise<SshMachine> => {
					return await ipcRendererWrapper.invoke("ssh:machine:save", machine);
				},
				delete: async (machineId: string): Promise<void> => {
					await ipcRendererWrapper.invoke("ssh:machine:delete", machineId);
				},
				getCredentials: async (machineId: string): Promise<{ password?: string; privateKey?: string }> => {
					return await ipcRendererWrapper.invoke("ssh:machine:credentials", machineId);
				},
			},
			sessions: {
				open: async (machineId: string, path?: string): Promise<SshDirectoryListing> => {
					return await ipcRendererWrapper.invoke("ssh:session:open", machineId, path);
				},
				close: async (sessionId: string): Promise<void> => {
					await ipcRendererWrapper.invoke("ssh:session:close", sessionId);
				},
				listDirectory: async (sessionId: string, nextPath?: string, useSudo?: boolean): Promise<SshDirectoryListing> => {
					return await ipcRendererWrapper.invoke("ssh:session:list-directory", sessionId, nextPath, useSudo);
				},
			},
			transfers: {
				download: async (sessionId: string, remotePath: string, localDirectory: string): Promise<SshTransfer> => {
					return await ipcRendererWrapper.invoke("ssh:transfer:download", sessionId, remotePath, localDirectory);
				},
				upload: async (sessionId: string, localPath: string, remoteDirectory: string): Promise<SshTransfer> => {
					return await ipcRendererWrapper.invoke("ssh:transfer:upload", sessionId, localPath, remoteDirectory);
				},
				cancel: async (transferId: string): Promise<void> => {
					await ipcRendererWrapper.invoke("ssh:transfer:cancel", transferId);
				},
			},
			command: {
				run: async (request: SshCommandRequest): Promise<SshCommandRun> => {
					return await ipcRendererWrapper.invoke("ssh:command:run", request);
				},
				stop: async (runId: string, runTargetId?: string): Promise<void> => {
					await ipcRendererWrapper.invoke("ssh:command:stop", runId, runTargetId);
				},
			},
		},
		torrent: {
			qbittorrent: {
				addFromUrl: async (torrentUrl: string, infoHash?: string): Promise<TorrentAddResult> => {
					return await ipcRendererWrapper.invoke("torrent:qbittorrent:add-from-url", torrentUrl, infoHash);
				},
				getExistingHashes: async (): Promise<string[]> => {
					return await ipcRendererWrapper.invoke("torrent:qbittorrent:get-hashes");
				},
			},
			nyaa: {
				list: async (query: string): Promise<NyaaTorrentItem[]> => {
					return await ipcRendererWrapper.invoke("torrent:nyaa:list", query);
				},
			},
		},
	};
}

export type PreloadExposedIpc = ReturnType<typeof getIpcSender>;
