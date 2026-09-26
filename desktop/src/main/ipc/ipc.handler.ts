import { GetInformationKey, GetInformationResult, IpcHandledEvents } from "@shared/ipc/ipc.handled.events";
import * as Electron from "electron";
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from "electron";
import { HIDDEN_ARG, WindowModule } from "../modules/window/window.module";
import { ConfigModule } from "../modules/config/config.module";
import si from "systeminformation";
import { UpdateModule } from "../modules/update.module";
import { FileModule } from "../modules/file.module";
import { mainContainer } from "@main/di/container.di";
import { ProcessModule } from "@main/modules/process/process.module";
import { ExecResult, SpawnResult } from "@shared/types/process.types";
import { Stats } from "node:fs";
import { FfmpegProcessModule } from "@main/modules/process/ffmpeg.process.module";
import { Encoder, FfmpegConvertOptions } from "@shared/types/ffmpeg.types";
import type { FfprobeResult } from "@shared/types/ffprobe.types";
import path from "node:path";
import os from "os";
import { NyaaModule } from "@main/modules/torrent/nyaa.module";
import { QBittorrentModule } from "@main/modules/torrent/qbittorrent.module";
import { OidcModule } from "@main/modules/auth/oidc.module";
import { SshModule } from "@main/modules/ssh/ssh.module";
import { LlmUsageModule } from "@main/modules/llm-usage/llm-usage.module";

const ipcHandlers: IpcHandledEvents = {
	"system:meta:get"(): Promise<{
		eol: string;
		pathSeparator: string;
	}> {
		return Promise.resolve({
			eol: os.EOL,
			pathSeparator: path.sep,
		});
	},
	"app:close"(event): void {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		win.close();
	},
	"app:context-menu"(event) {
		const win = BrowserWindow.fromWebContents(event.sender)!;

		// Récupérer la sélection de texte
		void event.sender
			.executeJavaScript(
				`
			(function() {
				const selection = window.getSelection();
				const isEditable = document.activeElement && 
								   (document.activeElement.isContentEditable || 
								   document.activeElement.tagName === 'TEXTAREA' || 
								   document.activeElement.tagName === 'INPUT');
	
				return { hasSelection: !!selection.toString(), isEditable: isEditable };
			})();
		`
			)
			.then(({ hasSelection, isEditable }) => {
				// Créer le menu contextuel personnalisé
				const contextMenu = new Electron.Menu();

				if (hasSelection) {
					contextMenu.append(new Electron.MenuItem({ role: "copy", label: "Copier" }));
					if (isEditable) {
						contextMenu.append(new Electron.MenuItem({ role: "cut", label: "Couper" }));
					}
				}

				if (isEditable) {
					contextMenu.append(new Electron.MenuItem({ role: "paste", label: "Coller" }));
				}

				// Afficher le menu contextuel si au moins un élément est présent
				if (contextMenu.items.length > 0) {
					contextMenu.popup({ window: win });
				}
			});
	},
	"app:hide"(event) {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		win.hide();
	},
	"app:ipc:main-ready"() {
		// noinspection JSIgnoredPromiseFromCall
		void mainContainer.get(UpdateModule).checkForUpdates();
	},
	"app:launch-on-start-up:get"() {
		const conf = app.getLoginItemSettings({});
		return conf.openAtLogin;
	},
	async "app:launch-on-start-up:set"(_, value: boolean) {
		const conf = await mainContainer.get(ConfigModule).getConfig();
		app.setLoginItemSettings({
			openAtLogin: value,
			enabled: value,
			// Started with the session: straight to the tray, the LLM usage upload runs in the background.
			args: [HIDDEN_ARG],
		});
		await mainContainer.get(ConfigModule).writeConfig({
			...conf,
		});
	},
	async "app:reload"(event) {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		await mainContainer.get(WindowModule).loadMainWindow(win);
	},
	"app:screen:is-fullscreen"(event): boolean {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		return win.isMaximized();
	},
	"app:screen:minimize"(event) {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		win.minimize();
	},
	"app:screen:size:get"(event) {
		const [width, height] = BrowserWindow.fromWebContents(event.sender)!.getSize();
		return { width, height };
	},
	"app:screen:size:set"(event, value): void {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		win.setSize(value.width, value.height, true);
	},
	"app:screen:toggle-fullscreen"(event) {
		const win = BrowserWindow.fromWebContents(event.sender)!;
		if (win.isMaximized()) {
			win.unmaximize();
		} else {
			win.maximize();
		}
	},
	"app:version:public:get"(): string {
		return Electron.app.getVersion();
	},
	"config:local:get"() {
		return mainContainer.get(ConfigModule).getConfig();
	},
	"config:local:regenerate"() {
		return mainContainer.get(ConfigModule).regenerateConfig();
	},
	async "config:local:set"(_, config) {
		// Profiles are owned by OidcModule (auth:profile:*): a Settings draft must not bring back a stale list.
		const { auth } = await mainContainer.get(ConfigModule).getConfig();
		await mainContainer.get(ConfigModule).writeConfig({ ...config, auth: { ...config.auth, profiles: auth.profiles } });
	},
	async "dialog:selectDirectory"(_, returnFiles) {
		return mainContainer.get(FileModule).getFolder({ returnFiles });
	},
	async "dialog:selectPaths"(_, options) {
		return await mainContainer.get(FileModule).selectPaths(options);
	},
	"file:delete": function (_, filename, options) {
		return mainContainer.get(FileModule).delete(filename, options);
	},
	async "file:directory:create"(_, filename: string): Promise<void> {
		await mainContainer.get(FileModule).mkdir(filename);
	},
	"file:directory:read"(_, filename, recursively?: boolean): Promise<string[]> {
		return mainContainer.get(FileModule).readdir(filename, recursively);
	},
	"file:directory:read:entries"(_, filename): Promise<{ name: string; isDirectory: boolean; isFile: boolean; isSymbolicLink: boolean }[]> {
		return mainContainer.get(FileModule).readdirEntries(filename);
	},
	"file:directory:size"(_, filename): Promise<number> {
		return mainContainer.get(FileModule).getDirectorySize(filename);
	},
	"file:exists"(_, filename: string): Promise<boolean> {
		return mainContainer.get(FileModule).fileExists(filename);
	},
	"file:lstat"(_, filename: string): Promise<Stats> {
		return mainContainer.get(FileModule).lstat(filename);
	},
	"file:rename"(_, from: string, to: string): Promise<void> {
		return mainContainer.get(FileModule).rename(from, to);
	},
	"file:temp:get"(_, filename): string {
		return mainContainer.get(FileModule).getTempFilePath(filename);
	},
	async "file:write"(_, filePath, binaryContent) {
		await mainContainer.get(FileModule).writeFile(binaryContent, filePath);
	},
	async "file:read:text"(_, filePath) {
		return await mainContainer.get(FileModule).readText(filePath);
	},
	async "process:exec"(_, command, args, options): Promise<ExecResult> {
		command += ` ${args.join(" ")}`;
		return await mainContainer.get(ProcessModule).execute(command, options);
	},
	"process:ffmpeg:convert"(_: IpcMainInvokeEvent, opts: FfmpegConvertOptions): Promise<string> {
		return mainContainer.get(FfmpegProcessModule).convert(opts);
	},
	"process:ffmpeg:get:available"(): Promise<boolean> {
		return mainContainer.get(FfmpegProcessModule).isAvailable();
	},
	"process:ffmpeg:get:encoders"(): Promise<Encoder[]> {
		return mainContainer.get(FfmpegProcessModule).getEncoders();
	},

	"process:ffmpeg:get:info"(_, path): Promise<FfprobeResult> {
		return mainContainer.get(FfmpegProcessModule).probe(path);
	},

	"process:kill"(_, pid, signal): void {
		mainContainer.get(ProcessModule).kill(pid, signal);
	},
	async "process:spawn"(_, command, args, options): Promise<SpawnResult> {
		return await mainContainer.get(ProcessModule).spawn(command, args, options);
	},
	"system:info:get"<T extends GetInformationKey>(_: IpcMainInvokeEvent, key: T) {
		return (si[key] as () => GetInformationResult[T])();
	},
	async "update:check"() {
		await mainContainer.get(UpdateModule).checkForUpdates();
	},
	"update:status:get"() {
		return mainContainer.get(UpdateModule).getStatus();
	},
	async "update:download:start"() {
		await mainContainer.get(UpdateModule).downloadUpdate();
	},
	"update:quit-and-install"() {
		mainContainer.get(UpdateModule).quitAndInstall();
	},
	"window:id:get"(event) {
		return event.sender.id;
	},
	async "torrent:nyaa:list"(_, query: string) {
		return await mainContainer.get(NyaaModule).list(query);
	},
	async "torrent:qbittorrent:add-from-url"(_, torrentUrl: string, infoHash?: string) {
		return await mainContainer.get(QBittorrentModule).addTorrentFromUrl(torrentUrl, infoHash);
	},
	async "torrent:qbittorrent:get-hashes"() {
		return await mainContainer.get(QBittorrentModule).getExistingHashes();
	},
	async "auth:profile:save"(_, input) {
		return await mainContainer.get(OidcModule).saveProfile(input);
	},
	async "auth:profile:delete"(_, profileId: string) {
		await mainContainer.get(OidcModule).deleteProfile(profileId);
	},
	async "auth:oidc:login:start"(_, profileId: string) {
		await mainContainer.get(OidcModule).startLogin(profileId);
	},
	"auth:oidc:login:cancel"() {
		mainContainer.get(OidcModule).cancelLogin();
	},
	async "auth:oidc:logout"(_, profileId: string) {
		await mainContainer.get(OidcModule).logout(profileId);
	},
	async "auth:oidc:status:list"() {
		return await mainContainer.get(OidcModule).listStatus();
	},
	async "auth:oidc:tokens:get"(_, profileId: string) {
		return await mainContainer.get(OidcModule).getSessionTokens(profileId);
	},
	async "llm-usage:status:get"() {
		return await mainContainer.get(LlmUsageModule).getStatus();
	},
	async "llm-usage:sync"() {
		return await mainContainer.get(LlmUsageModule).sync();
	},
	async "ssh:machines:list"() {
		return await mainContainer.get(SshModule).listMachines();
	},
	async "ssh:folders:list"() {
		return await mainContainer.get(SshModule).listFolders();
	},
	async "ssh:machine:save"(_, machine) {
		return await mainContainer.get(SshModule).saveMachine(machine);
	},
	async "ssh:machine:delete"(_, machineId) {
		await mainContainer.get(SshModule).deleteMachine(machineId);
	},
	async "ssh:machine:credentials"(_, machineId) {
		return await mainContainer.get(SshModule).getMachineCredentials(machineId);
	},
	async "ssh:folder:save"(_, folder) {
		return await mainContainer.get(SshModule).saveFolder(folder);
	},
	async "ssh:folder:delete"(_, folderId) {
		await mainContainer.get(SshModule).deleteFolder(folderId);
	},
	async "ssh:session:open"(_, machineId, path) {
		return await mainContainer.get(SshModule).openSession(machineId, path);
	},
	"ssh:session:close"(_, sessionId) {
		mainContainer.get(SshModule).closeSession(sessionId);
	},
	async "ssh:session:list-directory"(_, sessionId, path, useSudo) {
		return await mainContainer.get(SshModule).listDirectory(sessionId, path, useSudo);
	},
	async "ssh:transfer:download"(_, sessionId, remotePath, localDirectory) {
		return await mainContainer.get(SshModule).startDownload(sessionId, remotePath, localDirectory);
	},
	async "ssh:transfer:upload"(_, sessionId, localPath, remoteDirectory) {
		return await mainContainer.get(SshModule).startUpload(sessionId, localPath, remoteDirectory);
	},
	"ssh:transfer:cancel"(_, transferId) {
		mainContainer.get(SshModule).cancelTransfer(transferId);
	},
	async "ssh:command:run"(_, request) {
		return await mainContainer.get(SshModule).runCommand(request);
	},
	"ssh:command:stop"(_, runId, runTargetId) {
		mainContainer.get(SshModule).stopCommand(runId, runTargetId);
	},
};

export function registerIpcHandlers() {
	for (const channel of Object.keys(ipcHandlers)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		ipcMain.handle(channel, ipcHandlers[channel]);
	}
}
