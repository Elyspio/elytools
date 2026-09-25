import { useMemo, useState } from "react";
import {
	Box,
	Button,
	Card,
	CardContent,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	LinearProgress,
	Stack,
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import { WarningAmber } from "@mui/icons-material";
import { convertSizeToHumanFormat } from "@view/utils/data.utils";

type PurgeResultCardProps = {
	targets: string[];
	scannedFolders: number;
	estimatedSize: number | null;
	estimateSizes: boolean;
	estimateProgress: {
		processed: number;
		total: number;
	};
	scanning: boolean;
	estimating: boolean;
	purging: boolean;
	purgeProgress: {
		processed: number;
		total: number;
	};
	onPurge: () => Promise<void>;
};

export function PurgeResultCard({
	targets,
	scannedFolders,
	estimatedSize,
	estimateSizes,
	estimateProgress,
	scanning,
	estimating,
	purging,
	purgeProgress,
	onPurge,
}: PurgeResultCardProps) {
	const theme = useTheme();
	const [confirmOpen, setConfirmOpen] = useState(false);

	const previewTargets = useMemo(() => targets.slice(0, 40), [targets]);
	const remainingCount = targets.length - previewTargets.length;

	return (
		<>
			<Card
				id={"results-card"}
				sx={{
					flex: 1,
					minWidth: 0,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", p: 2 }}>
					<Stack
						spacing={2}
						sx={{
							height: "100%",
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
							overflow: "hidden",
						}}
					>
						<Stack
							direction="row"
							spacing={1}
							sx={{
								alignItems: "center",
								flexShrink: 0,
							}}
						>
							<WarningAmber color="warning" />
							<Typography variant="h6">Results</Typography>
						</Stack>

						<Stack
							direction={{ xs: "column", md: "row" }}
							spacing={2}
							sx={{
								alignItems: { xs: "flex-start", md: "flex-start" },
								flexShrink: 0,
							}}
						>
							<Stack spacing={0.5}>
								<Typography
									variant="caption"
									sx={{
										color: "text.secondary",
									}}
								>
									Scanned folders
								</Typography>
								<Typography variant="h6">{scannedFolders}</Typography>
							</Stack>
							<Stack spacing={0.5}>
								<Typography
									variant="caption"
									sx={{
										color: "text.secondary",
									}}
								>
									Matched targets
								</Typography>
								<Typography variant="h6">{targets.length}</Typography>
							</Stack>
							<Stack spacing={0.5}>
								<Typography
									variant="caption"
									sx={{
										color: "text.secondary",
									}}
								>
									Estimated size
								</Typography>
								<Typography variant="h6">{estimatedSize !== null ? convertSizeToHumanFormat(estimatedSize) : "-"}</Typography>
							</Stack>
							<Box
								sx={{
									flex: 1,
								}}
							/>
							<Button color="error" variant="contained" disabled={!targets.length || purging} onClick={() => setConfirmOpen(true)}>
								Purge now
							</Button>
						</Stack>

						{(scanning || estimating) && <LinearProgress />}
						{purging && <LinearProgress variant="determinate" value={purgeProgress.total > 0 ? (purgeProgress.processed / purgeProgress.total) * 100 : 0} />}

						<Box
							sx={{
								flex: 1,
								minHeight: 0,
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: 1,
								p: 1.5,
								overflow: "auto",
								display: "flex",
								flexDirection: "column",
							}}
						>
							{targets.length === 0 ? (
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									No matches yet. Run a scan to preview targets.
								</Typography>
							) : (
								<Stack spacing={1}>
									{previewTargets.map((target) => (
										<Tooltip key={target} title={target} placement="top">
											<Typography variant="body2" noWrap>
												{target}
											</Typography>
										</Tooltip>
									))}
									{remainingCount > 0 && (
										<Typography
											variant="caption"
											sx={{
												color: "text.secondary",
											}}
										>
											+{remainingCount} more...
										</Typography>
									)}
								</Stack>
							)}
						</Box>

						{estimateSizes && estimateProgress.total > 0 && (
							<Typography
								variant="caption"
								sx={{
									color: "text.secondary",
									flexShrink: 0,
								}}
							>
								Size estimation: {estimateProgress.processed}/{estimateProgress.total}
							</Typography>
						)}
					</Stack>
				</CardContent>
			</Card>
			<Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
				<DialogTitle>Confirm purge</DialogTitle>
				<DialogContent>
					<DialogContentText>
						This will permanently delete {targets.length} folder{targets.length === 1 ? "" : "s"}
						{estimatedSize !== null ? ` (~${convertSizeToHumanFormat(estimatedSize)}).` : "."}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
					<Button
						color="error"
						variant="contained"
						onClick={() => {
							setConfirmOpen(false);
							void onPurge();
						}}
						disabled={purging}
					>
						Purge now
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
