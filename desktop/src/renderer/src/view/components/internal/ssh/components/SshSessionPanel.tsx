import { useState } from "react";
import { Box, IconButton, InputBase, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloseIcon from "@mui/icons-material/Close";
import HomeIcon from "@mui/icons-material/Home";
import RefreshIcon from "@mui/icons-material/Refresh";
import SecurityIcon from "@mui/icons-material/Security";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { SshDirectoryListing, SshMachine } from "@shared/types/ssh.types";

function getRemoteParent(remotePath: string) {
	if (!remotePath || remotePath === "/") return "/";
	const normalized = remotePath.endsWith("/") ? remotePath.slice(0, -1) : remotePath;
	const index = normalized.lastIndexOf("/");
	if (index <= 0) return "/";
	return normalized.slice(0, index);
}

function formatBytes(value: number) {
	if (!value) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	const size = value / 1024 ** index;
	return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

type Props = {
	sessionId: string;
	session: SshDirectoryListing;
	machine: SshMachine | undefined;
	loading: boolean;
	active: boolean;
	sudoActive: boolean;
	onSetActive: () => void;
	onClose: () => void;
	onNavigate: (path?: string) => void;
	onUpload: (remotePath: string) => void;
	onDownload: (remotePath: string) => void;
	onSudoToggle: () => void;
};

export function SshSessionPanel({ sessionId, session, machine, loading, active, sudoActive, onSetActive, onClose, onNavigate, onUpload, onDownload, onSudoToggle }: Props) {
	const [editingPath, setEditingPath] = useState(false);
	const [pathInput, setPathInput] = useState(session.path);
	const [showHidden, setShowHidden] = useState(false);

	// Reset the path editor when the session navigates (adjusting state during render instead of in an effect)
	const [syncedPath, setSyncedPath] = useState(session.path);
	if (syncedPath !== session.path) {
		setSyncedPath(session.path);
		setEditingPath(false);
		setPathInput(session.path);
	}

	const visibleEntries = showHidden ? session.entries : session.entries.filter((e) => !e.name.startsWith("."));

	const sudoAvailable = machine?.user !== "root";

	return (
		<Box className={`SSH__panel ${active ? "SSH__panel--active" : ""} ${sudoActive ? "SSH__panel--sudo" : ""}`} onClick={onSetActive}>
			<Stack
				direction={"row"}
				sx={{
					justifyContent: "space-between",
					alignItems: "center",
					mb: 1.25,
					flexShrink: 0,
				}}
			>
				<Box sx={{ minWidth: 0, flex: 1, mr: 1 }}>
					<Stack
						direction={"row"}
						sx={{
							alignItems: "center",
							gap: 0.75,
						}}
					>
						<Typography className={"SSH__panel-title"}>{machine?.name ?? sessionId}</Typography>
						{sudoActive && (
							<Box component={"span"} className={"SSH__sudo-badge"}>
								ROOT
							</Box>
						)}
					</Stack>
					{editingPath ? (
						<InputBase
							className={"SSH__panel-path-input"}
							value={pathInput}
							autoFocus
							fullWidth
							onChange={(e) => setPathInput(e.target.value)}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") {
									setEditingPath(false);
									onNavigate(pathInput);
								} else if (e.key === "Escape") {
									setEditingPath(false);
									setPathInput(session.path);
								}
							}}
							onBlur={() => {
								setEditingPath(false);
								setPathInput(session.path);
							}}
							onClick={(e) => e.stopPropagation()}
						/>
					) : (
						<Typography
							className={"SSH__panel-path"}
							title={"Click to navigate to a path"}
							sx={{ cursor: "text" }}
							onClick={(e) => {
								e.stopPropagation();
								setPathInput(session.path);
								setEditingPath(true);
							}}
						>
							{session.path}
						</Typography>
					)}
				</Box>
				<Stack
					direction={"row"}
					spacing={0.5}
					sx={{
						alignItems: "center",
						flexShrink: 0,
					}}
				>
					{sudoAvailable && (
						<Tooltip title={sudoActive ? "Navigating as root — click to disable" : "Navigate as root (sudo)"}>
							<IconButton
								size="small"
								className={sudoActive ? "SSH__btn-sudo--active" : "SSH__btn-sudo"}
								onClick={(e) => {
									e.stopPropagation();
									onSudoToggle();
								}}
							>
								<SecurityIcon sx={{ fontSize: 15 }} />
							</IconButton>
						</Tooltip>
					)}
					<Tooltip title={showHidden ? "Showing all files — click to hide dotfiles" : "Hidden files filtered — click to show"}>
						<IconButton
							size="small"
							className={showHidden ? "SSH__btn-hidden--active" : "SSH__btn-hidden"}
							onClick={(e) => {
								e.stopPropagation();
								setShowHidden((p) => !p);
							}}
						>
							{showHidden ? <VisibilityIcon sx={{ fontSize: 15 }} /> : <VisibilityOffIcon sx={{ fontSize: 15 }} />}
						</IconButton>
					</Tooltip>
					<Box className={"SSH__toolbar-divider"} />
					<Tooltip title={"Home"}>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onNavigate(".");
							}}
						>
							<HomeIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title={"Parent"}>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onNavigate(getRemoteParent(session.path));
							}}
						>
							<ArrowUpwardIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title={"Refresh"}>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onNavigate(session.path);
							}}
						>
							<RefreshIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title={"Upload"}>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onUpload(session.path);
							}}
						>
							<CloudUploadIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title={"Close"}>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onClose();
							}}
						>
							<CloseIcon sx={{ fontSize: 16 }} />
						</IconButton>
					</Tooltip>
				</Stack>
			</Stack>
			{loading && <LinearProgress />}
			<Stack className={"SSH__entry-list"} spacing={0.5}>
				{visibleEntries.map((entry) => (
					<Box key={entry.path} className={"SSH__entry"}>
						<Box
							className={"SSH__entry-main"}
							onClick={(e) => {
								if (entry.type !== "directory") return;
								e.stopPropagation();
								onNavigate(entry.path);
							}}
						>
							<Typography className={"SSH__entry-name"}>{entry.name}</Typography>
							<Typography className={"SSH__entry-meta"}>
								{entry.type} · {formatBytes(entry.size)}
							</Typography>
						</Box>
						<IconButton
							size="small"
							onClick={(e) => {
								e.stopPropagation();
								onDownload(entry.path);
							}}
						>
							<CloudDownloadIcon sx={{ fontSize: 15 }} />
						</IconButton>
					</Box>
				))}
			</Stack>
		</Box>
	);
}
