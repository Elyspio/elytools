import { PreloadExposed } from "./preload.types";

declare global {
	interface Window {
		preload: PreloadExposed;
	}
}

export * from "@shared/config/app.config";
export * from "@shared/ipc/ipc.handled.events";
export * from "@shared/ipc/ipc.sent.events";
