import { Logger as ILogger } from "@tsed/logger";
import React from "react";

export const Logger = (name: string | (() => void) | React.Component) => {
	// @ts-ignore
	const current = typeof name === "string" ? name : name.name;
	const logger = new ILogger(current);

	logger.appenders.set("console", { type: "console" });

	return logger;
};
