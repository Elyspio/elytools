import { describe, expect, it, vi } from "vite-plus/test";

// The real logger needs Electron (log folder): a silent one is enough here
vi.mock("../log.module", () => ({
	LogModule: class {
		public logger = { log() {}, info() {}, debug() {}, warn() {}, error() {}, verbose() {} };
	},
}));
import type { LocalConfigV7 } from "@shared/config/app.config";
import { DEFAULT_ENCODER_SETTINGS } from "@shared/encoder/encoder.profiles";
import { ConfigMigrationModule, defaultAuthConfiguration, defaultTorrentConfiguration } from "./config.migration.module";

const v7: LocalConfigV7 = {
	version: 7,
	windows: { position: {} },
	appboard: { show: [] },
	frame: { show: { resourceUtilization: false }, resize: { height: true, width: true } },
	endpoints: { homeAssistant: "https://ha", api: "", hubs: { screenshare: "" }, qbittorrent: { apiBaseUrl: "https://qbit", authProfileId: "p1" } },
	auth: { ...defaultAuthConfiguration(), profiles: [{ id: "p1", name: "Realm", issuerUrl: "https://idp", clientId: "c", scopes: "openid" }] },
	ssh: { machines: [], folders: [] },
	llmUsage: { enabled: true, apiBaseUrl: "https://llm", machineName: "pc", authProfileId: "p1" },
	torrent: { ...defaultTorrentConfiguration(), lastDownloadFolder: "W:/Torrents" },
};

describe("ConfigMigrationModule", () => {
	it("adds the default encoder settings to a v7 config and keeps everything else", async () => {
		const module = new ConfigMigrationModule();

		expect(module.requireMigration(v7)).toBe(true);

		const migrated = await module.migrate(v7);

		expect(migrated).toEqual({ ...v7, version: 8, encoder: DEFAULT_ENCODER_SETTINGS });
		expect(module.requireMigration(migrated)).toBe(false);
	});
});
