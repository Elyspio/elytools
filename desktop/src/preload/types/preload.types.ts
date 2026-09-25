import type { PreloadExposedIpc } from "../parts/preload.ipc.sender";
import type { PreloadExposedConfig } from "../parts/preload.config";
import { PreloadReceivedIpc } from "../parts/preload.ipc.receiver";

export type PreloadExposed = {
	ipc: {
		send: PreloadExposedIpc;
		on: PreloadReceivedIpc;
	};
	config: PreloadExposedConfig;
};
