import { LatestConfig } from "@shared/config/app.config";
import type { UpdateStatus } from "@shared/types/update.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import type { SettingsSectionKey } from "@components/frame/settings/Settings";

type SystemInformation = {
	cpuLoad?: number;
	gpuLoad?: { encode: number; decode: number; memory: number };
	mem?: { current: number; total: number };
};

export interface ConfigurationState {
	current: LatestConfig;
	isWindowUnderSized: boolean;
	system: SystemInformation;
	update: UpdateStatus | null;
	/** Session of every OIDC profile, pushed by the main process after each health check */
	authStatuses: OidcAuthStatus[];
	/** Settings dialog, opened from the title bar or from a module needing a fix */
	settings: { open: boolean; section?: SettingsSectionKey };
}
