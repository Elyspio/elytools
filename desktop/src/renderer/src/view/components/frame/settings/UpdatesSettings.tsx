import { Box, Button, LinearProgress, Link, Stack } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import type { UpdateState, UpdateStatus } from "@shared/types/update.types";
import { SettingsCard, SettingsSection, SettingsStat } from "./SettingsControls";
import "./UpdatesSettings.scss";
import { ReleaseNotes } from "./ReleaseNotes";

const RELEASES_URL = "https://github.com/Elyspio/elytools/releases";

const stateLabels: Record<UpdateState, string> = {
	idle: "Not checked yet",
	checking: "Checking…",
	"up-to-date": "Up to date",
	available: "Update available",
	downloading: "Downloading…",
	downloaded: "Ready to install",
	error: "Check failed",
};

function relativeTime(iso: string | null, now: number) {
	if (!iso) return "—";
	const diff = Date.parse(iso) - now;
	const minutes = Math.round(Math.abs(diff) / 60_000);
	if (minutes < 1) return diff >= 0 ? "in a moment" : "just now";
	const label = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
	return diff >= 0 ? `in ${label}` : `${label} ago`;
}

function useMinuteClock() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/**
 * Auto update monitoring: versions, last and next check, and the next action (check, download, install)
 */
export const UpdatesSettings: React.FC<{ status: UpdateStatus | null }> = ({ status }) => {
	const now = useMinuteClock();
	const [isBusy, setIsBusy] = useState(false);

	const run = useCallback(async (action: () => Promise<unknown>) => {
		setIsBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setIsBusy(false);
		}
	}, []);

	if (!status) return null;

	const primaryAction = () => {
		switch (status.state) {
			case "available":
				return (
					<Button size="small" variant="contained" disabled={isBusy} onClick={() => void run(() => window.preload.ipc.send.update.download())}>
						Download {status.latestVersion}
					</Button>
				);
			case "downloading":
				return (
					<Button size="small" variant="contained" disabled>
						Downloading…
					</Button>
				);
			case "downloaded":
				return (
					<Button size="small" variant="contained" color="secondary" onClick={() => void window.preload.ipc.send.update.quitAndInstall()}>
						Restart and install {status.latestVersion}
					</Button>
				);
			default:
				return (
					<Button size="small" variant="outlined" disabled={isBusy || status.state === "checking"} onClick={() => void run(() => window.preload.ipc.send.update.check())}>
						{status.state === "checking" ? "Checking…" : "Check now"}
					</Button>
				);
		}
	};

	return (
		<SettingsSection title="Updates" description="Releases are published on GitHub; the application checks at startup, then every hour." action={primaryAction()}>
			<SettingsCard>
				<Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
					<Box className={`Updates__badge Updates__badge--${status.state}`}>
						<span className="Updates__dot" />
						{stateLabels[status.state]}
					</Box>
					<span className="Settings__hint">
						{status.state === "up-to-date" && `Elytools ${status.currentVersion} is the latest release.`}
						{status.state === "available" && `Elytools ${status.latestVersion} can be downloaded.`}
						{status.state === "downloaded" && "The update is installed when the application restarts."}
						{status.state === "idle" && "No check has run since the application started."}
					</span>
				</Stack>

				{status.state === "downloading" && (
					<Stack spacing={0.5}>
						<LinearProgress variant="determinate" value={status.progress ?? 0} className="Updates__progress" />
						<span className="Settings__hint">{Math.round(status.progress ?? 0)} %</span>
					</Stack>
				)}

				{status.error && status.state === "error" && <Box className="Settings__alert">{status.error}</Box>}
			</SettingsCard>

			<Box className="Settings__stats Updates__stats">
				<SettingsStat label="Installed" value={status.currentVersion} />
				<SettingsStat label="Latest release" value={status.latestVersion ?? "—"} />
				<SettingsStat label="Last check" value={relativeTime(status.lastCheckAt, now)} />
				<SettingsStat label="Next check" value={relativeTime(status.nextCheckAt, now)} />
			</Box>

			{status.releaseNotes && (
				<SettingsCard>
					<span className="Settings__label">Release notes · {status.latestVersion}</span>
					<ReleaseNotes html={status.releaseNotes} />
				</SettingsCard>
			)}

			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				{!status.isPackaged && <span className="Settings__hint Settings__hint--warn">Development build: checks use dev-app-update.yml, install is disabled.</span>}
				<Box sx={{ flex: 1 }} />
				<Link href={RELEASES_URL} target="_blank" underline="hover" className="Updates__link">
					All releases <OpenInNewIcon sx={{ fontSize: 13 }} />
				</Link>
			</Stack>
		</SettingsSection>
	);
};
