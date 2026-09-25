import type { IpcMainInvokeEvent } from "electron";
import type { LatestConfig } from "../config/app.config";
import type { GetInformationKey, GetInformationResult } from "./payload/ipc.system.payload";
import type { ExecOptions, SpawnOptions } from "node:child_process";
import type { DirectoryEntry, GetFolderResult, SelectPathsOptions } from "@shared/types/dialog.types";
import type { ExecResult, SpawnResult } from "@shared/types/process.types";
import { RmDirOptions, Stats } from "node:fs";
import { Encoder, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import type { NyaaTorrentItem, TorrentAddResult } from "@shared/types/torrent.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";
import type { SshCommandRequest, SshCommandRun, SshDirectoryListing, SshMachine, SshMachineInput, SshTransfer } from "@shared/types/ssh.types";

export type Dimensions = {
	width: number;
	height: number;
};

/**
 * Les événements IPC qui sont envoyés par les browserWindow vers le process main.
 *
 * Attention il faut que la callback prenne en paramètre un event de type Electron.IpcMainInvokeEvent
 */
export interface IpcHandledEvents {
	"app:close": (event: IpcMainInvokeEvent) => void;
	"app:context-menu": (event: IpcMainInvokeEvent) => void;
	"app:hide": (event: IpcMainInvokeEvent) => void;
	/**
	 * Indique que la main window est prête à recevoir des événements
	 */
	"app:ipc:main-ready": (event: IpcMainInvokeEvent) => void;
	"app:launch-on-start-up:get": (event: IpcMainInvokeEvent) => boolean;
	"app:launch-on-start-up:set": (event: IpcMainInvokeEvent, value: boolean) => Promise<void>;
	"app:reload": (event: IpcMainInvokeEvent) => Promise<void>;
	"app:screen:is-fullscreen": (event: IpcMainInvokeEvent) => boolean;
	"app:screen:minimize": (event: IpcMainInvokeEvent) => void;
	"app:screen:size:get": (event: IpcMainInvokeEvent) => Dimensions;
	"app:screen:size:set": (event: IpcMainInvokeEvent, value: Dimensions) => void;
	"app:screen:toggle-fullscreen": (event: IpcMainInvokeEvent) => void;
	"app:version:public:get": (event: IpcMainInvokeEvent) => string;
	"config:local:get": (event: IpcMainInvokeEvent) => Promise<LatestConfig>;
	"config:local:regenerate": (event: IpcMainInvokeEvent) => Promise<LatestConfig>;
	"config:local:set": (event: IpcMainInvokeEvent, config: LatestConfig) => Promise<void>;
	"dialog:selectDirectory": <WithFiles extends boolean>(event: IpcMainInvokeEvent, returnFiles: WithFiles) => Promise<GetFolderResult<WithFiles>>;
	"dialog:selectPaths": (event: IpcMainInvokeEvent, options?: SelectPathsOptions) => Promise<string[] | null>;
	"file:write": (event: IpcMainInvokeEvent, filePath: string, binaryContent: Uint8Array) => Promise<void>;
	"file:read:text": (event: IpcMainInvokeEvent, filePath: string) => Promise<string>;
	"file:temp:get": (event: IpcMainInvokeEvent, filename: string) => string;
	"file:delete": (event: IpcMainInvokeEvent, filename: string, options?: RmDirOptions) => Promise<void>;
	"file:exists": (event: IpcMainInvokeEvent, filename: string) => Promise<boolean>;
	"file:rename": (event: IpcMainInvokeEvent, from: string, to: string) => Promise<void>;
	"file:directory:create": (event: IpcMainInvokeEvent, filename: string) => Promise<void>;
	"file:directory:read": (event: IpcMainInvokeEvent, filename: string, recursively?: boolean) => Promise<string[]>;
	"file:directory:read:entries": (event: IpcMainInvokeEvent, filename: string) => Promise<DirectoryEntry[]>;
	"file:directory:size": (event: IpcMainInvokeEvent, filename: string) => Promise<number>;
	"file:lstat": (event: IpcMainInvokeEvent, filename: string) => Promise<Stats>;
	/**
	 * Exécute une commande et retourne le résultat une fois terminée
	 * @param event
	 * @param command
	 * @param args
	 * @param options
	 */
	"process:exec": (event: IpcMainInvokeEvent, command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;

	/**
	 * Lance une commande et retourne immédiatement l'id du process
	 * @param event
	 * @param command
	 * @param args
	 * @param options
	 */
	"process:spawn": (event: IpcMainInvokeEvent, command: string, args: string[], options: SpawnOptions) => Promise<SpawnResult>;

	/**
	 * Vérifie si ffmpeg est disponible sur le système
	 */
	"process:ffmpeg:get:available": (event: IpcMainInvokeEvent) => Promise<boolean>;

	/**
	 * Vérifie si ffmpeg est disponible sur le système
	 */
	"process:ffmpeg:get:info": (event: IpcMainInvokeEvent, path: string) => Promise<FfprobeResult>;

	/**
	 * Convertit une vidéo avec ffmpeg
	 * @param opts
	 * @return l'id du process ffmpeg
	 * @
	 */
	"process:ffmpeg:convert": (event: IpcMainInvokeEvent, opts: FfmpegConvertOptions) => Promise<string>;

	/**
	 * Récupère la liste des encodeurs disponibles dans ffmpeg
	 * @param event
	 */
	"process:ffmpeg:get:encoders": (event: IpcMainInvokeEvent) => Promise<Encoder[]>;

	/**
	 * Tue un process par son pid
	 * @param event
	 * @param pid id du process
	 * @param signal signal à envoyer au process
	 */
	"process:kill": (event: IpcMainInvokeEvent, pid: string, signal: NodeJS.Signals | number) => void;

	"system:info:get": <T extends GetInformationKey>(event: IpcMainInvokeEvent, key: T) => GetInformationResult[T];
	"system:meta:get": (event: IpcMainInvokeEvent) => Promise<{
		eol: string;
		pathSeparator: string;
	}>;
	/**
	 * Lance la vérification de s'il y a une mise à jour disponible
	 */
	"update:check": (event: IpcMainInvokeEvent) => Promise<void>;
	/**
	 * Lance le téléchargement de la mise à jour
	 */
	"update:download:start": (event: IpcMainInvokeEvent) => Promise<void>;
	/**
	 * Quitte l'application et installe la mise à jour
	 */
	"update:quit-and-install": (event: IpcMainInvokeEvent) => void;
	/**
	 * Récupère l'id de la window
	 */
	"window:id:get": (event: IpcMainInvokeEvent) => number;
	"torrent:nyaa:list": (event: IpcMainInvokeEvent, query: string) => Promise<NyaaTorrentItem[]>;
	"torrent:qbittorrent:add-from-url": (event: IpcMainInvokeEvent, torrentUrl: string, infoHash?: string) => Promise<TorrentAddResult>;
	"torrent:qbittorrent:get-hashes": (event: IpcMainInvokeEvent) => Promise<string[]>;
	"auth:oidc:login:start": (event: IpcMainInvokeEvent) => Promise<void>;
	"auth:oidc:login:cancel": (event: IpcMainInvokeEvent) => void;
	"auth:oidc:logout": (event: IpcMainInvokeEvent) => Promise<void>;
	"auth:oidc:status:get": (event: IpcMainInvokeEvent) => Promise<OidcAuthStatus>;
	"llm-usage:status:get": (event: IpcMainInvokeEvent) => Promise<LlmUsageStatus>;
	/**
	 * Lit les nouveaux journaux Claude Code / Codex et envoie l'usage à LLM Usage Monitor
	 */
	"llm-usage:sync": (event: IpcMainInvokeEvent) => Promise<LlmUsageStatus>;
	"ssh:machines:list": (event: IpcMainInvokeEvent) => Promise<SshMachine[]>;
	"ssh:folders:list": (event: IpcMainInvokeEvent) => Promise<import("@shared/types/ssh.types").SshFolder[]>;
	"ssh:machine:save": (event: IpcMainInvokeEvent, machine: SshMachineInput) => Promise<SshMachine>;
	"ssh:machine:delete": (event: IpcMainInvokeEvent, machineId: string) => Promise<void>;
	"ssh:machine:credentials": (event: IpcMainInvokeEvent, machineId: string) => Promise<{ password?: string; privateKey?: string }>;
	"ssh:folder:save": (event: IpcMainInvokeEvent, folder: import("@shared/types/ssh.types").SshFolderInput) => Promise<import("@shared/types/ssh.types").SshFolder>;
	"ssh:folder:delete": (event: IpcMainInvokeEvent, folderId: string) => Promise<void>;
	"ssh:session:open": (event: IpcMainInvokeEvent, machineId: string, path?: string) => Promise<SshDirectoryListing>;
	"ssh:session:close": (event: IpcMainInvokeEvent, sessionId: string) => void;
	"ssh:session:list-directory": (event: IpcMainInvokeEvent, sessionId: string, path?: string, useSudo?: boolean) => Promise<SshDirectoryListing>;
	"ssh:transfer:download": (event: IpcMainInvokeEvent, sessionId: string, remotePath: string, localDirectory: string) => Promise<SshTransfer>;
	"ssh:transfer:upload": (event: IpcMainInvokeEvent, sessionId: string, localPath: string, remoteDirectory: string) => Promise<SshTransfer>;
	"ssh:transfer:cancel": (event: IpcMainInvokeEvent, transferId: string) => void;
	"ssh:command:run": (event: IpcMainInvokeEvent, request: SshCommandRequest) => Promise<SshCommandRun>;
	"ssh:command:stop": (event: IpcMainInvokeEvent, runId: string, runTargetId?: string) => void;
}

export type * from "./payload/ipc.system.payload";
export type * from "../types/stubs/systeminformations.stub";
