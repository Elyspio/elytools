import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Card, CardContent, Chip, Stack, Typography, useTheme } from "@mui/material";
import { FolderOpen, Speed } from "@mui/icons-material";
import { alpha } from "@mui/material/styles";
import { toast } from "react-toastify";
import { PurgePresetCard, type PurgePresetFilters } from "@components/internal/purge/PurgePresetCard";
import { useAppDispatch, useAppSelector } from "@store";
import { purgeMediaTargets, scanPurgeTargets, selectFolderOrFiles } from "@modules/media/media.async.actions";
import { resetPurgeState, setPurgeSelectedFolder } from "@modules/media/media.actions";
import { PurgeResultCard } from "@components/internal/purge/PurgeResultCard";

export function Purge() {
	const theme = useTheme();
	const dispatch = useAppDispatch();

	const [presetFilters, setPresetFilters] = useState<PurgePresetFilters>({
		selectedPresetIds: [],
		matchNames: [],
		estimateSizes: false,
	});

	const { selectedFolder, targets, scanStats, estimatedSize, estimateProgress, scanning, estimating, purging, purgeProgress } = useAppSelector((s) => s.media.purge);

	useEffect(() => {
		dispatch(resetPurgeState());
	}, [dispatch, presetFilters.selectedPresetIds]);

	const selectFolder = useCallback(async () => {
		const result = await dispatch(selectFolderOrFiles("folder")).unwrap();
		if (!result?.folderPath) return;
		dispatch(setPurgeSelectedFolder(result.folderPath));
	}, [dispatch]);

	const runScan = useCallback(async () => {
		if (!selectedFolder) {
			toast.error("Select a folder to scan.");
			return;
		}

		if (presetFilters.matchNames.length === 0) {
			toast.error("Select at least one preset.");
			return;
		}

		try {
			await dispatch(
				scanPurgeTargets({
					root: selectedFolder,
					matchNames: presetFilters.matchNames,
					estimateSizes: presetFilters.estimateSizes,
				})
			).unwrap();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Scan failed.");
		}
	}, [dispatch, presetFilters.estimateSizes, presetFilters.matchNames, selectedFolder]);

	const purgeNow = useCallback(async () => {
		if (!targets.length) return;

		try {
			await dispatch(purgeMediaTargets({ targets })).unwrap();
			toast.success("Purge completed.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Purge failed.");
		}
	}, [dispatch, targets]);

	const statusCaption = useMemo(() => {
		if (scanning) return "Scanning folders...";
		if (estimating) return "Estimating size...";
		if (purging) return "Purging targets...";
		if (!selectedFolder) return "Select a folder to get started.";
		return targets.length > 0 ? "Review and purge." : "Scan for caches.";
	}, [estimating, purging, scanning, selectedFolder, targets.length]);

	return (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				gap: 2,
				overflow: "hidden",
			}}
		>
			<Card
				sx={{
					border: `1px solid ${theme.palette.divider}`,
					background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)}, ${alpha(theme.palette.secondary.main, 0.2)})`,
					flexShrink: 0,
				}}
			>
				<CardContent>
					<Stack
						direction={{ xs: "column", md: "row" }}
						spacing={2}
						sx={{
							alignItems: { xs: "flex-start", md: "center" },
						}}
					>
						<Stack
							spacing={1}
							sx={{
								flex: 1,
							}}
						>
							<Stack
								direction="row"
								spacing={1}
								sx={{
									alignItems: "center",
								}}
							>
								<Speed color="primary" />
								<Typography variant="h5">Purge Caches</Typography>
							</Stack>
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
								Fast scan for heavy build artifacts and caches. One click to purge.
							</Typography>
							<Typography
								variant="caption"
								sx={{
									color: "text.secondary",
								}}
							>
								{statusCaption}
							</Typography>
						</Stack>

						<Stack
							direction={{ xs: "column", sm: "row" }}
							spacing={1}
							sx={{
								alignItems: { xs: "stretch", sm: "center" },
								flexShrink: 0,
							}}
						>
							<Button variant="outlined" startIcon={<FolderOpen />} onClick={() => void selectFolder()}>
								Select folder
							</Button>
							<Button variant="contained" disabled={scanning || estimating || !selectedFolder} onClick={() => void runScan()}>
								Scan
							</Button>
						</Stack>
					</Stack>

					{selectedFolder && (
						<Stack
							direction={{ xs: "column", sm: "row" }}
							spacing={1.5}
							sx={{
								mt: 2,
								alignItems: { xs: "flex-start", sm: "center" },
							}}
						>
							<Chip label="Target" color="primary" size="small" />
							<Typography variant="body2" noWrap sx={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
								{selectedFolder}
							</Typography>
						</Stack>
					)}
				</CardContent>
			</Card>
			<Box
				sx={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: { xs: "column", lg: "row" },
					gap: 2,
					overflow: "hidden",
				}}
			>
				<Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden" }}>
					<PurgePresetCard onChange={setPresetFilters} />
				</Box>
				<Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", overflow: "hidden" }}>
					<PurgeResultCard
						targets={targets}
						scannedFolders={scanStats.scannedFolders}
						estimatedSize={estimatedSize}
						estimateSizes={presetFilters.estimateSizes}
						estimateProgress={estimateProgress}
						scanning={scanning}
						estimating={estimating}
						purging={purging}
						purgeProgress={purgeProgress}
						onPurge={purgeNow}
					/>
				</Box>
			</Box>
		</Box>
	);
}
