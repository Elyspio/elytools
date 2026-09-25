import { type DragEvent, startTransition, useDeferredValue, useMemo, useState } from "react";
import { Box, Drawer } from "@mui/material";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@store";
import { closeSession, deleteFolder, deleteMachine, openSession, refreshSession, saveFolder, saveMachine, startDownload, startUpload } from "@modules/ssh/ssh.async.actions";
import type { SshFolder, SshMachine } from "@shared/types/ssh.types";
import { SshSidebar } from "./components/SshSidebar";
import { SshWorkspace } from "./components/SshWorkspace";
import { type MachineFormState, SshMachineDialog } from "./components/SshMachineDialog";
import { SshFolderDialog } from "./components/SshFolderDialog";
import "./SSH.scss";

type FolderFormState = { id?: string; name: string };

function createEmptyMachineForm(): MachineFormState {
	return {
		name: "",
		host: "",
		port: 22,
		user: "root",
		publicKey: "",
		password: "",
		privateKey: "",
		folderValue: null,
	};
}

function createEmptyFolderForm(): FolderFormState {
	return { name: "" };
}

function sortByNameAsc<T extends { name: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function isFileImportCancelled(error: unknown) {
	return error instanceof Error && (error.message.includes("canceled") || error.message.includes("cancelled"));
}

export function SSH() {
	const dispatch = useAppDispatch();
	const ssh = useAppSelector((state) => state.ssh);

	const [command, setCommand] = useState("");
	const [sessionSudo, setSessionSudo] = useState<Record<string, boolean>>({});
	const [syncWorkingDirectory, setSyncWorkingDirectory] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [machineDialogOpen, setMachineDialogOpen] = useState(false);
	const [folderDialogOpen, setFolderDialogOpen] = useState(false);
	const [machineForm, setMachineForm] = useState<MachineFormState>(createEmptyMachineForm);
	const [folderForm, setFolderForm] = useState<FolderFormState>(createEmptyFolderForm);
	const [draggingMachineId, setDraggingMachineId] = useState<string | null>(null);
	const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
	const [rootDropActive, setRootDropActive] = useState(false);

	const deferredFilter = useDeferredValue(ssh.machines.filter.trim().toLowerCase());
	const machines = useMemo(() => sortByNameAsc(ssh.machines.items), [ssh.machines.items]);
	const folders = useMemo(() => sortByNameAsc(ssh.folders.items), [ssh.folders.items]);
	const machinesById = useMemo(() => Object.fromEntries(ssh.machines.items.map((m) => [m.id, m])), [ssh.machines.items]);
	const foldersById = useMemo(() => Object.fromEntries(folders.map((f) => [f.id, f])), [folders]);

	const filteredDirectory = useMemo(() => {
		const machineMatches = (machine: SshMachine) => {
			if (!deferredFilter) return true;
			return [machine.name, machine.host, machine.user].some((v) => v.toLowerCase().includes(deferredFilter));
		};
		const folderMatches = (folder: SshFolder) => !deferredFilter || folder.name.toLowerCase().includes(deferredFilter);

		const folderRows = folders
			.map((folder) => {
				const folderMachines = machines.filter((m) => m.folderId === folder.id);
				const visibleMachines = folderMatches(folder) ? folderMachines : folderMachines.filter(machineMatches);
				return {
					folder,
					machines: visibleMachines,
					match: folderMatches(folder) || visibleMachines.length > 0,
				};
			})
			.filter((entry) => entry.match);

		const rootMachines = machines.filter((m) => (m.folderId == null || !foldersById[m.folderId]) && machineMatches(m));

		return { folderRows, rootMachines };
	}, [deferredFilter, folders, foldersById, machines]);

	// --- Machine dialog ---
	const openCreateMachineDialog = () => {
		setMachineForm(createEmptyMachineForm());
		setMachineDialogOpen(true);
	};

	const openEditMachineDialog = (machine: SshMachine) => {
		setMachineForm({
			id: machine.id,
			name: machine.name,
			host: machine.host,
			port: machine.port,
			user: machine.user,
			publicKey: machine.publicKey,
			password: "",
			privateKey: "",
			folderValue: machine.folderId ? (foldersById[machine.folderId] ?? null) : null,
		});
		setMachineDialogOpen(true);

		window.preload.ipc.send.ssh.machines
			.getCredentials(machine.id)
			.then((creds) => {
				setMachineForm((prev) => ({
					...prev,
					password: creds.password ?? "",
					privateKey: creds.privateKey ?? "",
				}));
			})
			.catch(() => {});
	};

	const closeMachineDialog = () => {
		setMachineDialogOpen(false);
		setMachineForm(createEmptyMachineForm());
	};

	const submitMachine = async () => {
		try {
			let folderId: string | null = null;
			if (typeof machineForm.folderValue === "string" && machineForm.folderValue.trim()) {
				const newFolder = await dispatch(saveFolder({ name: machineForm.folderValue.trim() })).unwrap();
				folderId = newFolder.id;
			} else if (machineForm.folderValue && typeof machineForm.folderValue === "object") {
				folderId = machineForm.folderValue.id;
			}

			await dispatch(
				saveMachine({
					id: machineForm.id,
					name: machineForm.name,
					host: machineForm.host,
					port: machineForm.port,
					user: machineForm.user,
					publicKey: machineForm.publicKey,
					password: machineForm.password,
					privateKey: machineForm.privateKey,
					folderId,
				})
			).unwrap();

			toast.success(machineForm.id ? "Machine updated" : "Machine created");
			closeMachineDialog();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save machine");
		}
	};

	// --- Folder dialog ---
	const openCreateFolderDialog = () => {
		setFolderForm(createEmptyFolderForm());
		setFolderDialogOpen(true);
	};

	const openEditFolderDialog = (folder: SshFolder) => {
		setFolderForm({ id: folder.id, name: folder.name });
		setFolderDialogOpen(true);
	};

	const closeFolderDialog = () => {
		setFolderDialogOpen(false);
		setFolderForm(createEmptyFolderForm());
	};

	const submitFolder = async () => {
		try {
			await dispatch(saveFolder(folderForm)).unwrap();
			toast.success(folderForm.id ? "Folder updated" : "Folder created");
			closeFolderDialog();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to save folder");
		}
	};

	// --- Machine/folder operations ---
	const removeFolder = async (folderId: string) => {
		if (!window.confirm("Delete this folder and ungroup its hosts?")) return;
		try {
			await dispatch(deleteFolder(folderId)).unwrap();
			toast.success("Folder deleted");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete folder");
		}
	};

	const removeMachine = async (machineId: string) => {
		try {
			await dispatch(deleteMachine(machineId)).unwrap();
			toast.success("Machine deleted");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to delete machine");
		}
	};

	const duplicateMachine = async (machine: SshMachine) => {
		try {
			const creds = await window.preload.ipc.send.ssh.machines.getCredentials(machine.id).catch(() => ({}));
			await dispatch(
				saveMachine({
					name: `${machine.name} (copy)`,
					host: machine.host,
					port: machine.port,
					user: machine.user,
					publicKey: machine.publicKey,
					password: (creds as { password?: string }).password,
					privateKey: (creds as { privateKey?: string }).privateKey,
					folderId: machine.folderId,
				})
			).unwrap();
			toast.success("Machine duplicated");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to duplicate machine");
		}
	};

	// --- Key import ---
	const importKeyFromFile = async (target: "publicKey" | "privateKey") => {
		const paths = await window.preload.ipc.send.dialog.selectPaths({
			allowFiles: true,
			allowDirectories: false,
			multiSelections: false,
		});
		const filePath = paths?.at(0);
		if (!filePath) return;
		try {
			const content = await window.preload.ipc.send.file.readText(filePath);
			setMachineForm((prev) => ({ ...prev, [target]: content }));
		} catch (error) {
			if (isFileImportCancelled(error)) return;
			toast.error(error instanceof Error ? error.message : `Failed to import ${target}`);
		}
	};

	// --- Session operations ---
	const connectMachine = async (machineId: string) => {
		try {
			startTransition(() => {
				void dispatch(openSession({ machineId }))
					.unwrap()
					.catch((error) => {
						toast.error(error instanceof Error ? error.message : "Failed to open remote session");
					});
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to open remote session");
		}
	};

	const navigateSession = async (sessionId: string, remotePath?: string) => {
		try {
			await dispatch(refreshSession({ sessionId, path: remotePath, useSudo: sessionSudo[sessionId] })).unwrap();
			if (syncWorkingDirectory && remotePath) {
				const otherIds = ssh.sessions.order.filter((id) => id !== sessionId);
				await Promise.allSettled(otherIds.map((id) => dispatch(refreshSession({ sessionId: id, path: remotePath, useSudo: sessionSudo[id] })).unwrap()));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to load directory");
		}
	};

	const toggleSessionSudo = async (sessionId: string) => {
		const next = !(sessionSudo[sessionId] ?? false);
		setSessionSudo((prev) => {
			const newObj = { ...prev };

			if (syncWorkingDirectory) {
				for (const id of Object.keys(newObj)) {
					newObj[id] = next;
				}
			} else {
				newObj[sessionId] = next;
			}

			return newObj;
		});
		const session = ssh.sessions.byId[sessionId];
		if (!session) return;
		try {
			await dispatch(refreshSession({ sessionId, path: session.path, useSudo: next })).unwrap();
		} catch (error) {
			setSessionSudo((prev) => ({ ...prev, [sessionId]: !next }));
			toast.error(error instanceof Error ? error.message : "Failed to navigate as root");
		}
	};

	const closeRemoteSession = async (sessionId: string) => {
		await dispatch(closeSession(sessionId));
	};

	const downloadEntry = async (sessionId: string, remotePath: string) => {
		const target = await window.preload.ipc.send.dialog.selectDirectory(false);
		if (!target?.folderPath) return;
		try {
			await dispatch(startDownload({ sessionId, remotePath, localDirectory: target.folderPath })).unwrap();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to start download");
		}
	};

	const uploadToSession = async (sessionId: string, remoteDirectory: string) => {
		const paths =
			(await window.preload.ipc.send.dialog.selectPaths({
				allowFiles: true,
				allowDirectories: true,
				multiSelections: true,
			})) ?? [];
		for (const localPath of paths) {
			try {
				await dispatch(startUpload({ sessionId, localPath, remoteDirectory })).unwrap();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : `Failed to upload ${localPath}`);
			}
		}
	};

	// --- Drag and drop ---
	const moveMachineToFolder = async (machine: SshMachine, folderId: string | null) => {
		if ((machine.folderId ?? null) === folderId) return;
		try {
			await dispatch(
				saveMachine({
					id: machine.id,
					name: machine.name,
					host: machine.host,
					port: machine.port,
					user: machine.user,
					publicKey: machine.publicKey,
					folderId,
				})
			).unwrap();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to move host");
		}
	};

	const handleMachineDrop = async (event: DragEvent<HTMLElement>, folderId: string | null) => {
		event.preventDefault();
		event.stopPropagation();
		const machineId = event.dataTransfer.getData("text/plain").trim();
		setDragOverFolderId(null);
		setRootDropActive(false);
		setDraggingMachineId(null);
		if (!machineId) return;
		const machine = machinesById[machineId];
		if (!machine) return;
		await moveMachineToFolder(machine, folderId);
	};

	const onSwitchSync = () => {
		const newVal = !syncWorkingDirectory;

		setSyncWorkingDirectory(newVal);
	};

	return (
		<Box className={"SSH"}>
			<Drawer anchor={"left"} open={drawerOpen} onClose={() => setDrawerOpen(false)} slotProps={{ paper: { className: "SSH__drawer-paper" } }}>
				<SshSidebar
					filteredDirectory={filteredDirectory}
					draggingMachineId={draggingMachineId}
					dragOverFolderId={dragOverFolderId}
					rootDropActive={rootDropActive}
					onOpenCreateFolder={openCreateFolderDialog}
					onOpenCreateMachine={openCreateMachineDialog}
					onOpenEditFolder={openEditFolderDialog}
					onOpenEditMachine={openEditMachineDialog}
					onConnectMachine={connectMachine}
					onDuplicateMachine={duplicateMachine}
					onRemoveFolder={removeFolder}
					onRemoveMachine={removeMachine}
					onMachineDrop={handleMachineDrop}
					onDragOver={(folderId) => {
						if (folderId === null) {
							setRootDropActive(true);
							setDragOverFolderId(null);
						} else {
							setDragOverFolderId(folderId);
							setRootDropActive(false);
						}
					}}
					onMachineDragStart={(machineId) => setDraggingMachineId(machineId)}
					onDragEnd={() => {
						setDraggingMachineId(null);
						setDragOverFolderId(null);
						setRootDropActive(false);
					}}
				/>
			</Drawer>

			<SshWorkspace
				machinesById={machinesById}
				syncWorkingDirectory={syncWorkingDirectory}
				command={command}
				sessionSudo={sessionSudo}
				onOpenDrawer={() => setDrawerOpen(true)}
				onToggleSync={onSwitchSync}
				onNavigate={navigateSession}
				onUpload={uploadToSession}
				onDownload={downloadEntry}
				onCloseSession={closeRemoteSession}
				onCommandChange={setCommand}
				onSudoToggle={toggleSessionSudo}
			/>

			<SshMachineDialog
				open={machineDialogOpen}
				form={machineForm}
				folders={folders}
				onClose={closeMachineDialog}
				onSubmit={() => void submitMachine()}
				onChange={(update) => setMachineForm((prev) => ({ ...prev, ...update }))}
				onImportKey={importKeyFromFile}
			/>

			<SshFolderDialog
				open={folderDialogOpen}
				form={folderForm}
				onClose={closeFolderDialog}
				onSubmit={() => void submitFolder()}
				onChange={(name) => setFolderForm((prev) => ({ ...prev, name }))}
			/>
		</Box>
	);
}
