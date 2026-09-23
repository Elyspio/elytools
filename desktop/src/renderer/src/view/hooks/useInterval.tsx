import { useEffect } from "react";

/**
 * This is a custom React hook that repeatedly runs a given function in a set interval.
 *
 * @param fn - The function to run at each interval.
 * @param timeout - The length of the interval in milliseconds (1000ms is the default).
 * @param deps - An array of dependencies, which when changed will trigger clearInterval and restart the interval with the new deps.
 *
 * useEffect hook is used here to initiate the interval when the component mounts and clean up when it unmounts or on changes to dependencies.
 *
 * Upon mounting, `fn` is immediately called, and then `setInterval` is used to continue calling `fn` at each interval.
 *
 * The clean-up function clears the interval using `clearInterval` to prevent the interval from continuing to run when the component is not mounted.
 */
export function useInterval(fn: () => any, timeout = 1000, deps: any[]) {
	useEffect(() => {
		fn();
		const interval = setInterval(fn, timeout);

		return () => {
			clearInterval(interval);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
}
