import React from "react";

/**
 *
 * @param defaultState initial state of modal (open or not)
 */
export function useModal(defaultState: boolean) {
	const [open, setOpenState] = React.useState<boolean>(defaultState);

	const setOpen = React.useCallback((e?: React.MouseEvent) => {
		e?.stopPropagation();
		setOpenState(true);
	}, []);
	const close = React.useCallback((e?: React.MouseEvent) => {
		e?.stopPropagation();
		setOpenState(false);
	}, []);

	const toggle = React.useCallback(() => setOpenState((open) => !open), []);

	return {
		open: open,
		setOpen: setOpen,
		setClose: close,
		toggle: toggle,
	};
}
