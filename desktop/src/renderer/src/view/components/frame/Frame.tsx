import { ReactNode } from "react";
import "./Frame.scss";
import { Paper } from "@mui/material";
import Titlebar from "./titlebar/Titlebar";
import { ResourceUtilization } from "./resource-utilization/ResourceUtilization";
import { useMatches } from "react-router";
import { useAppSelector } from "@store";

type FrameProps = {
	children: ReactNode;
};

export function Frame({ children }: Readonly<FrameProps>) {
	const route = useMatches().at(-1);

	const showResourceUtilization = useAppSelector((s) => s.config.current.frame.show.resourceUtilization);

	return (
		<Paper square className={"Frame"}>
			<Titlebar title={window.preload.config.appName} subtitle={route?.id === "0-0" ? undefined : route?.id} />
			<main className={"Frame__content"}>
				<div className={"Frame__page"}>{children}</div>
			</main>
			{showResourceUtilization && <ResourceUtilization />}
		</Paper>
	);
}
