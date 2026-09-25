import type { StoreState } from "@store";
import { Store } from "redux";
import { createWindowCustomOption } from "@services/electron/dialog.service";

export type InitParams = {
	store: StoreState;
	route: string;
	options: createWindowCustomOption;
};

declare global {
	interface Window {
		params: InitParams;
		store: Store<StoreState>;
	}
}
