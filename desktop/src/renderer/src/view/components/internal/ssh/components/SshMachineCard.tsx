import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import type { DragEvent } from "react";
import type { SshConnectionState, SshMachine } from "@shared/types/ssh.types";

const statusLabel: Record<SshConnectionState, string> = {
	connected: "Connected",
	connecting: "Connecting…",
	disconnected: "Disconnected",
	error: "Error",
};

type Props = {
	machine: SshMachine;
	connectionState: SshConnectionState;
	dragging: boolean;
	folderName?: string;
	onEdit: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
	onConnect: () => void;
	onDragStart: (event: DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
};

export function SshMachineCard({ machine, connectionState, dragging, onEdit, onDuplicate, onDelete, onConnect, onDragStart, onDragEnd }: Props) {
	return (
		<Box className={`SSH__machine SSH__machine--${connectionState} ${dragging ? "SSH__machine--dragging" : ""}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
			<Stack
				direction={"row"}
				spacing={0.75}
				sx={{
					alignItems: "center",
					minWidth: 0,
				}}
			>
				<Tooltip title={statusLabel[connectionState]} placement="top">
					<Box className={`SSH__machine-dot SSH__machine-dot--${connectionState}`} />
				</Tooltip>

				<Box sx={{ minWidth: 0, flex: 1 }}>
					<Typography className={"SSH__machine-title"} noWrap>
						{machine.name}
					</Typography>
					<Typography className={"SSH__machine-meta"} noWrap>
						{machine.user}@{machine.host}:{machine.port}
					</Typography>
				</Box>

				<Stack direction={"row"} spacing={0.25} className={"SSH__machine-actions"} sx={{ flexShrink: 0 }}>
					<Tooltip title="Open session">
						<IconButton size="small" onClick={onConnect} className={"SSH__machine-action-open"}>
							<FolderOpenIcon sx={{ fontSize: 14 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Duplicate">
						<IconButton size="small" onClick={onDuplicate}>
							<ContentCopyIcon sx={{ fontSize: 13 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Edit">
						<IconButton size="small" onClick={onEdit}>
							<EditIcon sx={{ fontSize: 13 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title="Delete">
						<IconButton size="small" onClick={onDelete}>
							<DeleteOutlineIcon sx={{ fontSize: 13 }} />
						</IconButton>
					</Tooltip>
				</Stack>
			</Stack>
		</Box>
	);
}
