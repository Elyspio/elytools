export type ExecResult = {
	stdout: string;
	stderr: string;
};
export type SpawnResultOk = {
	/**
	 * ID du process lancé
	 */
	pid: string;
};
export type SpawnResultError = {
	error: string;
};
export type SpawnResult = SpawnResultOk | SpawnResultError;

export const resultGuards = {
	is: {
		ok: (result: SpawnResult): result is SpawnResultOk => {
			return (result as SpawnResultOk).pid !== undefined;
		},
		error: (result: SpawnResult): result is SpawnResultError => {
			return (result as SpawnResultError).error !== undefined;
		},
	},
};
