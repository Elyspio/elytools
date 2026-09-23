import { useState } from "react";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { SshFolder } from "@shared/types/ssh.types";

export type MachineFormState = {
	id?: string;
	name: string;
	host: string;
	port: number;
	user: string;
	publicKey: string;
	password: string;
	privateKey: string;
	folderValue: SshFolder | string | null;
};

type Props = {
	open: boolean;
	form: MachineFormState;
	folders: SshFolder[];
	onClose: () => void;
	onSubmit: () => void;
	onChange: (update: Partial<MachineFormState>) => void;
	onImportKey: (target: "publicKey" | "privateKey") => void;
};

export function SshMachineDialog({ open, form, folders, onClose, onSubmit, onChange, onImportKey }: Props) {
	const [showPassword, setShowPassword] = useState(false);

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth={"sm"}>
			<DialogTitle>{form.id ? "Edit machine" : "New machine"}</DialogTitle>
			<DialogContent>
				<Stack
					spacing={1.5}
					sx={{
						mt: 0.5,
					}}
				>
					<TextField label="Name" size="small" value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
					<Autocomplete<SshFolder, false, false, true>
						freeSolo
						options={folders}
						getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
						isOptionEqualToValue={(option, value) => (typeof value === "string" ? option.name === value : option.id === value.id)}
						value={form.folderValue}
						onChange={(_, newValue) => onChange({ folderValue: newValue })}
						renderInput={(params) => <TextField {...params} label="Folder" size="small" helperText="Select an existing folder or type a name to create one" />}
					/>
					<Stack direction={"row"} spacing={1.5}>
						<TextField label="Host" size="small" fullWidth value={form.host} onChange={(e) => onChange({ host: e.target.value })} />
						<TextField
							label="Port"
							size="small"
							type="number"
							value={form.port}
							onChange={(e) => onChange({ port: Number(e.target.value) || 22 })}
							sx={{ width: 110 }}
						/>
					</Stack>
					<TextField label="User" size="small" value={form.user} onChange={(e) => onChange({ user: e.target.value })} />
					<TextField label="Public key" size="small" multiline minRows={2} value={form.publicKey} onChange={(e) => onChange({ publicKey: e.target.value })} />
					<Stack spacing={0.75}>
						<Stack
							direction={"row"}
							sx={{
								justifyContent: "space-between",
								alignItems: "center",
							}}
						>
							<Typography variant="caption" sx={{ color: "text.secondary" }}>
								Public key file
							</Typography>
							<Button size="small" onClick={() => onImportKey("publicKey")}>
								Import file
							</Button>
						</Stack>
						<Typography variant="caption" sx={{ color: "text.secondary" }}>
							Paste the public key or import it from a `.pub` file.
						</Typography>
					</Stack>
					<TextField
						label="Password"
						type={showPassword ? "text" : "password"}
						size="small"
						value={form.password}
						helperText={form.id ? "Leave empty to clear the stored password" : "Optional. Used for password auth and sudo."}
						onChange={(e) => onChange({ password: e.target.value })}
						slotProps={{
							input: {
								endAdornment: (
									<InputAdornment position="end">
										<IconButton size="small" onClick={() => setShowPassword((p) => !p)} edge="end">
											{showPassword ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
										</IconButton>
									</InputAdornment>
								),
							},
						}}
					/>
					<Stack spacing={0.75}>
						<Stack
							direction={"row"}
							sx={{
								justifyContent: "space-between",
								alignItems: "center",
							}}
						>
							<Typography variant="caption" sx={{ color: "text.secondary" }}>
								Private key
							</Typography>
							<Button size="small" onClick={() => onImportKey("privateKey")}>
								Import file
							</Button>
						</Stack>
						<TextField
							size="small"
							multiline
							minRows={4}
							value={form.privateKey}
							helperText={form.id ? "Leave empty to clear the stored private key" : "Optional OpenSSH private key."}
							onChange={(e) => onChange({ privateKey: e.target.value })}
						/>
					</Stack>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button variant="contained" onClick={onSubmit}>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	);
}
