import { useMemo, useState } from "react";
import { Box, Button, Chip, Divider, IconButton, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import TerminalIcon from "@mui/icons-material/Terminal";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@store";
import { cancelTransfer, runCommand, stopCommand } from "@modules/ssh/ssh.async.actions";
import type { SshMachine } from "@shared/types/ssh.types";

function formatBytes(value: number) {
	if (!value) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	const size = value / 1024 ** index;
	return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

type Props = {
	machinesById: Record<string, SshMachine>;
	command: string;
	onCommandChange: (cmd: string) => void;
};

export function SshConsole({ machinesById, command, onCommandChange }: Props) {
	const dispatch = useAppDispatch();
	const ssh = useAppSelector((state) => state.ssh);
	const [useSudo, setUseSudo] = useState(false);

	const sessionMachines = useMemo(() => {
		const seenIds = new Set<string>();
		const result: SshMachine[] = [];
		for (const sessionId of ssh.sessions.order) {
			const machineId = ssh.sessions.byId[sessionId]?.machineId;
			if (!machineId || seenIds.has(machineId)) continue;
			const machine = machinesById[machineId];
			if (machine) {
				seenIds.add(machineId);
				result.push(machine);
			}
		}
		return result;
	}, [ssh.sessions.order, ssh.sessions.byId, machinesById]);

	const sudoVisible = sessionMachines.some((m) => m.user !== "root");
	const sudoAvailable = sessionMachines.length > 0 && sessionMachines.every((m) => m.user === "root" || m.hasPassword);

	const handleRunCommand = async () => {
		if (!command.trim() || sessionMachines.length === 0) return;
		try {
			await dispatch(
				runCommand({
					command: command.trim(),
					machineIds: sessionMachines.map((m) => m.id),
					useSudo: sudoVisible ? useSudo && sudoAvailable : false,
				})
			).unwrap();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to start command");
		}
	};

	const latestRunId = ssh.commands.order[0];
	const latestRun = latestRunId ? ssh.commands.byId[latestRunId] : undefined;

	return (
		<section className={"SSH__console"}>
			<Box className={"SSH__console-header"}>
				<Box>
					<Typography className={"SSH__eyebrow"}>Broadcast Commands</Typography>
					<Typography className={"SSH__headline"}>Live Runs</Typography>
				</Box>
				<Typography className={"SSH__toolbar-meta"}>{sessionMachines.length} panel machine(s) targeted</Typography>
			</Box>
			<Stack
				direction={"row"}
				spacing={1}
				className={"SSH__command-bar"}
				sx={{
					alignItems: "center",
				}}
			>
				<TextField
					size="small"
					fullWidth
					placeholder="uname -a && uptime"
					value={command}
					onChange={(e) => onCommandChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") void handleRunCommand();
					}}
				/>
				{sudoVisible && (
					<Button variant={useSudo ? "contained" : "outlined"} color={useSudo ? "secondary" : "inherit"} disabled={!sudoAvailable} onClick={() => setUseSudo((p) => !p)}>
						sudo
					</Button>
				)}
				<Button variant="contained" startIcon={<PlayArrowIcon />} disabled={!command.trim() || sessionMachines.length === 0} onClick={() => void handleRunCommand()}>
					Run
				</Button>
			</Stack>
			{latestRun && (
				<>
					<Stack direction={"row"} spacing={1} className={"SSH__run-targets"}>
						{latestRun.meta.targets.map((target) => {
							const machine = machinesById[target.machineId];
							const output = latestRun.outputsByTargetId[target.runTargetId];
							return (
								<Box key={target.runTargetId} className={"SSH__run-target"}>
									<Stack
										direction={"row"}
										sx={{
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										<Box>
											<Typography className={"SSH__run-target-name"}>{machine?.name ?? target.machineId}</Typography>
											<Typography className={"SSH__run-target-status"}>{output?.status ?? "running"}</Typography>
										</Box>
										{output?.status === "running" ? (
											<IconButton
												size="small"
												onClick={() =>
													void dispatch(
														stopCommand({
															runId: latestRun.meta.id,
															runTargetId: target.runTargetId,
														})
													)
												}
											>
												<StopIcon sx={{ fontSize: 16 }} />
											</IconButton>
										) : (
											<Chip size="small" label={`exit ${output?.exitCode ?? "-"}`} />
										)}
									</Stack>
								</Box>
							);
						})}
					</Stack>

					<Box className={"SSH__terminal"}>
						<Stack
							direction={"row"}
							sx={{
								justifyContent: "space-between",
								alignItems: "center",
								mb: 1,
							}}
						>
							<Typography className={"SSH__terminal-title"}>
								<TerminalIcon sx={{ fontSize: 16 }} /> {latestRun.meta.command}
							</Typography>
							<Button size="small" startIcon={<StopIcon />} onClick={() => void dispatch(stopCommand({ runId: latestRun.meta.id }))}>
								Stop all
							</Button>
						</Stack>
						<Stack spacing={0.75} className={"SSH__terminal-log"}>
							{latestRun.timeline.length === 0 && <Typography className={"SSH__terminal-empty"}>Waiting for remote output...</Typography>}
							{latestRun.timeline.map((chunk, index) => (
								<Box key={`${chunk.runTargetId}-${index}`} className={`SSH__terminal-line SSH__terminal-line--${chunk.stream}`}>
									<span>{machinesById[chunk.machineId]?.name ?? chunk.machineId}</span>
									<pre>{chunk.data}</pre>
								</Box>
							))}
						</Stack>
					</Box>
				</>
			)}
			<Divider sx={{ my: 2 }} />
			<Box>
				<Typography className={"SSH__eyebrow"}>Transfer Queue</Typography>
				<Stack
					spacing={0.75}
					sx={{
						mt: 1,
					}}
				>
					{ssh.transfers.order.length === 0 && <Typography className={"SSH__transfer-empty"}>No active or recent transfers.</Typography>}
					{ssh.transfers.order.map((transferId) => {
						const transfer = ssh.transfers.byId[transferId];
						const progress = transfer.totalBytes > 0 ? (transfer.transferredBytes / transfer.totalBytes) * 100 : 0;
						return (
							<Box key={transfer.id} className={"SSH__transfer"}>
								<Stack
									direction={"row"}
									sx={{
										justifyContent: "space-between",
										alignItems: "center",
										mb: 0.5,
									}}
								>
									<Box>
										<Typography className={"SSH__transfer-title"}>
											{machinesById[transfer.machineId]?.name ?? transfer.machineId} · {transfer.direction}
										</Typography>
										<Typography className={"SSH__transfer-meta"}>
											{transfer.sourcePath} → {transfer.targetPath}
										</Typography>
									</Box>
									<Stack
										direction={"row"}
										spacing={0.75}
										sx={{
											alignItems: "center",
										}}
									>
										<Chip size="small" label={transfer.status} />
										{(transfer.status === "queued" || transfer.status === "running") && (
											<IconButton size="small" onClick={() => void dispatch(cancelTransfer(transfer.id))}>
												<CloseIcon sx={{ fontSize: 14 }} />
											</IconButton>
										)}
									</Stack>
								</Stack>
								<LinearProgress variant="determinate" value={Math.max(progress, 2)} />
								<Typography className={"SSH__transfer-progress"}>
									{formatBytes(transfer.transferredBytes)} / {formatBytes(transfer.totalBytes)}
								</Typography>
							</Box>
						);
					})}
				</Stack>
			</Box>
		</section>
	);
}
