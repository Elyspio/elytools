import type { DragEvent } from "react";
import { Box, Chip, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/Edit";
import { useAppDispatch, useAppSelector } from "@store";
import { sshActions } from "@modules/ssh/ssh.reducer";
import { SshMachineCard } from "./SshMachineCard";
import type { SshFolder, SshMachine } from "@shared/types/ssh.types";

type FilteredDirectory = {
	folderRows: { folder: SshFolder; machines: SshMachine[]; match: boolean }[];
	rootMachines: SshMachine[];
};

type Props = {
	filteredDirectory: FilteredDirectory;
	draggingMachineId: string | null;
	dragOverFolderId: string | null;
	rootDropActive: boolean;
	onOpenCreateFolder: () => void;
	onOpenCreateMachine: () => void;
	onOpenEditFolder: (folder: SshFolder) => void;
	onOpenEditMachine: (machine: SshMachine) => void;
	onConnectMachine: (machineId: string) => void;
	onDuplicateMachine: (machine: SshMachine) => void;
	onRemoveFolder: (folderId: string) => void;
	onRemoveMachine: (machineId: string) => void;
	onMachineDrop: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
	onDragOver: (folderId: string | null) => void;
	onMachineDragStart: (machineId: string) => void;
	onDragEnd: () => void;
};

export function SshSidebar({
	filteredDirectory,
	draggingMachineId,
	dragOverFolderId,
	rootDropActive,
	onOpenCreateFolder,
	onOpenCreateMachine,
	onOpenEditFolder,
	onOpenEditMachine,
	onConnectMachine,
	onDuplicateMachine,
	onRemoveFolder,
	onRemoveMachine,
	onMachineDrop,
	onDragOver,
	onMachineDragStart,
	onDragEnd,
}: Props) {
	const dispatch = useAppDispatch();
	const ssh = useAppSelector((state) => state.ssh);

	return (
		<aside className={"SSH__sidebar"}>
			<Stack
				direction={"row"}
				sx={{
					justifyContent: "space-between",
					alignItems: "flex-start",
					mb: 2,
				}}
			>
				<Box>
					<Typography className={"SSH__eyebrow"}>Operator Console</Typography>
					<Typography className={"SSH__headline"}>Machine Directory</Typography>
				</Box>
				<Stack direction={"row"} spacing={0.5}>
					<Tooltip title={"New folder"}>
						<IconButton onClick={onOpenCreateFolder}>
							<CreateNewFolderIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
					<Tooltip title={"New machine"}>
						<IconButton onClick={onOpenCreateMachine}>
							<AddIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Tooltip>
				</Stack>
			</Stack>
			<TextField size="small" placeholder="Search machines" value={ssh.machines.filter} onChange={(event) => dispatch(sshActions.setFilter(event.target.value))} fullWidth />
			<Box
				className={"SSH__directory"}
				sx={{
					mt: 2,
				}}
			>
				<Stack spacing={1.25}>
					{ssh.folders.loading && <LinearProgress />}

					{filteredDirectory.folderRows.map(({ folder, machines: folderMachines }) => (
						<Box
							key={folder.id}
							className={`SSH__folder ${dragOverFolderId === folder.id ? "SSH__folder--dropping" : ""}`}
							onDragOver={(event) => {
								if (!draggingMachineId) return;
								event.preventDefault();
								onDragOver(folder.id);
							}}
							onDrop={(event) => onMachineDrop(event, folder.id)}
						>
							<Stack
								direction={"row"}
								sx={{
									justifyContent: "space-between",
									alignItems: "flex-start",
								}}
							>
								<Box sx={{ minWidth: 0 }}>
									<Typography className={"SSH__folder-title"}>{folder.name}</Typography>
									<Typography className={"SSH__folder-meta"}>{folderMachines.length} host(s)</Typography>
								</Box>
								<Stack direction={"row"} spacing={0.5}>
									<IconButton size="small" onClick={() => onOpenEditFolder(folder)}>
										<EditIcon sx={{ fontSize: 16 }} />
									</IconButton>
									<IconButton size="small" onClick={() => onRemoveFolder(folder.id)}>
										<DeleteOutlineIcon sx={{ fontSize: 16 }} />
									</IconButton>
								</Stack>
							</Stack>

							<Stack className={"SSH__folder-machines"} spacing={1}>
								{folderMachines.length === 0 && <Typography className={"SSH__folder-empty"}>Drop SSH hosts here.</Typography>}
								{folderMachines.map((machine) => (
									<SshMachineCard
										key={machine.id}
										machine={machine}
										connectionState={ssh.machines.connectionStates[machine.id] ?? "disconnected"}
										dragging={draggingMachineId === machine.id}
										folderName={folder.name}
										onEdit={() => onOpenEditMachine(machine)}
										onDuplicate={() => onDuplicateMachine(machine)}
										onDelete={() => onRemoveMachine(machine.id)}
										onConnect={() => onConnectMachine(machine.id)}
										onDragStart={(event) => {
											event.dataTransfer.effectAllowed = "move";
											event.dataTransfer.setData("text/plain", machine.id);
											onMachineDragStart(machine.id);
										}}
										onDragEnd={onDragEnd}
									/>
								))}
							</Stack>
						</Box>
					))}

					<Box
						className={`SSH__directory-root ${rootDropActive ? "SSH__directory-root--dropping" : ""}`}
						onDragOver={(event) => {
							if (!draggingMachineId) return;
							event.preventDefault();
							onDragOver(null);
						}}
						onDrop={(event) => onMachineDrop(event, null)}
					>
						<Stack
							direction={"row"}
							sx={{
								justifyContent: "space-between",
								alignItems: "center",
								mb: 1,
							}}
						>
							<Box>
								<Typography className={"SSH__folder-title"}>Unsorted hosts</Typography>
								<Typography className={"SSH__folder-meta"}>Drop a host here to remove it from a folder.</Typography>
							</Box>
							<Chip size="small" label={filteredDirectory.rootMachines.length} />
						</Stack>

						<Stack className={"SSH__folder-machines"} spacing={1}>
							{filteredDirectory.rootMachines.length === 0 && <Typography className={"SSH__folder-empty"}>No ungrouped hosts.</Typography>}
							{filteredDirectory.rootMachines.map((machine) => (
								<SshMachineCard
									key={machine.id}
									machine={machine}
									connectionState={ssh.machines.connectionStates[machine.id] ?? "disconnected"}
									dragging={draggingMachineId === machine.id}
									onEdit={() => onOpenEditMachine(machine)}
									onDuplicate={() => onDuplicateMachine(machine)}
									onDelete={() => onRemoveMachine(machine.id)}
									onConnect={() => onConnectMachine(machine.id)}
									onDragStart={(event) => {
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/plain", machine.id);
										onMachineDragStart(machine.id);
									}}
									onDragEnd={onDragEnd}
								/>
							))}
						</Stack>
					</Box>

					{!ssh.folders.loading && filteredDirectory.folderRows.length === 0 && filteredDirectory.rootMachines.length === 0 && (
						<Box className={"SSH__empty"}>
							<CreateNewFolderIcon sx={{ fontSize: 32 }} />
							<Typography>No machines match the current filter.</Typography>
						</Box>
					)}
				</Stack>
			</Box>
		</aside>
	);
}
