import React, { useEffect, useMemo } from "react";
import { Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from "@mui/material";
import "./Encoder.scss";
import { bindActionCreators } from "redux";
import { useAppDispatch, useAppSelector } from "@store";
import { SelectFolder } from "../../shared/nodes/SelectFolder";
import { convertMedia, setupFfmpeg, stopConvertMedia } from "@modules/encoder/encoder.async.actions";
import { encodersSelectors } from "@modules/encoder/encoders.selectors";
import { setMedias } from "@modules/media/media.async.actions";
import { setConfig } from "@modules/configuration/configuration.async.actions";
import { FolderOpen, PlayArrow, Stop } from "@mui/icons-material";
import type { FileInfo } from "@shared/types/dialog.types";
import type { EncoderProfileId, EncoderSettings, QualityPresetId } from "@shared/types/ffmpeg.types";
import { EncoderDashboard } from "@components/internal/encoder/EncoderDashboard";
import { convertSizeToHumanFormat } from "@view/utils/data.utils";
import { FFmpegNotInstalledAlert } from "@components/internal/encoder/FFmpegNotInstalledAlert";
import { DEFAULT_ENCODER_SETTINGS, ENCODER_PROFILES, QUALITY_PRESETS } from "@shared/encoder/encoder.profiles";

const profiles = Object.values(ENCODER_PROFILES);
const qualityPresets = Object.entries(QUALITY_PRESETS) as [Exclude<QualityPresetId, "custom">, { label: string; xpsnr: number }][];

export function Encoder() {
	const dispatch = useAppDispatch();

	const isFfmpegInstalled = useAppSelector(encodersSelectors.ffmpeg.isAvailable);
	const encoders = useAppSelector(encodersSelectors.ffmpeg.encoders);
	const files = useAppSelector((s) => s.media.data);
	const encoding = useAppSelector((s) => s.encoder.encoding);
	const config = useAppSelector((s) => s.config.current);
	const settings: EncoderSettings = config.encoder ?? DEFAULT_ENCODER_SETTINGS;

	const actions = useMemo(
		() =>
			bindActionCreators(
				{
					setMedias,
					stopConvertMedia,
					convert: convertMedia,
					setupFfmpeg,
				},
				dispatch
			),
		[dispatch]
	);

	useEffect(() => {
		actions.setupFfmpeg();
	}, [actions]);

	const updateSettings = React.useCallback(
		(update: Partial<EncoderSettings>) => {
			void dispatch(setConfig({ ...config, encoder: { ...settings, ...update } }));
		},
		[dispatch, config, settings]
	);

	const onFileSelect = React.useCallback(
		(result: FileInfo[]) => {
			actions.setMedias(result);
		},
		[actions]
	);

	const isEncoderAvailable = (encoder: string) => encoders.some((e) => e.id === encoder);
	const profile = ENCODER_PROFILES[settings.profile];
	const profileAvailable = isEncoderAvailable(profile.encoder);

	return (
		<Stack className={"Encoder"}>
			{isFfmpegInstalled && (
				<>
					<Box className={"Encoder__toolbar"}>
						<Stack direction={"row"} spacing={1.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
							<SelectFolder variant={"outlined"} onChange={onFileSelect} mode={"files"} />

							<TextField
								sx={{ width: 190 }}
								select
								size={"small"}
								label={"Encoder"}
								value={settings.profile}
								disabled={encoding}
								error={!profileAvailable}
								helperText={profileAvailable ? undefined : `${profile.encoder} missing in ffmpeg`}
								onChange={(event) => updateSettings({ profile: event.target.value as EncoderProfileId })}
							>
								{profiles.map((p) => (
									<MenuItem key={p.id} value={p.id} disabled={!isEncoderAvailable(p.encoder)}>
										{p.label} ({p.hardware})
									</MenuItem>
								))}
							</TextField>

							<Tooltip title={"XPSNR target (luma): the analysis picks the highest CQ/CRF reaching it on 12 samples of each episode"}>
								<TextField
									sx={{ width: 170 }}
									select
									size={"small"}
									label={"Quality"}
									value={settings.quality}
									disabled={encoding}
									onChange={(event) => updateSettings({ quality: event.target.value as QualityPresetId })}
								>
									{qualityPresets.map(([id, preset]) => (
										<MenuItem key={id} value={id}>
											{preset.label} · {preset.xpsnr} dB
										</MenuItem>
									))}
									<MenuItem value={"custom"}>Custom</MenuItem>
								</TextField>
							</Tooltip>

							{settings.quality === "custom" && (
								<TextField
									sx={{ width: 110 }}
									size={"small"}
									type={"number"}
									label={"XPSNR (dB)"}
									value={settings.customXpsnr}
									disabled={encoding}
									slotProps={{ htmlInput: { min: 35, max: 50, step: 0.5 } }}
									onChange={(event) => {
										const value = Number.parseFloat(event.target.value);
										if (Number.isFinite(value)) updateSettings({ customXpsnr: value });
									}}
								/>
							)}

							<Tooltip title={"GPU deband (libplacebo) for sources with visible banding in gradients and dark scenes"}>
								<FormControlLabel
									control={
										<Switch
											size={"small"}
											checked={settings.deband}
											disabled={encoding}
											onChange={(event) => updateSettings({ deband: event.target.checked })}
										/>
									}
									label={<Typography sx={{ fontSize: "0.8125rem" }}>Deband</Typography>}
								/>
							</Tooltip>
						</Stack>
					</Box>

					{files.length > 0 ? (
						<Box className={"Encoder__dashboard"}>
							<EncoderDashboard />
						</Box>
					) : (
						<Box className={"Encoder__empty"}>
							<FolderOpen sx={{ fontSize: 40, color: "var(--text-faint)" }} />
							<Typography sx={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Select files to begin encoding</Typography>
						</Box>
					)}

					{files.length > 0 && (
						<Box className={"Encoder__footer"}>
							<EncoderFooterSummary />

							{encoding ? (
								<Button size={"small"} color={"error"} variant="outlined" startIcon={<Stop />} onClick={() => actions.stopConvertMedia()}>
									Cancel
								</Button>
							) : (
								<Button size={"small"} variant="contained" startIcon={<PlayArrow />} disabled={!profileAvailable} onClick={() => actions.convert()}>
									Encode
								</Button>
							)}
						</Box>
					)}
				</>
			)}
			{!isFfmpegInstalled && <FFmpegNotInstalledAlert />}
		</Stack>
	);
}

function EncoderFooterSummary() {
	const files = useAppSelector((s) => s.media.data);
	const states = useAppSelector((s) => s.encoder.processes.files);

	const inputSize = files.reduce((acc, f) => acc + f.file.size, 0);
	const done = files.filter((f) => states[f.file.path]?.phase === "done");
	const doneBefore = done.reduce((acc, f) => acc + f.file.size, 0);
	const doneAfter = done.reduce((acc, f) => acc + (states[f.file.path]?.outputSize ?? 0), 0);

	return (
		<Typography variant="caption" sx={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
			{files.length} file{files.length !== 1 ? "s" : ""} &middot; {convertSizeToHumanFormat(inputSize)}
			{done.length > 0 &&
				` · ${done.length} converted: ${convertSizeToHumanFormat(doneBefore)} → ${convertSizeToHumanFormat(doneAfter)} (−${Math.round((1 - doneAfter / doneBefore) * 100)} %)`}
		</Typography>
	);
}
