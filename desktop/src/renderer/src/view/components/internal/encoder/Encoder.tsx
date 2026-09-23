import React, { useEffect, useMemo } from "react";
import { Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import "./Encoder.scss";
import { useDispatch } from "react-redux";
import { bindActionCreators } from "redux";
import { useAppSelector } from "@store";
import { SelectFolder } from "../../shared/nodes/SelectFolder";
import { setCurrentProcess } from "@modules/process/process.actions";
import { convertMedia, setupFfmpeg, stopConvertMedia } from "@modules/encoder/encoder.async.actions";
import { encodersSelectors } from "@modules/encoder/encoders.selectors";
import { setFormat, setFps } from "@modules/encoder/encoder.reducer";
import { setMedias } from "@modules/media/media.async.actions";
import type { Encoder as EncoderType } from "@shared/types/ffmpeg.types";
import { FolderOpen, PlayArrow, Stop } from "@mui/icons-material";
import type { FileInfo } from "@shared/types/dialog.types";
import { EncoderDashboard } from "@components/internal/encoder/EncoderDashboard";
import { convertSizeToHumanFormat } from "@view/utils/data.utils";
import { FFmpegNotInstalledAlert } from "@components/internal/encoder/FFmpegNotInstalledAlert";

const fpsOptions = [24, 30, 60, 120] as const;

export function Encoder() {
	const [manufacturer, setManufacturer] = React.useState<string>();

	const dispatch = useDispatch();

	const isFfmpegInstalled = useAppSelector(encodersSelectors.ffmpeg.isAvailable);
	const encoders = useAppSelector(encodersSelectors.ffmpeg.encoders);
	const files = useAppSelector((s) => s.media.data);
	const format = useAppSelector((s) => s.encoder.current.format);
	const fps = useAppSelector((s) => s.encoder.current.fps);
	const encoding = useAppSelector((s) => s.encoder.encoding);

	const actions = useMemo(
		() =>
			bindActionCreators(
				{
					setFormat,
					setCurrentProcess,
					setMedias,
					setFps,
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

	const onFormatChange = React.useCallback(
		(_: React.SyntheticEvent, val: EncoderType | null) => {
			dispatch(setFormat(val?.id));
		},
		[dispatch]
	);

	const onFileSelect = React.useCallback(
		(result: FileInfo[]) => {
			actions.setMedias(result);
		},
		[actions]
	);

	const manufacturers = useMemo(() => {
		return [...new Set(encoders.flatMap((e) => e.manufacturer))];
	}, [encoders]);

	return (
		<Stack className={"Encoder"}>
			{isFfmpegInstalled && (
				<>
					<Box className={"Encoder__toolbar"}>
						<Stack
							direction={"row"}
							spacing={1.5}
							useFlexGap
							sx={{
								alignItems: "flex-end",
								flexWrap: "wrap",
							}}
						>
							<SelectFolder variant={"outlined"} onChange={onFileSelect} mode={"files"} />

							<TextField sx={{ width: 90 }} select size={"small"} label={"FPS"} value={fps} onChange={(event) => actions.setFps(Number.parseInt(event.target.value))}>
								{fpsOptions.map((opt) => (
									<MenuItem key={opt} value={opt}>
										{opt}
									</MenuItem>
								))}
							</TextField>

							<Autocomplete
								sx={{ width: 200 }}
								onChange={(_, v) => setManufacturer(v)}
								renderInput={(params) => <TextField {...params} size={"small"} fullWidth label="Manufacturer" />}
								options={manufacturers}
								disableClearable
							/>
							{manufacturer && (
								<Autocomplete
									sx={{ width: 180 }}
									onChange={onFormatChange}
									getOptionLabel={(option) => option.id}
									renderInput={(params) => <TextField {...params} size={"small"} fullWidth label="Encoder" />}
									options={encoders.filter((e) => e.manufacturer === manufacturer)}
									disableClearable
								/>
							)}
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
							<Typography
								variant="caption"
								sx={{
									color: "var(--text-muted)",
									fontFamily: "var(--font-mono)",
									fontSize: "0.7rem",
								}}
							>
								{files.length} file{files.length !== 1 ? "s" : ""} &middot; {convertSizeToHumanFormat(files.reduce((acc, f) => acc + f.file.size, 0))}
							</Typography>

							{format &&
								(encoding ? (
									<Button size={"small"} color={"error"} variant="outlined" startIcon={<Stop />} onClick={() => actions.stopConvertMedia()}>
										Cancel
									</Button>
								) : (
									<Button size={"small"} variant="contained" startIcon={<PlayArrow />} onClick={() => actions.convert()}>
										Encode
									</Button>
								))}
						</Box>
					)}
				</>
			)}
			{!isFfmpegInstalled && <FFmpegNotInstalledAlert />}
		</Stack>
	);
}
