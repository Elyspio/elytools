import { isRejected, Middleware } from "@reduxjs/toolkit";

export const logErrorMiddleware: Middleware = () => (next) => (action) => {
	action = JSON.parse(JSON.stringify(action));

	if (isRejected(action)) {
		console.error(new Error(`AsyncAction rejected ${action.type} ${action.error.stack}`), {
			arg: action.meta.arg,
		});
	}

	return next(action);
};
