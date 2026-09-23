type getUriParamOptions = {
	remove?: boolean;
	json?: boolean;
};

export function getUriParam<T = unknown>(param: string, { json }: getUriParamOptions = {}): T | undefined {
	const search = new URL(document.location.href).searchParams;
	const elem = search.get(param);
	return elem && json ? (JSON.parse(elem) as T) : undefined;
}
