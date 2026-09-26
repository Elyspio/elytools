import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import "./Settings.scss";
import { reloadConfig, setConfig } from "@modules/configuration/configuration.async.actions";
import { useAppDispatch, useAppSelector } from "@store";
import { LatestConfig } from "@shared/config/app.config";
import { toast } from "react-toastify";
import LanguageIcon from "@mui/icons-material/Language";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import TuneIcon from "@mui/icons-material/Tune";
import InsightsIcon from "@mui/icons-material/Insights";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";
import type { OidcAuthStatus } from "@shared/types/auth.types";
import { AuthenticationSettings, AuthProfilePicker } from "./AuthenticationSettings";
import { UpdatesSettings } from "./UpdatesSettings";
import { SettingsCard, SettingsField, SettingsGrid, SettingsInput, SettingsSection, SettingsStat, SettingsToggle } from "./SettingsControls";

export type SettingsSectionKey = "endpoints" | "authentication" | "torrent" | "llmUsage" | "display" | "updates";
type Section = SettingsSectionKey;

const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
	{ key: "endpoints", label: "Endpoints", icon: <LanguageIcon sx={{ fontSize: 16 }} /> },
	{ key: "authentication", label: "Authentication", icon: <VpnKeyIcon sx={{ fontSize: 16 }} /> },
	{ key: "torrent", label: "Torrent", icon: <CloudDownloadIcon sx={{ fontSize: 16 }} /> },
	{ key: "llmUsage", label: "LLM usage", icon: <InsightsIcon sx={{ fontSize: 16 }} /> },
	{ key: "display", label: "Display", icon: <TuneIcon sx={{ fontSize: 16 }} /> },
	{ key: "updates", label: "Updates", icon: <SystemUpdateAltIcon sx={{ fontSize: 16 }} /> },
];

type OwnProps = {
	isOpen: boolean;
	close: () => void;
	/** Section shown when the dialog opens, e.g. « updates » when a release is pending */
	initialSection?: Section;
};

export const Settings: React.FC<OwnProps> = ({ close, isOpen, initialSection }) => {
	const config = useAppSelector((state) => state.config.current);
	const updateStatus = useAppSelector((state) => state.config.update);
	const dispatch = useAppDispatch();
	const [draftConfig, setDraftConfig] = useState<LatestConfig | null>(null);
	const [authStatuses, setAuthStatuses] = useState<OidcAuthStatus[]>([]);
	const [activeSection, setActiveSection] = useState<Section>("endpoints");
	const [llmUsageStatus, setLlmUsageStatus] = useState<LlmUsageStatus | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);

	const refreshAuthStatuses = useCallback(async () => {
		setAuthStatuses(await window.preload.ipc.send.auth.oidc.statuses());
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		void window.preload.ipc.send.auth.oidc.statuses().then(setAuthStatuses);
		void window.preload.ipc.send.llmUsage.status().then(setLlmUsageStatus);
	}, [isOpen]);

	// Take the draft from the store when the dialog opens (adjusting state during render instead of in an effect).
	// Later store changes (auth profiles) are merged into the draft by hand, so the unsaved edits survive.
	const [draftSyncedOpen, setDraftSyncedOpen] = useState(false);
	if (draftSyncedOpen !== isOpen && (!isOpen || (config?.frame && config?.endpoints))) {
		setDraftSyncedOpen(isOpen);
		if (isOpen) setDraftConfig(config);
		if (isOpen && initialSection) setActiveSection(initialSection);
	}

	const updateDraft = useCallback((updater: (draft: LatestConfig) => LatestConfig) => {
		setDraftConfig((prev) => {
			if (!prev) return prev;
			return updater(prev);
		});
	}, []);

	const saveConfig = useCallback(async () => {
		if (!draftConfig) return;
		await dispatch(setConfig(draftConfig));
	}, [dispatch, draftConfig]);

	const toggleResources = useCallback(
		(newState: boolean) => {
			updateDraft((draft) => ({
				...draft,
				frame: {
					...draft.frame,
					show: { ...draft.frame.show, resourceUtilization: newState },
				},
			}));
		},
		[updateDraft]
	);

	const setRedirectPath = useCallback(
		(redirectPath: string) => {
			updateDraft((draft) => ({ ...draft, auth: { ...draft.auth, redirectPath } }));
		},
		[updateDraft]
	);

	/**
	 * Profiles are saved right away by the main process: reload the store and merge them into the draft.
	 */
	const onProfilesChange = useCallback(async () => {
		const saved = await dispatch(reloadConfig()).unwrap();
		const known = (profileId: string | null) => (profileId && saved.auth.profiles.some((profile) => profile.id === profileId) ? profileId : null);
		updateDraft((draft) => ({
			...draft,
			auth: { ...draft.auth, profiles: saved.auth.profiles },
			endpoints: {
				...draft.endpoints,
				qbittorrent: { ...draft.endpoints.qbittorrent, authProfileId: known(draft.endpoints.qbittorrent.authProfileId) },
			},
			llmUsage: { ...draft.llmUsage, authProfileId: known(draft.llmUsage.authProfileId) },
		}));
		await refreshAuthStatuses();
	}, [dispatch, refreshAuthStatuses, updateDraft]);

	const setEndpointField = useCallback(
		(field: "homeAssistant" | "api", value: string) => {
			updateDraft((draft) => ({
				...draft,
				endpoints: { ...draft.endpoints, [field]: value },
			}));
		},
		[updateDraft]
	);

	const setScreenshareHub = useCallback(
		(value: string) => {
			updateDraft((draft) => ({
				...draft,
				endpoints: {
					...draft.endpoints,
					hubs: { ...draft.endpoints.hubs, screenshare: value },
				},
			}));
		},
		[updateDraft]
	);

	const setQbittorrentField = useCallback(
		<K extends keyof LatestConfig["endpoints"]["qbittorrent"]>(field: K, value: LatestConfig["endpoints"]["qbittorrent"][K]) => {
			updateDraft((draft) => ({
				...draft,
				endpoints: {
					...draft.endpoints,
					qbittorrent: { ...draft.endpoints.qbittorrent, [field]: value },
				},
			}));
		},
		[updateDraft]
	);

	const setLlmUsageField = useCallback(
		<K extends keyof LatestConfig["llmUsage"]>(field: K, value: LatestConfig["llmUsage"][K]) => {
			updateDraft((draft) => ({ ...draft, llmUsage: { ...draft.llmUsage, [field]: value } }));
		},
		[updateDraft]
	);

	const syncLlmUsage = useCallback(async () => {
		setIsSyncing(true);
		try {
			await saveConfig();
			const status = await window.preload.ipc.send.llmUsage.sync();
			setLlmUsageStatus(status);
			if (status.lastError) toast.error(status.lastError);
			else toast.success("LLM usage uploaded");
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setIsSyncing(false);
		}
	}, [saveConfig]);

	const saveAll = useCallback(async () => {
		try {
			await saveConfig();
			toast.success("Settings saved");
			close();
		} catch (error) {
			toast.error((error as Error).message);
		}
	}, [close, saveConfig]);

	if (!draftConfig?.frame || !draftConfig?.endpoints) return null;

	const isLlmUsageAuthenticated = authStatuses.some((status) => status.profileId === draftConfig.llmUsage.authProfileId && status.authenticated);

	return (
		<Dialog open={isOpen} onClose={close} maxWidth={"md"} fullWidth aria-labelledby="settings-dialog-title">
			<DialogContent className={"Settings"} sx={{ p: 0 }}>
				<Stack direction={"row"} className={"Settings__layout"}>
					<Box className={"Settings__sidebar"}>
						<Typography className={"Settings__sidebar-title"}>Settings</Typography>
						{sections.map((s) => (
							<Box
								key={s.key}
								className={`Settings__sidebar-item ${activeSection === s.key ? "Settings__sidebar-item--active" : ""}`}
								onClick={() => setActiveSection(s.key)}
							>
								{s.icon}
								<span>{s.label}</span>
								{s.key === "updates" && (updateStatus?.state === "available" || updateStatus?.state === "downloaded") && (
									<span className="Settings__sidebar-badge" />
								)}
							</Box>
						))}
					</Box>

					<Box className={"Settings__content"}>
						{activeSection === "endpoints" && (
							<SettingsSection title="Endpoints" description="Services of the home infrastructure used by the modules.">
								<SettingsCard>
									<SettingsField label="Home Assistant URL">
										<SettingsInput
											mono
											value={draftConfig.endpoints.homeAssistant}
											onChange={(e) => setEndpointField("homeAssistant", e.target.value)}
											placeholder="https://ha.example.com"
										/>
									</SettingsField>
									<SettingsGrid>
										<SettingsField label="API URL">
											<SettingsInput
												mono
												value={draftConfig.endpoints.api}
												onChange={(e) => setEndpointField("api", e.target.value)}
												placeholder="https://api.example.com"
											/>
										</SettingsField>
										<SettingsField label="Screenshare hub">
											<SettingsInput
												mono
												value={draftConfig.endpoints.hubs.screenshare}
												onChange={(e) => setScreenshareHub(e.target.value)}
												placeholder="https://api.example.com/ws/screenshare"
											/>
										</SettingsField>
									</SettingsGrid>
								</SettingsCard>
							</SettingsSection>
						)}

						{activeSection === "authentication" && (
							<AuthenticationSettings
								redirectPath={draftConfig.auth.redirectPath}
								onRedirectPathChange={setRedirectPath}
								profiles={draftConfig.auth.profiles}
								statuses={authStatuses}
								bindings={{ torrent: draftConfig.endpoints.qbittorrent.authProfileId, "llm-usage": draftConfig.llmUsage.authProfileId }}
								beforeLogin={saveConfig}
								onProfilesChange={onProfilesChange}
								refreshStatuses={refreshAuthStatuses}
							/>
						)}

						{activeSection === "torrent" && (
							<SettingsSection title="qBittorrent" description="Torrents found on Nyaa are sent to this instance.">
								<SettingsCard>
									<SettingsField label="API base URL" hint="Base URL of the qBittorrent Web API (/api/v2 is appended).">
										<SettingsInput
											mono
											value={draftConfig.endpoints.qbittorrent.apiBaseUrl}
											onChange={(e) => setQbittorrentField("apiBaseUrl", e.target.value)}
											placeholder="https://torrent.example.com"
										/>
									</SettingsField>
									<AuthProfilePicker
										profiles={draftConfig.auth.profiles}
										statuses={authStatuses}
										value={draftConfig.endpoints.qbittorrent.authProfileId}
										onChange={(profileId) => setQbittorrentField("authProfileId", profileId)}
										onManageProfiles={() => setActiveSection("authentication")}
									/>
								</SettingsCard>
							</SettingsSection>
						)}

						{activeSection === "llmUsage" && (
							<Stack spacing={2.5}>
								<SettingsSection
									title="LLM Usage Monitor"
									description="Claude Code and Codex token usage of this workstation, uploaded every 5 minutes (window closed included)."
								>
									<SettingsCard>
										<SettingsToggle
											title="Upload usage"
											description="Disabled: session logs are neither read nor sent."
											checked={draftConfig.llmUsage.enabled}
											onChange={(enabled) => setLlmUsageField("enabled", enabled)}
										/>
									</SettingsCard>
									<SettingsCard>
										<SettingsGrid>
											<SettingsField label="Monitor URL">
												<SettingsInput
													mono
													value={draftConfig.llmUsage.apiBaseUrl}
													onChange={(e) => setLlmUsageField("apiBaseUrl", e.target.value)}
													placeholder="https://monitor.example.com"
												/>
											</SettingsField>
											<SettingsField label="Workstation name" hint="Renaming keeps the history.">
												<SettingsInput value={draftConfig.llmUsage.machineName} onChange={(e) => setLlmUsageField("machineName", e.target.value)} />
											</SettingsField>
										</SettingsGrid>
										<AuthProfilePicker
											profiles={draftConfig.auth.profiles}
											statuses={authStatuses}
											value={draftConfig.llmUsage.authProfileId}
											onChange={(profileId) => setLlmUsageField("authProfileId", profileId)}
											onManageProfiles={() => setActiveSection("authentication")}
										/>
										<span className="Settings__hint">The account of the profile needs the llm-usage-monitor:admin role.</span>
									</SettingsCard>
								</SettingsSection>

								{llmUsageStatus && (
									<SettingsSection
										title="Sync"
										action={
											<Button size="small" variant="outlined" disabled={isSyncing || !isLlmUsageAuthenticated} onClick={() => void syncLlmUsage()}>
												{isSyncing ? "Uploading…" : "Upload now"}
											</Button>
										}
									>
										<Box className="Settings__stats">
											<SettingsStat
												label="Last upload"
												value={llmUsageStatus.lastSuccessAt ? new Date(llmUsageStatus.lastSuccessAt).toLocaleString() : "Never"}
											/>
											<SettingsStat label="Session logs followed" value={llmUsageStatus.trackedFiles} />
											<SettingsStat label="Hours waiting" value={llmUsageStatus.pendingHours} />
										</Box>
										{llmUsageStatus.lastError && <Box className="Settings__alert">{llmUsageStatus.lastError}</Box>}
									</SettingsSection>
								)}
							</Stack>
						)}

						{activeSection === "updates" && <UpdatesSettings status={updateStatus} />}

						{activeSection === "display" && (
							<SettingsSection title="Display">
								<SettingsCard>
									<SettingsToggle
										title="Resource utilization"
										description="CPU, memory and GPU load at the bottom of the window."
										checked={draftConfig.frame.show.resourceUtilization}
										onChange={toggleResources}
									/>
								</SettingsCard>
							</SettingsSection>
						)}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions sx={{ borderTop: "1px solid var(--border-subtle)", px: 2, py: 1.5 }}>
				<Stack
					direction="row"
					sx={{
						justifyContent: "space-between",
						alignItems: "center",
						width: "100%",
					}}
				>
					<Typography variant="caption" sx={{ color: "var(--text-faint)" }}>
						v{draftConfig.version}
					</Typography>
					<Stack direction="row" spacing={1}>
						<Button onClick={close} size="small">
							Cancel
						</Button>
						<Button variant="contained" size="small" onClick={() => void saveAll()}>
							Save
						</Button>
					</Stack>
				</Stack>
			</DialogActions>
		</Dialog>
	);
};

export default Settings;
