import { useAppSelector } from "@store";
import { useMemo } from "react";
import { DataGrid, type GridColDef, type GridRenderCellParams } from "@mui/x-data-grid";
import type { Media } from "@components/internal/encoder/type";
import { Box, Chip, LinearProgress, Typography } from "@mui/material";
import { Description } from "@mui/icons-material";
import { convertSizeToHumanFormat } from "@view/utils/data.utils";
import { SpecialEncodingProgressValues } from "@modules/encoder/encoder.async.actions";

const statusLabels: Record<string, string> = {
	InProgress: "In Progress",
	Pending: "Pending",
	Converted: "Converted",
	Aborted: "Aborted",
};

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

	const fileStatus = useMemo(
		() =>
			files.reduce(
				(acc, { file }) => {
					const progress = progresses[file.path] || 0;

					if (progress === 0) {
						acc[file.path] = "Pending";
					} else if (progress > 0 && progress <= 0.99) {
						acc[file.path] = "InProgress";
					} else if (progress === SpecialEncodingProgressValues.Aborted) {
						acc[file.path] = "Aborted";
					} else {
						acc[file.path] = "Converted";
					}
					return acc;
				},
				{} as Record<string, FileStatus>
			),
		[files, progresses]
	);

	const rows = useMemo((): MediaWithEncoderProps[] => {
		return files.map(({ file, property }): MediaWithEncoderProps => ({
			file,
			property,
			status: fileStatus[file.path],
			progress: progresses[file.path] || 0,
			startedAt: startedAts[file.path] ?? 0,
		}));
	}, [files, fileStatus, progresses, startedAts]);

	const columns: GridColDef<MediaWithEncoderProps>[] = [
		{
			field: "name",
			headerName: "File",
			flex: 1,
			minWidth: 250,
			align: "center",
			headerAlign: "center",
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
			width: 130,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			valueGetter: (_, row) => convertSizeToHumanFormat(row.file.size),
		},
		{
			field: "status",
			headerName: "Status",
			width: 140,
			sortable: false,
			filterable: false,
			disableColumnMenu: true,
			align: "center",
			headerAlign: "center",
			renderCell: (params: EncoderGridRenderCellParams) => (
				<Chip label={statusLabels[params.row.status]} size="small" variant="outlined" color={getStatusColor(params.row.status)} sx={{ height: 24, fontSize: "0.75rem" }} />
			),
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
				const { progress, status, startedAt } = params.row;
				const pct = Math.min(progress * 100, 100);

				let eta = "";
				if (status === "InProgress" && progress > 0.01 && startedAt > 0) {
					const elapsed = (Date.now() - startedAt) / 1000;
					const remaining = (elapsed / progress) * (1 - progress);
					eta = formatEta(remaining);
				}

				return (
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", height: "100%" }}>
						<LinearProgress
							variant="determinate"
							value={pct}
							color={status === "Converted" ? "success" : "primary"}
							sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: "action.hover" }}
						/>
						<Typography
							sx={{
								fontFamily: "var(--font-mono)",
								fontSize: "0.65rem",
								color: "var(--text-muted)",
								minWidth: 72,
								textAlign: "right",
								whiteSpace: "nowrap",
							}}
						>
							{status === "InProgress" ? `${pct.toFixed(0)}%${eta ? ` · ${eta}` : ""}` : status === "Converted" ? "Done" : ""}
						</Typography>
					</Box>
				);
			},
		},
	];

	return <DataGrid sx={{ height: "100%" }} hideFooter getRowId={(r) => r.file.path} columns={columns} rows={rows} />;
};

type FileStatus = "InProgress" | "Pending" | "Converted" | "Aborted";

type MediaWithEncoderProps = Media & {
	status: FileStatus;
	progress: number;
	startedAt: number;
};

type EncoderGridRenderCellParams = GridRenderCellParams<MediaWithEncoderProps>;

const getStatusColor = (status: FileStatus): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
	switch (status) {
		case "InProgress":
			return "primary";
		case "Converted":
			return "success";
		case "Aborted":
			return "error";
		default:
			return "default";
	}
};
