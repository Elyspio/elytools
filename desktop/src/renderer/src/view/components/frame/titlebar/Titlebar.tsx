import React, { useEffect, useState } from "react";
import "./Titlebar.scss";
import { Badge, Fade, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import RemoveIcon from "@mui/icons-material/Remove";
import SettingsIcon from "@mui/icons-material/Settings";
import NavigateBefore from "@mui/icons-material/NavigateBefore";
import Close from "@mui/icons-material/Close";
import Settings from "../settings/Settings";
import { routes } from "@/config/routes.config";
import { useLocation, useNavigate } from "react-router";
import { useAppSelector } from "@store";

interface Props {
	title?: string;
	subtitle?: string;
}

const Titlebar: React.FC<Props> = ({ title, subtitle }) => {
	const [fullscreen, setFullscreen] = useState<boolean>();
	const [settingModalOpened, setSettingModalOpened] = useState<boolean>(false);
	const updateStatus = useAppSelector((state) => state.config.update);
	const pendingUpdate = updateStatus?.state === "available" || updateStatus?.state === "downloaded" ? updateStatus : null;

	useEffect(() => {
		void window.preload.ipc.send.app.screen.isFullScreen().then(setFullscreen);
	}, []);

	const toggleModal = () => {
		setSettingModalOpened((prev) => !prev);
	};

	const close = () => {
		return window.preload.ipc.send.app.close();
	};

	const minimize = () => {
		return window.preload.ipc.send.app.screen.minimize();
	};

	const goFullscreen = (state: boolean) => {
		setFullscreen(state);
		return window.preload.ipc.send.app.screen.toggleFullScreen();
	};

	const location = useLocation();
	const isHome = location.pathname === routes["/"].path;

	const navigate = useNavigate();

	return (
		<Stack
			id={"Titlebar"}
			direction={"row"}
			sx={{
				alignItems: "center",
				px: 1.5,
				justifyContent: "space-between",
			}}
		>
			<Stack
				direction={"row"}
				sx={{
					alignItems: "center",
					gap: 0.75,
				}}
			>
				<Typography className={"Titlebar__appname"} onClick={() => navigate(routes["/"].path)}>
					{title || window.preload.config.appName}
				</Typography>

				{subtitle && (
					<>
						<Typography className={"Titlebar__separator"}>/</Typography>
						<Typography className={"Titlebar__subtitle"}>{subtitle}</Typography>
					</>
				)}

				<Fade in={!isHome}>
					<IconButton size={"small"} className={"Titlebar__back"} onClick={() => navigate(-1)}>
						<NavigateBefore sx={{ fontSize: 16 }} />
					</IconButton>
				</Fade>
			</Stack>
			<Stack
				direction={"row"}
				sx={{
					gap: 0.25,
				}}
			>
				<Tooltip
					title={pendingUpdate ? `Elytools ${pendingUpdate.latestVersion} ${pendingUpdate.state === "downloaded" ? "ready to install" : "available"}` : "Settings"}
					placement={"bottom"}
				>
					<IconButton className={"Titlebar__control"} onClick={toggleModal}>
						<Badge variant="dot" color="primary" invisible={!pendingUpdate}>
							<SettingsIcon sx={{ fontSize: 15 }} />
						</Badge>
					</IconButton>
				</Tooltip>

				<IconButton className={"Titlebar__control"} onClick={minimize}>
					<RemoveIcon sx={{ fontSize: 16 }} />
				</IconButton>

				<IconButton className={"Titlebar__control"} onClick={() => goFullscreen(!fullscreen)}>
					{fullscreen ? <FullscreenExitIcon sx={{ fontSize: 16 }} /> : <FullscreenIcon sx={{ fontSize: 16 }} />}
				</IconButton>

				<IconButton className={"Titlebar__control Titlebar__close"} onClick={close}>
					<Close sx={{ fontSize: 16 }} />
				</IconButton>
			</Stack>
			<Settings close={toggleModal} isOpen={settingModalOpened} initialSection={pendingUpdate ? "updates" : undefined} />
		</Stack>
	);
};

export default Titlebar;
