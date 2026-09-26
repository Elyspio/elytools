import { LocalConfig, LocalConfigV1, LocalConfigV2, LocalConfigV3, LocalConfigV4, LocalConfigV5, LocalConfigV6 } from "@shared/config/app.config";

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
		v5: (conf: LocalConfig): conf is LocalConfigV5 => {
			return conf.version === 5;
		},
		v6: (conf: LocalConfig): conf is LocalConfigV6 => {
			return conf.version === 6;
		},
	},
};
