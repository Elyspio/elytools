import { useAppSelector } from "@store";
import { useMemo } from "react";
import { DataGrid, type GridColDef, type GridRenderCellParams } from "@mui/x-data-grid";
import type { Media } from "@components/internal/encoder/type";
import { Box, Chip, LinearProgress, Tooltip, Typography } from "@mui/material";
import { Description } from "@mui/icons-material";
import { convertSizeToHumanFormat } from "@view/utils/data.utils";
import type { EncodePhase, FileEncodeState } from "@modules/encoder/encoder.reducer";
import { DEFAULT_ENCODER_SETTINGS, ENCODER_PROFILES } from "@shared/encoder/encoder.profiles";

type ChipColor = "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

const phases: Record<EncodePhase, { label: string; color: ChipColor }> = {
	pending: { label: "Pending", color: "default" },
	analyzing: { label: "Analyzing", color: "info" },
	encoding: { label: "Encoding", color: "primary" },
	remuxing: { label: "Remuxing", color: "primary" },
	done: { label: "Converted", color: "success" },
	skipped: { label: "Skipped", color: "default" },
	failed: { label: "Failed", color: "error" },
	aborted: { label: "Aborted", color: "error" },
};

const monoSx = { fontFamily: "var(--font-mono)", fontSize: "0.7rem", whiteSpace: "nowrap" } as const;

function formatEta(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "";
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
	if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

export const EncoderDashboard = () => {
	const files = useAppSelector((s) => s.media.data);
	const progresses = useAppSelector((s) => s.encoder.processes.progress);
	const startedAts = useAppSelector((s) => s.encoder.processes.startedAt);
	const states = useAppSelector((s) => s.encoder.processes.files);
	const profileId = useAppSelector((s) => s.config.current.encoder?.profile ?? DEFAULT_ENCODER_SETTINGS.profile);
	const qualityLabel = ENCODER_PROFILES[profileId].qualityLabel;

	const rows = useMemo((): MediaWithEncoderProps[] => {
		return files.map(({ file, property }): MediaWithEncoderProps => ({
			file,
			property,
			state: states[file.path] ?? { phase: "pending" },
			progress: progresses[file.path] || 0,
			startedAt: startedAts[file.path] ?? 0,
		}));
	}, [files, states, progresses, startedAts]);

	const columns: GridColDef<MediaWithEncoderProps>[] = [
		{
			field: "name",
			headerName: "File",
			flex: 1,
			minWidth: 250,
			renderCell: (params: EncoderGridRenderCellParams) => (
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, height: "100%" }}>
					<Description sx={{ fontSize: 20, color: "text.secondary" }} />
					<Box sx={{ minWidth: 0 }}>
						<Typography variant="body2" noWrap sx={{ fontWeight: 500 }} title={params.row.file.name}>
							{params.row.file.name}
						</Typography>
					</Box>
				</Box>
			),
		},
		{
			field: "size",
			headerName: "Size",
			width: 190,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			renderCell: (params: EncoderGridRenderCellParams) => {
				const { file, state } = params.row;
				const before = convertSizeToHumanFormat(file.size);

				if (state.phase !== "done" || state.outputSize === undefined) return <Typography sx={monoSx}>{before}</Typography>;

				const gain = Math.round((1 - state.outputSize / file.size) * 100);
				return (
					<Typography sx={monoSx}>
						{before} → {convertSizeToHumanFormat(state.outputSize)}{" "}
						<Box component={"span"} sx={{ color: "success.main" }}>
							−{gain} %
						</Box>
					</Typography>
				);
			},
		},
		{
			field: "status",
			headerName: "Status",
			width: 130,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			renderCell: (params: EncoderGridRenderCellParams) => {
				const { phase, note } = params.row.state;
				const chip = <Chip label={phases[phase].label} size="small" variant="outlined" color={phases[phase].color} sx={{ height: 24, fontSize: "0.75rem" }} />;
				return note ? <Tooltip title={note}>{chip}</Tooltip> : chip;
			},
		},
		{
			field: "quality",
			headerName: "Quality",
			width: 150,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			renderCell: (params: EncoderGridRenderCellParams) => {
				const { quality, xpsnr, targetReached } = params.row.state;

				if (quality === undefined || xpsnr === undefined) return null;

				const text = (
					<Typography sx={{ ...monoSx, color: targetReached ? "var(--text-muted)" : "warning.main" }}>
						{qualityLabel} {quality} · {xpsnr.toFixed(1)} dB
					</Typography>
				);

				return targetReached ? text : <Tooltip title={`Target not reached: best quality of the range used (${qualityLabel} ${quality})`}>{text}</Tooltip>;
			},
		},
		{
			field: "progress",
			headerName: "Progress",
			minWidth: 200,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			renderCell: (params: EncoderGridRenderCellParams) => {
				const { progress, state, startedAt } = params.row;
				const running = state.phase === "encoding" || state.phase === "remuxing";
				const pct = Math.min(progress * 100, 100);

				let eta = "";
				if (running && progress > 0.01 && startedAt > 0) {
					const elapsed = (Date.now() - startedAt) / 1000;
					eta = formatEta((elapsed / progress) * (1 - progress));
				}

				return (
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", height: "100%" }}>
						<LinearProgress
							variant={state.phase === "analyzing" ? "indeterminate" : "determinate"}
							value={state.phase === "done" || state.phase === "skipped" ? 100 : pct}
							color={state.phase === "done" ? "success" : "primary"}
							sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: "action.hover" }}
						/>
						<Typography sx={{ ...monoSx, fontSize: "0.65rem", color: "var(--text-muted)", minWidth: 72, textAlign: "right" }}>
							{running ? `${pct.toFixed(0)}%${eta ? ` · ${eta}` : ""}` : state.phase === "done" ? "Done" : ""}
						</Typography>
					</Box>
				);
			},
		},
	];

	return <DataGrid sx={{ height: "100%" }} hideFooter getRowId={(r) => r.file.path} columns={columns} rows={rows} />;
};

type MediaWithEncoderProps = Media & {
	state: FileEncodeState;
	progress: number;
	startedAt: number;
};

type EncoderGridRenderCellParams = GridRenderCellParams<MediaWithEncoderProps>;
