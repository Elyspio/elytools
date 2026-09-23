import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PRESET_IDS, PURGE_PRESETS, PurgePresetId } from "@components/internal/purge/purge.presets";
import { Card, CardContent, Chip, Divider, FormControlLabel, Stack, Switch, Tooltip, Typography } from "@mui/material";
import { FolderOpen, Insights } from "@mui/icons-material";

const presetIcons: Record<PurgePresetId, typeof FolderOpen> = {
	node: FolderOpen,
	dotnet: FolderOpen,
	web: FolderOpen,
	python: FolderOpen,
	java: FolderOpen,
	rust: FolderOpen,
	misc: FolderOpen,
};

const presetColors: Record<PurgePresetId, "default" | "primary" | "secondary" | "success" | "warning" | "info"> = {
	node: "primary",
	dotnet: "secondary",
	web: "info",
	python: "success",
	java: "warning",
	rust: "secondary",
	misc: "default",
};

export type PurgePresetFilters = {
	selectedPresetIds: PurgePresetId[];
	matchNames: string[];
	estimateSizes: boolean;
};

type PurgePresetCardProps = {
	onChange: (filters: PurgePresetFilters) => void;
};

export function PurgePresetCard({ onChange }: PurgePresetCardProps) {
	const [selectedPresetIds, setSelectedPresetIds] = useState<PurgePresetId[]>(DEFAULT_PRESET_IDS);
	const [estimateSizes, setEstimateSizes] = useState(false);

	const togglePreset = useCallback((id: PurgePresetId) => {
		setSelectedPresetIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
	}, []);

	const matchNames = useMemo(() => {
		const selected = new Set(selectedPresetIds);
		const names = new Set(PURGE_PRESETS.filter((preset) => selected.has(preset.id)).flatMap((preset) => preset.targets));
		return Array.from(names);
	}, [selectedPresetIds]);

	useEffect(() => {
		onChange({
			selectedPresetIds,
			matchNames,
			estimateSizes,
		});
	}, [estimateSizes, matchNames, onChange, selectedPresetIds]);

	return (
		<Card
			sx={{
				flex: 1,
				minWidth: 0,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			<CardContent sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				<Stack spacing={2} direction={{ xs: "column", xl: "row" }}>
					<Stack
						spacing={2}
						sx={{
							flex: 1,
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
							<Insights color="secondary" />
							<Typography variant="h6">Presets</Typography>
						</Stack>
						<Typography
							variant="body2"
							sx={{
								color: "text.secondary",
							}}
						>
							Toggle the stacks you want to purge.
						</Typography>
						<Stack
							direction="row"
							sx={{
								flexWrap: "wrap",
								gap: 1,
							}}
						>
							{PURGE_PRESETS.map((preset) => {
								const Icon = presetIcons[preset.id];
								const selected = selectedPresetIds.includes(preset.id);
								return (
									<Tooltip key={preset.id} title={preset.description}>
										<Chip
											icon={<Icon fontSize="small" />}
											label={preset.title}
											clickable
											color={selected ? presetColors[preset.id] : "default"}
											variant={selected ? "filled" : "outlined"}
											onClick={() => togglePreset(preset.id)}
										/>
									</Tooltip>
								);
							})}
						</Stack>
					</Stack>
					<Divider flexItem orientation="vertical" sx={{ display: { xs: "none", xl: "block" } }} />
					<Divider sx={{ display: { xs: "block", xl: "none" } }} />
					<Stack sx={{ width: { xs: "100%", xl: 280 }, flexShrink: 0 }}>
						<FormControlLabel
							control={<Switch checked={estimateSizes} onChange={(event) => setEstimateSizes(event.target.checked)} />}
							label="Estimate size (slower)"
						/>
						<Typography
							variant="caption"
							sx={{
								color: "text.secondary",
							}}
						>
							Fast scan avoids deep traversal inside large folders like node_modules.
						</Typography>
					</Stack>
				</Stack>
			</CardContent>
		</Card>
	);
}
