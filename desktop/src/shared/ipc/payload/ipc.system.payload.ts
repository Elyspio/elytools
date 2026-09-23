import si from "systeminformation";

export type GetInformationKey = keyof typeof si;

export type GetInformationResult = {
	[key in GetInformationKey]: ReturnType<(typeof si)[key]>;
};
