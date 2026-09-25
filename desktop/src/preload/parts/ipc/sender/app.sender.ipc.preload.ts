import { ipcRendererWrapper } from "../../preload.ipc.wrapper";
import { app } from "electron";

export const appIpcSender = {
	reload: async () => {
		await ipcRendererWrapper.invoke("app:reload");
	},
	hide: async () => {
		await ipcRendererWrapper.invoke("app:hide");
	},
	close: async () => {
		await ipcRendererWrapper.invoke("app:close");
	},
	contextMenu: async () => {
		await ipcRendererWrapper.invoke("app:context-menu");
	},
	screen: {
		toggleFullScreen: async () => {
			await ipcRendererWrapper.invoke("app:screen:toggle-fullscreen");
		},
		isFullScreen: async () => {
			return await ipcRendererWrapper.invoke("app:screen:is-fullscreen");
		},
		minimize: async () => {
			await ipcRendererWrapper.invoke("app:screen:minimize");
		},
		size: {
			get: async () => {
				return await ipcRendererWrapper.invoke("app:screen:size:get");
			},
			set: async (width: number, height: number) => {
				await ipcRendererWrapper.invoke("app:screen:size:set", { width, height });
			},
		},
	},
	startup: {
		isEnabled: async () => {
			return await ipcRendererWrapper.invoke("app:launch-on-start-up:get");
		},
		setEnabled: async (value: boolean) => {
			await ipcRendererWrapper.invoke("app:launch-on-start-up:set", value);
		},
	},
	ready: {
		ipc: async () => {
			await ipcRendererWrapper.invoke("app:ipc:main-ready");
		},
	},
	getPublicVersion: () => {
		return app.getVersion();
	},
};
