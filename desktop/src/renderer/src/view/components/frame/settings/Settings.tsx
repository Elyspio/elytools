import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, FormControlLabel, FormGroup, Stack, Switch, TextField, Typography } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./Settings.scss";
import { resetDimensions, setConfig } from "@modules/configuration/configuration.async.actions";
import { useAppDispatch, useAppSelector } from "@store";
import { AppBoardShow, FrameConfiguration, LatestConfig } from "@shared/config/app.config";
import { toast } from "react-toastify";
import LanguageIcon from "@mui/icons-material/Language";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import TuneIcon from "@mui/icons-material/Tune";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InsightsIcon from "@mui/icons-material/Insights";
import type { LlmUsageStatus } from "@shared/types/llm-usage.types";

type Section = "endpoints" | "torrent" | "llmUsage" | "display" | "appboard";

const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
	{ key: "endpoints", label: "Endpoints", icon: <LanguageIcon sx={{ fontSize: 16 }} /> },
	{ key: "torrent", label: "Torrent & Auth", icon: <CloudDownloadIcon sx={{ fontSize: 16 }} /> },
	{ key: "llmUsage", label: "LLM usage", icon: <InsightsIcon sx={{ fontSize: 16 }} /> },
	{ key: "display", label: "Display", icon: <TuneIcon sx={{ fontSize: 16 }} /> },
	{ key: "appboard", label: "Appboard", icon: <DashboardIcon sx={{ fontSize: 16 }} /> },
];

type OwnProps = {
	isOpen: boolean;
	close: () => void;
};

export const Settings: React.FC<OwnProps> = ({ close, isOpen }) => {
	const config = useAppSelector((state) => state.config.current);
	const dispatch = useAppDispatch();
	const [draftConfig, setDraftConfig] = useState<LatestConfig | null>(null);
	const [authStatus, setAuthStatus] = useState({
		configured: false,
		authenticated: false,
		hasRefreshToken: false,
	});
	const [isAuthenticating, setIsAuthenticating] = useState(false);
	const [activeSection, setActiveSection] = useState<Section>("endpoints");
	const [llmUsageStatus, setLlmUsageStatus] = useState<LlmUsageStatus | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);

	const appboardOptions = useMemo(() => [AppBoardShow.external, AppBoardShow.internal, AppBoardShow.hidden], []);

	const refreshAuthStatus = useCallback(async () => {
		setAuthStatus(await window.preload.ipc.send.auth.oidc.status());
	}, []);

	useEffect(() => {
		if (!isOpen) return;
		void window.preload.ipc.send.auth.oidc.status().then(setAuthStatus);
		void window.preload.ipc.send.llmUsage.status().then(setLlmUsageStatus);
	}, [isOpen]);

	// Sync the draft from the store while the dialog is open (adjusting state during render instead of in an effect)
	const [draftSyncedFrom, setDraftSyncedFrom] = useState<{ config: typeof config; isOpen: boolean } | null>(null);
	if (draftSyncedFrom === null || draftSyncedFrom.config !== config || draftSyncedFrom.isOpen !== isOpen) {
		setDraftSyncedFrom({ config, isOpen });
		if (isOpen && config?.frame && config?.endpoints) setDraftConfig(config);
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

	const toggleResize = useCallback(
		(dimension: keyof FrameConfiguration["resize"], state: boolean) => {
			updateDraft((draft) => ({
				...draft,
				frame: {
					...draft.frame,
					resize: { ...draft.frame.resize, [dimension]: state },
				},
			}));
		},
		[updateDraft]
	);

	const setOidcField = useCallback(
		(field: "issuerUrl" | "clientId" | "clientSecret" | "scopes" | "redirectPath", value: string) => {
			updateDraft((draft) => ({
				...draft,
				endpoints: {
					...draft.endpoints,
					oidc: { ...draft.endpoints.oidc, [field]: value },
				},
			}));
		},
		[updateDraft]
	);

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

	const setQbittorrentApiBaseUrl = useCallback(
		(apiBaseUrl: string) => {
			updateDraft((draft) => ({
				...draft,
				endpoints: {
					...draft.endpoints,
					qbittorrent: { ...draft.endpoints.qbittorrent, apiBaseUrl },
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

	const toggleAppboard = useCallback(
		(value: AppBoardShow, checked: boolean) => {
			updateDraft((draft) => {
				const show = draft.appboard.show;
				const next = checked ? Array.from(new Set([...show, value])) : show.filter((entry) => entry !== value);
				return { ...draft, appboard: { ...draft.appboard, show: next } };
			});
		},
		[updateDraft]
	);

	const login = useCallback(async () => {
		setIsAuthenticating(true);
		try {
			await saveConfig();
			await window.preload.ipc.send.auth.oidc.startLogin();
			await refreshAuthStatus();
			toast.success("Authenticated successfully");
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setIsAuthenticating(false);
		}
	}, [refreshAuthStatus, saveConfig]);

	const cancelLogin = useCallback(() => {
		window.preload.ipc.send.auth.oidc.cancelLogin();
	}, []);

	const logout = useCallback(async () => {
		await window.preload.ipc.send.auth.oidc.logout();
		await refreshAuthStatus();
	}, [refreshAuthStatus]);

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
							</Box>
						))}
					</Box>

					<Box className={"Settings__content"}>
						{activeSection === "endpoints" && (
							<Stack spacing={2}>
								<Typography className={"Settings__section-title"}>General Endpoints</Typography>
								<Box className={"Settings__field-group"}>
									<TextField
										label="Home Assistant URL"
										value={draftConfig.endpoints.homeAssistant}
										onChange={(e) => setEndpointField("homeAssistant", e.target.value)}
										size="small"
										fullWidth
									/>
									<TextField label="API URL" value={draftConfig.endpoints.api} onChange={(e) => setEndpointField("api", e.target.value)} size="small" fullWidth />
									<TextField
										label="Screenshare hub"
										value={draftConfig.endpoints.hubs.screenshare}
										onChange={(e) => setScreenshareHub(e.target.value)}
										size="small"
										fullWidth
									/>
								</Box>
							</Stack>
						)}

						{activeSection === "torrent" && (
							<Stack spacing={2}>
								<Typography className={"Settings__section-title"}>Torrent & Authentication</Typography>
								<Box className={"Settings__field-group"}>
									<TextField
										label="qBittorrent API base URL"
										value={draftConfig.endpoints.qbittorrent.apiBaseUrl}
										onChange={(e) => setQbittorrentApiBaseUrl(e.target.value)}
										size="small"
										fullWidth
									/>
								</Box>

								<Typography className={"Settings__section-title"}>OIDC Configuration</Typography>
								<Box className={"Settings__field-group"}>
									<TextField
										label="Issuer URL"
										value={draftConfig.endpoints.oidc.issuerUrl}
										onChange={(e) => setOidcField("issuerUrl", e.target.value)}
										size="small"
										fullWidth
									/>
									<TextField
										label="Client ID"
										value={draftConfig.endpoints.oidc.clientId}
										onChange={(e) => setOidcField("clientId", e.target.value)}
										size="small"
										fullWidth
									/>
									<TextField
										label="Client Secret"
										value={draftConfig.endpoints.oidc.clientSecret}
										onChange={(e) => setOidcField("clientSecret", e.target.value)}
										size="small"
										fullWidth
										type="password"
										helperText="Leave empty for public clients (PKCE only)"
									/>
									<TextField
										label="Scopes"
										value={draftConfig.endpoints.oidc.scopes}
										onChange={(e) => setOidcField("scopes", e.target.value)}
										size="small"
										fullWidth
									/>
									<TextField
										label="Redirect path"
										value={draftConfig.endpoints.oidc.redirectPath}
										onChange={(e) => setOidcField("redirectPath", e.target.value)}
										size="small"
										fullWidth
										helperText={`Final redirect URI: elytools://${draftConfig.endpoints.oidc.redirectPath.replace(/^\//, "")}`}
									/>
								</Box>

								<Box className={"Settings__field-group"}>
									<Stack
										direction="row"
										spacing={1}
										sx={{
											alignItems: "center",
										}}
									>
										{!authStatus.authenticated ? (
											<Button size="small" variant="outlined" color="secondary" disabled={isAuthenticating} onClick={() => void login()}>
												Login
											</Button>
										) : (
											<Button size="small" variant="outlined" color="secondary" onClick={() => void logout()}>
												Logout
											</Button>
										)}
										{isAuthenticating && (
											<Button size="small" variant="outlined" color="error" onClick={cancelLogin}>
												Cancel
											</Button>
										)}
										<Typography variant="caption" sx={{ color: authStatus.authenticated ? "#00FF88" : "var(--text-muted)" }}>
											{isAuthenticating ? "Waiting for browser..." : authStatus.authenticated ? "Authenticated" : "Not authenticated"}
										</Typography>
									</Stack>
								</Box>
							</Stack>
						)}

						{activeSection === "llmUsage" && (
							<Stack spacing={2}>
								<Typography className={"Settings__section-title"}>LLM Usage Monitor</Typography>
								<Box className={"Settings__field-group"}>
									<FormControlLabel
										control={<Switch checked={draftConfig.llmUsage.enabled} onChange={(e) => setLlmUsageField("enabled", e.target.checked)} />}
										label="Upload the Claude Code and Codex usage of this workstation"
									/>
									<TextField
										label="LLM Usage Monitor URL"
										value={draftConfig.llmUsage.apiBaseUrl}
										onChange={(e) => setLlmUsageField("apiBaseUrl", e.target.value)}
										size="small"
										fullWidth
									/>
									<TextField
										label="Workstation name"
										value={draftConfig.llmUsage.machineName}
										onChange={(e) => setLlmUsageField("machineName", e.target.value)}
										size="small"
										fullWidth
										helperText="Shown in the workstation filter of the Usage page; renaming keeps the history."
									/>
									<Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
										Uses the OIDC sign-in of « Torrent & Auth »: the account needs the llm-usage-monitor:admin role. Uploads every 5 minutes, window closed
										included.
									</Typography>
								</Box>

								{llmUsageStatus && (
									<Box className={"Settings__field-group"}>
										<Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
											Last upload: {llmUsageStatus.lastSuccessAt ? new Date(llmUsageStatus.lastSuccessAt).toLocaleString() : "never"} ·{" "}
											{llmUsageStatus.trackedFiles} session logs followed · {llmUsageStatus.pendingHours} hours waiting
										</Typography>
										{llmUsageStatus.lastError && (
											<Typography variant="caption" sx={{ color: "error.main" }}>
												{llmUsageStatus.lastError}
											</Typography>
										)}
										<Button
											size="small"
											variant="outlined"
											color="secondary"
											disabled={isSyncing || !authStatus.authenticated}
											onClick={() => void syncLlmUsage()}
											sx={{ alignSelf: "flex-start" }}
										>
											{isSyncing ? "Uploading..." : "Upload now"}
										</Button>
									</Box>
								)}
							</Stack>
						)}

						{activeSection === "display" && (
							<Stack spacing={2}>
								<Typography className={"Settings__section-title"}>Frame</Typography>
								<Box className={"Settings__field-group"}>
									<FormGroup>
										<FormControlLabel
											control={<Switch checked={draftConfig.frame.show.resourceUtilization} onChange={(e) => toggleResources(e.target.checked)} />}
											label="Show resource utilization"
										/>
										<FormControlLabel
											control={<Switch checked={draftConfig.frame.resize.width} onChange={(e) => toggleResize("width", e.target.checked)} />}
											label="Allow width resize"
										/>
										<FormControlLabel
											control={<Switch checked={draftConfig.frame.resize.height} onChange={(e) => toggleResize("height", e.target.checked)} />}
											label="Allow height resize"
										/>
									</FormGroup>
									<Button variant="outlined" size="small" onClick={() => void dispatch(resetDimensions())} sx={{ alignSelf: "flex-start" }}>
										Auto-fit dimensions
									</Button>
								</Box>
							</Stack>
						)}

						{activeSection === "appboard" && (
							<Stack spacing={2}>
								<Typography className={"Settings__section-title"}>Module Visibility</Typography>
								<Box className={"Settings__field-group"}>
									<FormGroup>
										{appboardOptions.map((option) => (
											<FormControlLabel
												key={option}
												control={
													<Checkbox checked={draftConfig.appboard.show.includes(option)} onChange={(e) => toggleAppboard(option, e.target.checked)} />
												}
												label={option}
											/>
										))}
									</FormGroup>
								</Box>
							</Stack>
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
