import { Box, Button, LinearProgress, Link, Typography } from "@mui/material";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import { useAppDispatch, useAppSelector } from "@store";
import { checkForUpdate, downloadUpdate, installUpdate } from "@modules/update/update.async.actions";
import type { UpdateStatus } from "@shared/types/update.types";
import { ReleaseNotes } from "./ReleaseNotes";

const rowSx = { display: "flex", alignItems: "center", gap: 2, px: 2, py: 1.5, "&:not(:last-child)": { borderBottom: "1px solid var(--border-subtle)" } };

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(iso: string) {
	const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 60) return relativeFormat.format(seconds, "second");
	if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), "minute");
	if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), "hour");
	return relativeFormat.format(Math.round(seconds / 86400), "day");
}

/**
 * Installed version, state of the automatic update and the action it waits for
 */
export function UpdatesSection() {
	const dispatch = useAppDispatch();
	const status = useAppSelector((state) => state.update.status);

	if (!status) return null;

	const showNotes = status.releaseNotes && (status.state === "available" || status.state === "downloading" || status.state === "downloaded");

	return (
		<>
			<Box sx={rowSx}>
				<Box sx={{ flex: 1, minWidth: 0 }}>
					<Typography sx={{ fontSize: "0.88rem", fontWeight: 500 }}>{title(status)}</Typography>
					<Typography sx={{ fontSize: "0.75rem", color: status.state === "error" ? "error.main" : "var(--text-muted)", overflowWrap: "anywhere" }}>
						{description(status)}
					</Typography>
				</Box>
				<Action status={status} onCheck={() => dispatch(checkForUpdate())} onDownload={() => dispatch(downloadUpdate())} onInstall={() => dispatch(installUpdate())} />
			</Box>

			{status.state === "downloading" && (
				<Box sx={{ ...rowSx, py: 1 }}>
					<LinearProgress variant="determinate" value={status.progress ?? 0} sx={{ flex: 1, borderRadius: 1 }} />
					<Typography sx={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)", width: 40, textAlign: "right" }}>
						{Math.round(status.progress ?? 0)} %
					</Typography>
				</Box>
			)}

			{showNotes && (
				<Box sx={{ ...rowSx, display: "block" }}>
					<Typography variant="overline" component="div" sx={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
						What's new in {status.latestVersion}
					</Typography>
					<ReleaseNotes html={status.releaseNotes!} />
				</Box>
			)}

			<Box sx={{ ...rowSx, py: 1 }}>
				<Typography sx={{ flex: 1, fontSize: "0.72rem", color: "var(--text-faint)" }}>
					{status.isPackaged ? lastCheck(status) : "Development build: checks use dev-app-update.yml, nothing is installed."}
				</Typography>
				<Link href={window.preload.config.releasesUrl} target="_blank" rel="noreferrer" underline="hover" sx={{ fontSize: "0.75rem" }}>
					All releases
				</Link>
			</Box>
		</>
	);
}

type ActionProps = {
	status: UpdateStatus;
	onCheck: () => void;
	onDownload: () => void;
	onInstall: () => void;
};

function Action({ status, onCheck, onDownload, onInstall }: Readonly<ActionProps>) {
	switch (status.state) {
		case "available":
			if (status.downgrade) {
				return (
					<Button size="small" variant="contained" onClick={onDownload}>
						Go back to {status.latestVersion}
					</Button>
				);
			}
			// Development builds do not download automatically
			return status.isPackaged ? null : (
				<Button size="small" variant="outlined" onClick={onDownload}>
					Download
				</Button>
			);
		case "downloading":
			return null;
		case "downloaded":
			return (
				<Button size="small" variant="contained" startIcon={<RestartAltRounded />} disabled={!status.isPackaged} onClick={onInstall}>
					Restart
				</Button>
			);
		default:
			return (
				<Button size="small" variant="outlined" disabled={status.state === "checking"} onClick={onCheck}>
					{status.state === "checking" ? "Checking…" : "Check now"}
				</Button>
			);
	}
}

function title(status: UpdateStatus) {
	const version = status.latestVersion;
	switch (status.state) {
		case "checking":
			return "Checking for updates…";
		case "up-to-date":
			return "Elytools is up to date";
		case "no-release":
			return "No release on this channel yet";
		case "available":
			return status.downgrade ? `Older version ${version} available` : `Version ${version} found`;
		case "downloading":
			return `Downloading version ${version}…`;
		case "downloaded":
			return `Version ${version} ready to install`;
		case "error":
			return "Update failed";
		default:
			return `Elytools ${status.currentVersion}`;
	}
}

function description(status: UpdateStatus) {
	switch (status.state) {
		case "available":
			if (status.downgrade) return `Installed version ${status.currentVersion} is newer: going back only happens on your request.`;
			return status.isPackaged ? "The download starts automatically." : "Development build: download it by hand.";
		case "downloaded":
			return status.downgrade ? "Installed when restarting." : "Installed when restarting or when the application quits.";
		case "error":
			return status.error ?? "";
		default:
			return `Installed version ${status.currentVersion}`;
	}
}

function lastCheck(status: UpdateStatus) {
	const last = status.lastCheckAt ? `Last check ${formatRelative(status.lastCheckAt)}` : "Not checked yet";
	return status.nextCheckAt ? `${last} · next check ${formatRelative(status.nextCheckAt)}` : last;
}
