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

export type LocalConfig = LocalConfigV1 | LocalConfigV2 | LocalConfigV3 | LocalConfigV4 | LocalConfigV5 | LocalConfigV6;

export type LatestConfig = LocalConfigV6;

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

/**
 * Legacy single OIDC configuration (config V2 to V5), replaced by {@link AuthConfiguration} profiles.
 */
export type OidcConfiguration = {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	redirectPath: string;
};

/**
 * Named OIDC provider (e.g. one Keycloak realm), with its own session. Public client: PKCE, no client secret.
 */
export type OidcProfile = {
	id: string;
	name: string;
	issuerUrl: string;
	clientId: string;
	scopes: string;
};

export type AuthConfiguration = {
	/** Shared by every profile: elytools://<redirectPath>, the pending login is found by its state. */
	redirectPath: string;
	profiles: OidcProfile[];
};

/**
 * Upload of the Claude Code and Codex token usage of this workstation to LLM Usage Monitor.
 */
export type LlmUsageConfiguration = {
	enabled: boolean;
	/** Origin of LLM Usage Monitor, e.g. https://monitor.llm.elyspio.fr */
	apiBaseUrl: string;
	/** Label of this workstation in the Usage page. */
	machineName: string;
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
export type LocalConfigV5 = Omit<LocalConfigV4, "version"> & {
	version: 5;
	llmUsage: LlmUsageConfiguration;
};

export type LocalConfigV6 = Omit<LocalConfigV5, "version" | "endpoints" | "llmUsage"> & {
	version: 6;
	auth: AuthConfiguration;
	endpoints: Omit<LocalConfigV5["endpoints"], "oidc" | "qbittorrent"> & {
		qbittorrent: QBittorrentConfiguration & { authProfileId: string | null };
	};
	llmUsage: LlmUsageConfiguration & { authProfileId: string | null };
};

export type WindowPosition = Pick<BrowserWindowConstructorOptions, "x" | "y" | "width" | "height">;
