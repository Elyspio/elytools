import { LatestConfig } from "@shared/config/app.config";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { SettingsSectionKey } from "@components/frame/settings/SettingsDialog";

type SystemInformation = {
	cpuLoad?: number;
	gpuLoad?: { encode: number; decode: number; memory: number };
	mem?: { current: number; total: number };
};

export interface ConfigurationState {
	current: LatestConfig;
	isWindowUnderSized: boolean;
	system: SystemInformation;
	/** Session of every OIDC profile, pushed by the main process after each health check */
	authStatuses: OidcAuthStatus[];
	/** Settings dialog, opened from the title bar or from a module needing a fix */
	settings: { open: boolean; section?: SettingsSectionKey };
}
