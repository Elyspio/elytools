import { ActionCreatorWithPayload, AsyncThunkPayloadCreator, createAction as _createAction, createAsyncThunk as _createAsyncThunk } from "@reduxjs/toolkit";
import { ExtraArgument, StoreState } from "@store";

type Constructor<T> = new (...args: any[]) => T;

export function getService<T>(service: Constructor<T>, extra: ExtraArgument): T {
	return extra.container.get(service);
}

type InstanceTypes<T> = {
	[K in keyof T]: T[K] extends new (...args: any[]) => infer I ? I : never;
};

export function getServices<T extends Record<any, any>>(services: T, extra: ExtraArgument): InstanceTypes<T> {
	return Object.keys(services).reduce((acc, key) => {
		acc[key as keyof T] = extra.container.get(services[key]);
		return acc;
	}, {} as InstanceTypes<T>);
}

export function createReplaceAction<T>(creator: (module: string) => any): ActionCreatorWithPayload<T> {
	return creator("replace");
}

type ThunkParam = { extra: ExtraArgument; state: StoreState };

export function createAsyncActionGenerator(prefix: string) {
	return <Ret, Arg = void>(suffix: string, payloadCreator: AsyncThunkPayloadCreator<Ret, Arg, ThunkParam>) => _createAsyncThunk<Ret, Arg>(`${prefix}/${suffix}`, payloadCreator);
}

export function createActionGenerator(prefix: string) {
	return <Arg = void>(suffix: string) => _createAction<Arg>(`${prefix}/${suffix}`);
}
