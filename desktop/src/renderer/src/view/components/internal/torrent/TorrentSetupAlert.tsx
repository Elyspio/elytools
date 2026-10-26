import { Alert, Button } from "@mui/material";
import AlertTitle from "@mui/material/AlertTitle";
import { useAppDispatch, useAppSelector } from "@store";
import { openSettings } from "@modules/configuration/configuration.actions";
import type { SettingsSectionKey } from "@components/frame/settings/Settings";
import { profileIssue, sessionState } from "@components/frame/settings/AuthenticationSettings";

type SetupIssue = {
	message: string;
	section: SettingsSectionKey;
	severity: "error" | "warning";
};

/**
 * Configuration or session problem preventing the requests to qBittorrent, shown above the search
 */
export function TorrentSetupAlert() {
	const dispatch = useAppDispatch();
	const qbittorrent = useAppSelector((state) => state.config.current.endpoints?.qbittorrent);
	const profiles = useAppSelector((state) => state.config.current.auth?.profiles);
	const authStatuses = useAppSelector((state) => state.config.authStatuses);

	if (!qbittorrent) return null;

	const status = authStatuses.find((s) => s.profileId === qbittorrent.authProfileId);
	const profile = profiles?.find((p) => p.id === qbittorrent.authProfileId);

	let issue: SetupIssue | null = null;
	if (!qbittorrent.apiBaseUrl.trim()) {
		issue = { message: "The qBittorrent API base URL is not configured.", section: "torrent", severity: "error" };
	} else if (!profile) {
		issue = { message: "No authentication profile is selected for qBittorrent.", section: "torrent", severity: "error" };
	} else if (status) {
		// The statuses arrive after the first render: nothing to say until then
		const message = profileIssue(status);
		if (message) {
			issue = { message: `${profile.name}: ${message}`, section: "authentication", severity: sessionState(status) === "unreachable" ? "warning" : "error" };
		}
	}

	if (!issue) return null;

	return (
		<Alert
			severity={issue.severity}
			action={
				<Button color="inherit" size="small" onClick={() => dispatch(openSettings(issue.section))}>
					Open Settings
				</Button>
			}
		>
			<AlertTitle>Torrents cannot be sent to qBittorrent</AlertTitle>
			{issue.message}
		</Alert>
	);
}
