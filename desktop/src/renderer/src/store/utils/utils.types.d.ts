export type PartialRecord<K extends keyof any, T> = {
	[P in K]?: T;
};

export type PromiseState = "fulfilled" | "rejected" | "pending";

export type IdWindow = number | "web";
