import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Box, Button, Dialog, IconButton, MenuItem, Select, Switch, Typography } from "@mui/material";
import CloseRounded from "@mui/icons-material/CloseRounded";
import LanguageIcon from "@mui/icons-material/Language";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import TuneIcon from "@mui/icons-material/Tune";
import InsightsIcon from "@mui/icons-material/Insights";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "@store";
import { closeSettings } from "@modules/configuration/configuration.actions";
import { refreshAuthStatuses as refreshAuthStatusesAction, reloadConfig, setConfig } from "@modules/configuration/configuration.async.actions";
import { selectPendingUpdate } from "@modules/update/update.selectors";
import type { LatestConfig, UpdateChannel } from "@shared/config/app.config";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";
import { AuthenticationSettings, AuthProfilePicker } from "./AuthenticationSettings";
import { Group, Row, Setting, SidebarItem, TextSettingInput } from "./SettingsLayout";
import { UpdatesSection } from "./UpdatesSection";

export type SettingsSectionKey = "endpoints" | "authentication" | "torrent" | "llmUsage" | "display" | "updates";

const sections: { key: SettingsSectionKey; label: string; description: string; icon: ReactNode }[] = [
	{ key: "endpoints", label: "Endpoints", description: "Services of the home infrastructure used by the modules.", icon: <LanguageIcon /> },
	{ key: "authentication", label: "Authentication", description: "OIDC sessions signing the requests of the modules.", icon: <VpnKeyIcon /> },
	{ key: "torrent", label: "Torrent", description: "Torrents found on Nyaa are sent to this qBittorrent instance.", icon: <CloudDownloadIcon /> },
	{
		key: "llmUsage",
		label: "LLM usage",
		description: "Claude Code and Codex token usage of this workstation, uploaded every 5 minutes (window closed included).",
		icon: <InsightsIcon />,
	},
	{ key: "display", label: "Display", description: "Appearance of the window.", icon: <TuneIcon /> },
	{ key: "updates", label: "Updates", description: "Releases published on GitHub, checked at startup then every hour.", icon: <SystemUpdateAltIcon /> },
];

const channelOptions: { value: UpdateChannel; label: string }[] = [
	{ value: "stable", label: "Stable" },
	{ value: "dev", label: "Dev" },
];

/**
 * Settings of the application: every change is saved right away (text fields when leaving them)
 */
export function SettingsDialog() {
	const dispatch = useAppDispatch();
	const { open, section } = useAppSelector((state) => state.config.settings);
	const config = useAppSelector((state) => state.config.current);
	const authStatuses = useAppSelector((state) => state.config.authStatuses);
	const currentVersion = useAppSelector((state) => state.update.status?.currentVersion);
	const pendingUpdate = useAppSelector(selectPendingUpdate);
	const [active, setActive] = useState<SettingsSectionKey>("endpoints");
	const [llmUsageStatus, setLlmUsageStatus] = useState<LlmUsageStatus | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);

	// On opening (state adjusted during render): the section asked by the caller, else the pending update, else the first one
	const [wasOpen, setWasOpen] = useState(open);
	if (wasOpen !== open) {
		setWasOpen(open);
		if (open) setActive(section ?? (pendingUpdate ? "updates" : "endpoints"));
	}

	useEffect(() => {
		if (!open) return;
		void dispatch(refreshAuthStatusesAction());
		void window.preload.ipc.send.llmUsage.status().then(setLlmUsageStatus);
	}, [dispatch, open]);

	const refreshAuthStatuses = useCallback(async () => {
		await dispatch(refreshAuthStatusesAction()).unwrap();
	}, [dispatch]);

	/**
	 * Profiles are saved by the main process: reload the store
	 */
	const onProfilesChange = useCallback(async () => {
		await dispatch(reloadConfig()).unwrap();
		await refreshAuthStatuses();
	}, [dispatch, refreshAuthStatuses]);

	const close = () => dispatch(closeSettings());

	const save = (updater: (config: LatestConfig) => LatestConfig) => {
		dispatch(setConfig(updater(config)))
			.unwrap()
			.catch((error: Error) => {
				toast.error(error.message);
				// The store took the value when the save started: back to the configuration actually written
				void dispatch(reloadConfig());
			});
	};

	const setEndpoint = <K extends "homeAssistant" | "api">(field: K, value: string) => save((c) => ({ ...c, endpoints: { ...c.endpoints, [field]: value } }));

	const setQbittorrent = <K extends keyof LatestConfig["endpoints"]["qbittorrent"]>(field: K, value: LatestConfig["endpoints"]["qbittorrent"][K]) =>
		save((c) => ({ ...c, endpoints: { ...c.endpoints, qbittorrent: { ...c.endpoints.qbittorrent, [field]: value } } }));

	const setLlmUsage = <K extends keyof LatestConfig["llmUsage"]>(field: K, value: LatestConfig["llmUsage"][K]) =>
		save((c) => ({ ...c, llmUsage: { ...c.llmUsage, [field]: value } }));

	const setUpdates = <K extends keyof LatestConfig["updates"]>(field: K, value: LatestConfig["updates"][K]) => save((c) => ({ ...c, updates: { ...c.updates, [field]: value } }));

	const syncLlmUsage = async () => {
		setIsSyncing(true);
		try {
			const status = await window.preload.ipc.send.llmUsage.sync();
			setLlmUsageStatus(status);
			if (status.outcome === "locked") toast.info("The standalone collector of this workstation is uploading");
			else if (status.lastError) toast.error(status.lastError);
			else toast.success("LLM usage uploaded");
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setIsSyncing(false);
		}
	};

	if (!config?.frame || !config?.endpoints) return null;

	const activeSection = sections.find((s) => s.key === active)!;
	const isLlmUsageAuthenticated = authStatuses.some((status) => status.profileId === config.llmUsage.authProfileId && status.authenticated);

	return (
		<Dialog open={open} onClose={close} maxWidth="md" fullWidth slotProps={{ paper: { sx: { height: "min(75vh, 680px)", minHeight: 420 } } }}>
			<Box sx={{ display: "flex", height: "100%", minHeight: 0, fontFamily: "'IBM Plex Sans', sans-serif" }}>
				<Box
					component="nav"
					sx={{
						width: 184,
						flexShrink: 0,
						display: "flex",
						flexDirection: "column",
						gap: 0.25,
						p: 1,
						pt: 2,
						borderRight: "1px solid var(--border-subtle)",
						bgcolor: "var(--surface-0)",
					}}
				>
					<Typography sx={{ px: 1.25, pb: 1.5, fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>Settings</Typography>
					{sections.map((s) => (
						<SidebarItem
							key={s.key}
							label={s.label}
							icon={s.icon}
							active={s.key === active}
							badge={s.key === "updates" && pendingUpdate !== null}
							onClick={() => setActive(s.key)}
						/>
					))}
					<Box sx={{ flex: 1 }} />
					{currentVersion && (
						<Typography sx={{ px: 1.25, fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-faint)" }}>
							{window.preload.config.appName} {currentVersion}
						</Typography>
					)}
				</Box>

				<Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
					<Box sx={{ display: "flex", alignItems: "flex-start", px: 3, pt: 2.5, pb: 2 }}>
						<Box sx={{ flex: 1 }}>
							<Typography sx={{ fontSize: "1rem", fontWeight: 600 }}>{activeSection.label}</Typography>
							<Typography sx={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{activeSection.description}</Typography>
						</Box>
						<IconButton size="small" onClick={close} aria-label="Close" sx={{ color: "var(--text-muted)" }}>
							<CloseRounded fontSize="small" />
						</IconButton>
					</Box>
					<Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 3, pb: 3, display: "flex", flexDirection: "column", gap: 2 }}>
						{active === "endpoints" && (
							<Group>
								<Setting label="Home Assistant" description="URL of the Home Assistant instance.">
									<TextSettingInput
										mono
										value={config.endpoints.homeAssistant}
										onSave={(v) => setEndpoint("homeAssistant", v)}
										placeholder="https://ha.example.com"
									/>
								</Setting>
								<Setting label="API" description="Base URL of the Elytools API.">
									<TextSettingInput mono value={config.endpoints.api} onSave={(v) => setEndpoint("api", v)} placeholder="https://api.example.com" />
								</Setting>
								<Setting label="Screenshare hub" description="SignalR hub of the screen sharing.">
									<TextSettingInput
										mono
										value={config.endpoints.hubs.screenshare}
										onSave={(screenshare) => save((c) => ({ ...c, endpoints: { ...c.endpoints, hubs: { ...c.endpoints.hubs, screenshare } } }))}
										placeholder="https://api.example.com/ws/screenshare"
									/>
								</Setting>
							</Group>
						)}

						{active === "authentication" && (
							<AuthenticationSettings
								redirectPath={config.auth.redirectPath}
								onRedirectPathChange={(redirectPath) => save((c) => ({ ...c, auth: { ...c.auth, redirectPath } }))}
								profiles={config.auth.profiles}
								statuses={authStatuses}
								bindings={{ torrent: config.endpoints.qbittorrent.authProfileId, "llm-usage": config.llmUsage.authProfileId }}
								onProfilesChange={onProfilesChange}
								refreshStatuses={refreshAuthStatuses}
							/>
						)}

						{active === "torrent" && (
							<Group>
								<Setting label="qBittorrent API" description="Base URL of the qBittorrent Web API (/api/v2 is appended).">
									<TextSettingInput
										mono
										value={config.endpoints.qbittorrent.apiBaseUrl}
										onSave={(v) => setQbittorrent("apiBaseUrl", v)}
										placeholder="https://torrent.example.com"
									/>
								</Setting>
								<Row>
									<AuthProfilePicker
										profiles={config.auth.profiles}
										statuses={authStatuses}
										value={config.endpoints.qbittorrent.authProfileId}
										onChange={(profileId) => setQbittorrent("authProfileId", profileId)}
										onManageProfiles={() => setActive("authentication")}
									/>
								</Row>
							</Group>
						)}

						{active === "llmUsage" && (
							<>
								<Group>
									<Setting label="Upload usage" description="Disabled: session logs are neither read nor sent.">
										<Switch checked={config.llmUsage.enabled} onChange={(_, checked) => setLlmUsage("enabled", checked)} />
									</Setting>
									<Setting label="Monitor URL">
										<TextSettingInput
											mono
											value={config.llmUsage.apiBaseUrl}
											onSave={(v) => setLlmUsage("apiBaseUrl", v)}
											placeholder="https://monitor.example.com"
										/>
									</Setting>
									<Setting label="Workstation name" description="Renaming keeps the history.">
										<TextSettingInput value={config.llmUsage.machineName} onSave={(v) => setLlmUsage("machineName", v)} />
									</Setting>
									<Row>
										<AuthProfilePicker
											profiles={config.auth.profiles}
											statuses={authStatuses}
											value={config.llmUsage.authProfileId}
											onChange={(profileId) => setLlmUsage("authProfileId", profileId)}
											onManageProfiles={() => setActive("authentication")}
										/>
										<Typography sx={{ mt: 1, fontSize: "0.72rem", color: "var(--text-faint)" }}>
											The account of the profile needs the llm-usage-monitor:admin role.
										</Typography>
									</Row>
								</Group>

								{llmUsageStatus && (
									<Group>
										<Setting
											label="Last upload"
											description={
												llmUsageStatus.lastSuccessAt
													? `${new Date(llmUsageStatus.lastSuccessAt).toLocaleString()}${llmUsageStatus.lastRunBy === "cli" ? " (standalone collector)" : ""}`
													: "Never"
											}
										>
											<Button size="small" variant="outlined" disabled={isSyncing || !isLlmUsageAuthenticated} onClick={() => void syncLlmUsage()}>
												{isSyncing ? "Uploading…" : "Upload now"}
											</Button>
										</Setting>
										<Setting label="Session logs followed">
											<Typography sx={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{llmUsageStatus.trackedFiles}</Typography>
										</Setting>
										<Setting label="Hours waiting">
											<Typography sx={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{llmUsageStatus.pendingHours}</Typography>
										</Setting>
										{llmUsageStatus.lastError && (
											<Row>
												<Typography sx={{ fontSize: "0.75rem", color: "error.main", overflowWrap: "anywhere" }}>{llmUsageStatus.lastError}</Typography>
											</Row>
										)}
									</Group>
								)}
							</>
						)}

						{active === "display" && (
							<Group>
								<Setting label="Resource utilization" description="CPU, memory and GPU load at the bottom of the window.">
									<Switch
										checked={config.frame.show.resourceUtilization}
										onChange={(_, checked) => save((c) => ({ ...c, frame: { ...c.frame, show: { ...c.frame.show, resourceUtilization: checked } } }))}
									/>
								</Setting>
							</Group>
						)}

						{active === "updates" && (
							<>
								<Group>
									<UpdatesSection />
								</Group>
								<Group>
									<Setting
										label="Automatic updates"
										description="Checks GitHub at startup then every hour, downloads the new release and installs it on restart."
									>
										<Switch checked={config.updates.autoCheck} onChange={(_, checked) => setUpdates("autoCheck", checked)} />
									</Setting>
									<Setting label="Channel" description="Stable releases only, or also the development builds (x.y.z-dev.n).">
										<Select size="small" value={config.updates.channel} onChange={(event) => setUpdates("channel", event.target.value)} sx={{ minWidth: 150 }}>
											{channelOptions.map((o) => (
												<MenuItem key={o.value} value={o.value}>
													{o.label}
												</MenuItem>
											))}
										</Select>
									</Setting>
								</Group>
							</>
						)}
					</Box>
				</Box>
			</Box>
		</Dialog>
	);
}
