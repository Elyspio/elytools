import { Box, InputBase, type InputBaseProps, Stack, Typography } from "@mui/material";
import React from "react";
import "./SettingsControls.scss";

type SettingsSectionProps = {
	title: string;
	description?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
};

/**
 * Titled block of a Settings panel
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, description, action, children }) => (
	<Stack spacing={1.25}>
		<Stack direction="row" sx={{ alignItems: "center" }}>
			<Box sx={{ flex: 1 }}>
				<Typography className={"Settings__section-title"}>{title}</Typography>
				{description && <div className="Settings__section-description">{description}</div>}
			</Box>
			{action}
		</Stack>
		{children}
	</Stack>
);

/**
 * Two columns of fields, a field with `wide` spans both
 */
export const SettingsGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => <Box className="Settings__grid">{children}</Box>;

type SettingsFieldProps = {
	label: string;
	hint?: React.ReactNode;
	wide?: boolean;
	children: React.ReactNode;
};

export const SettingsField: React.FC<SettingsFieldProps> = ({ label, hint, wide, children }) => (
	<label className={`Settings__field ${wide ? "Settings__field--wide" : ""}`}>
		<span className="Settings__label">{label}</span>
		{children}
		{hint && <span className="Settings__hint">{hint}</span>}
	</label>
);

export const SettingsInput: React.FC<InputBaseProps & { mono?: boolean }> = ({ mono, className, ...props }) => (
	<InputBase {...props} className={`Settings__input ${mono ? "Settings__input--mono" : ""} ${className ?? ""}`} />
);

type SettingsStatProps = {
	label: string;
	value: React.ReactNode;
};

export const SettingsStat: React.FC<SettingsStatProps> = ({ label, value }) => (
	<Box className="Settings__stat">
		<span className="Settings__label">{label}</span>
		<span className="Settings__stat-value">{value}</span>
	</Box>
);
