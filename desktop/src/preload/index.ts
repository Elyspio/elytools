import { contextBridge } from "electron";
import { getIpcSender } from "./parts/preload.ipc.sender";
import { getPreloadConfig } from "./parts/preload.config";
import { PreloadExposed } from "./types/preload.types";
import { getIpcReceiver } from "./parts/preload.ipc.receiver";

const preload: PreloadExposed = {
	ipc: {
		send: getIpcSender(),
		on: getIpcReceiver(),
	},
	config: getPreloadConfig(),
};

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("preload", preload);
	} catch (error) {
		console.error(error);
	}
} else {
	globalThis.preload = preload;
}
