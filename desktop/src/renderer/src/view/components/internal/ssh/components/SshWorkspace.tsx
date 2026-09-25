import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MenuIcon from "@mui/icons-material/Menu";
import SyncIcon from "@mui/icons-material/Sync";
import { useAppDispatch, useAppSelector } from "@store";
import { sshActions } from "@modules/ssh/ssh.reducer";
import { SshSessionPanel } from "./SshSessionPanel";
import { SshConsole } from "./SshConsole";
import type { SshMachine } from "@shared/types/ssh.types";

type Props = {
	machinesById: Record<string, SshMachine>;
	syncWorkingDirectory: boolean;
	command: string;
	sessionSudo: Record<string, boolean>;
	onOpenDrawer: () => void;
	onToggleSync: () => void;
	onNavigate: (sessionId: string, path?: string) => void;
	onUpload: (sessionId: string, remotePath: string) => void;
	onDownload: (sessionId: string, remotePath: string) => void;
	onCloseSession: (sessionId: string) => void;
	onCommandChange: (cmd: string) => void;
	onSudoToggle: (sessionId: string) => void;
};

export function SshWorkspace({
	machinesById,
	syncWorkingDirectory,
	command,
	sessionSudo,
	onOpenDrawer,
	onToggleSync,
	onNavigate,
	onUpload,
	onDownload,
	onCloseSession,
	onCommandChange,
	onSudoToggle,
}: Props) {
	const dispatch = useAppDispatch();
	const ssh = useAppSelector((state) => state.ssh);
	const activeSessionId = ssh.sessions.activeSessionId ?? ssh.sessions.order[0];

	return (
		<section className={"SSH__workspace"}>
			<header className={"SSH__toolbar"}>
				<Stack
					direction={"row"}
					spacing={1}
					sx={{
						alignItems: "center",
					}}
				>
					<Tooltip title={"Machine directory"}>
						<IconButton size="small" onClick={onOpenDrawer} className={"SSH__drawer-toggle"}>
							<MenuIcon sx={{ fontSize: 20 }} />
						</IconButton>
					</Tooltip>
					<Box>
						<Typography className={"SSH__eyebrow"}>Parallel Workspaces</Typography>
						<Typography className={"SSH__headline"}>Remote Files</Typography>
					</Box>
				</Stack>
				<Stack
					direction={"row"}
					spacing={0.75}
					sx={{
						alignItems: "center",
					}}
				>
					<Typography className={"SSH__toolbar-meta"}>{ssh.sessions.order.length} panel(s) open</Typography>
					<Tooltip title={syncWorkingDirectory ? "Stop syncing navigation" : "Sync navigation across panels"}>
						<IconButton size="small" onClick={onToggleSync} color={syncWorkingDirectory ? "primary" : "default"}>
							<SyncIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
				</Stack>
			</header>
			<Box className={"SSH__panels"}>
				{ssh.sessions.order.length === 0 && (
					<Box className={"SSH__empty"}>
						<FolderOpenIcon sx={{ fontSize: 32 }} />
						<Typography>Open one or more machines from the directory to browse them side by side.</Typography>
					</Box>
				)}
				{ssh.sessions.order.map((sessionId) => (
					<SshSessionPanel
						key={sessionId}
						sessionId={sessionId}
						session={ssh.sessions.byId[sessionId]}
						machine={machinesById[ssh.sessions.byId[sessionId].machineId]}
						loading={ssh.sessions.loadingById[sessionId] ?? false}
						active={activeSessionId === sessionId}
						sudoActive={sessionSudo[sessionId] ?? false}
						onSetActive={() => dispatch(sshActions.setActiveSession(sessionId))}
						onClose={() => onCloseSession(sessionId)}
						onNavigate={(path) => onNavigate(sessionId, path)}
						onUpload={(remotePath) => onUpload(sessionId, remotePath)}
						onDownload={(remotePath) => onDownload(sessionId, remotePath)}
						onSudoToggle={() => onSudoToggle(sessionId)}
					/>
				))}
			</Box>
			<SshConsole machinesById={machinesById} command={command} onCommandChange={onCommandChange} />
		</section>
	);
}
