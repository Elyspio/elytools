import React, { useEffect, useState } from "react";
import "./Titlebar.scss";
import { Badge, Fade, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import RemoveIcon from "@mui/icons-material/Remove";
import SettingsIcon from "@mui/icons-material/Settings";
import NavigateBefore from "@mui/icons-material/NavigateBefore";
import Close from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Settings from "../settings/Settings";
import { routes } from "@/config/routes.config";
import { useLocation, useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "@store";
import { closeSettings, openSettings } from "@modules/configuration/configuration.actions";
import { sessionLabels, sessionState } from "../settings/AuthenticationSettings";

interface Props {
	title?: string;
	subtitle?: string;
}

const Titlebar: React.FC<Props> = ({ title, subtitle }) => {
	const [fullscreen, setFullscreen] = useState<boolean>();
	const dispatch = useAppDispatch();
	const settings = useAppSelector((state) => state.config.settings);
	const updateStatus = useAppSelector((state) => state.config.update);
	const pendingUpdate = updateStatus?.state === "available" || updateStatus?.state === "downloaded" ? updateStatus : null;
	const profiles = useAppSelector((state) => state.config.current.auth?.profiles);
	const authStatuses = useAppSelector((state) => state.config.authStatuses);
	const failingProfiles = (profiles ?? [])
		.map((profile) => ({ profile, state: sessionState(authStatuses.find((status) => status.profileId === profile.id)) }))
		.filter(({ state }) => state === "expired" || state === "unreachable");

	useEffect(() => {
		void window.preload.ipc.send.app.screen.isFullScreen().then(setFullscreen);
	}, []);

	const toggleModal = () => {
		dispatch(settings.open ? closeSettings() : openSettings(pendingUpdate ? "updates" : undefined));
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
				{failingProfiles.length > 0 && (
					<Tooltip title={failingProfiles.map(({ profile, state }) => `${profile.name}: ${sessionLabels[state]}`).join(" · ")} placement={"bottom"}>
						<IconButton
							className={`Titlebar__control Titlebar__auth-alert Titlebar__auth-alert--${failingProfiles.some(({ state }) => state === "expired") ? "expired" : "unreachable"}`}
							onClick={() => dispatch(openSettings("authentication"))}
						>
							<WarningAmberIcon sx={{ fontSize: 15 }} />
						</IconButton>
					</Tooltip>
				)}

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
			<Settings close={() => dispatch(closeSettings())} isOpen={settings.open} initialSection={settings.section} />
		</Stack>
	);
};

export default Titlebar;
