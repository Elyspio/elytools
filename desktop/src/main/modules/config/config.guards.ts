import { LocalConfig, LocalConfigV1, LocalConfigV2, LocalConfigV3, LocalConfigV4 } from "@shared/config/app.config";

export const configGuards = {
	is: {
		v1: (conf: LocalConfig): conf is LocalConfigV1 => {
			return conf.version === 1;
		},
		v2: (conf: LocalConfig): conf is LocalConfigV2 => {
			return conf.version === 2;
		},
		v3: (conf: LocalConfig): conf is LocalConfigV3 => {
			return conf.version === 3;
		},
		v4: (conf: LocalConfig): conf is LocalConfigV4 => {
			return conf.version === 4;
		},
	},
};
