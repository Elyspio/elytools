import { BrowserWindowConstructorOptions } from "electron";

export type PartialRecord<K extends keyof any, T> = Partial<Record<K, T>>;

export type SshMachineConfiguration = {
	id: string;
	name: string;
	host: string;
	port: number;
	user: string;
	publicKey: string;
	hasPassword: boolean;
	hasPrivateKey: boolean;
	folderId?: string | null;
};

export type SshFolderConfiguration = {
	id: string;
	name: string;
};

export type SshConfiguration = {
	machines: SshMachineConfiguration[];
	folders: SshFolderConfiguration[];
};

export type LocalConfig = LocalConfigV1 | LocalConfigV2 | LocalConfigV3 | LocalConfigV4;

export type LatestConfig = LocalConfigV4;

export type PositionWindowKey = "main";

export type FrameConfiguration = {
	show: {
		resourceUtilization: boolean;
	};
	resize: {
		height: boolean;
		width: boolean;
	};
};

export type OidcConfiguration = {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	redirectPath: string;
};

export type QBittorrentConfiguration = {
	apiBaseUrl: string;
};

export enum AppBoardShow {
	external = "external",
	internal = "internal",
	hidden = "hidden",
}

export type LocalConfigV1 = {
	/**
	 * Config version, not app version
	 */
	version: 1;
	windows: {
		position: PartialRecord<PositionWindowKey, WindowPosition>;
	};
	appboard: {
		show: AppBoardShow[];
	};
	frame: FrameConfiguration;
	endpoints: {
		homeAssistant: string;
		api: string;
		hubs: {
			screenshare: string;
		};
	};
};

export type LocalConfigV2 = Omit<LocalConfigV1, "version" | "endpoints"> & {
	version: 2;
	endpoints: LocalConfigV1["endpoints"] & {
		qbittorrent: QBittorrentConfiguration;
		oidc: OidcConfiguration;
	};
};

export type LocalConfigV3 = Omit<LocalConfigV2, "version"> & {
	version: 3;
	ssh: SshConfiguration;
};

export type LocalConfigV4 = Omit<LocalConfigV3, "version" | "ssh"> & {
	version: 4;
	ssh: SshConfiguration;
};
export type WindowPosition = Pick<BrowserWindowConstructorOptions, "x" | "y" | "width" | "height">;
