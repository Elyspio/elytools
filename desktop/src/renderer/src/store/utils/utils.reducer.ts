import { ActionCreatorWithPayload, ActionReducerMapBuilder, AsyncThunk, createDraftSafeSelector, Draft } from "@reduxjs/toolkit";
import { PromiseState } from "./utils.types";
import { StoreState } from "@store";

export function setPromiseStatus<T, U extends string>(
	builder: ActionReducerMapBuilder<T>,
	thunk: AsyncThunk<any, any, any>,
	getProps: (state: Draft<T>) => Record<U, PromiseState>,
	prop: U,
	status: PromiseState[] = ["fulfilled", "pending", "rejected"]
) {
	for (const promiseStatus of status) {
		builder.addCase(thunk[promiseStatus], (state, action) => {
			getProps(state)[prop] = action.meta.requestStatus;
		});
	}
}

export function addReplaceCase<T extends object>(builder: ActionReducerMapBuilder<T>, actionCreator: ActionCreatorWithPayload<T>) {
	builder.addCase(actionCreator, (state: Draft<T>, action) => {
		for (const key of Object.keys(action.payload) as (keyof T)[]) {
			console.log(action.type, key);
			// @ts-ignore
			state[key] = action.payload[key];
		}
	});
}

export const createAppSelector = createDraftSafeSelector.withTypes<StoreState>();
