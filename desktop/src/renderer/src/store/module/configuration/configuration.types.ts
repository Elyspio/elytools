import { LatestConfig } from "@shared/config/app.config";

type SystemInformation = {
	cpuLoad?: number;
	gpuLoad?: { encode: number; decode: number; memory: number };
	mem?: { current: number; total: number };
};

export interface ConfigurationState {
	current: LatestConfig;
	isWindowUnderSized: boolean;
	system: SystemInformation;
}
