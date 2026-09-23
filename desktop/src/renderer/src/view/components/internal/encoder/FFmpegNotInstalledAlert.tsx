import { Alert } from "@mui/material";
import AlertTitle from "@mui/material/AlertTitle";
import Link from "@mui/material/Link";

export function FFmpegNotInstalledAlert() {
	return (
		<Alert severity="error">
			<AlertTitle>This module requires FFmpeg</AlertTitle>
			It can be downloaded{" "}
			<Link target={"_blank"} href="https://ffmpeg.org/download.html">
				here
			</Link>
		</Alert>
	);
}
