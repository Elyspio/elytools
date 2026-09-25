import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from "@mui/material";

type FolderFormState = { id?: string; name: string };

type Props = {
	open: boolean;
	form: FolderFormState;
	onClose: () => void;
	onSubmit: () => void;
	onChange: (name: string) => void;
};

export function SshFolderDialog({ open, form, onClose, onSubmit, onChange }: Props) {
	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth={"xs"}>
			<DialogTitle>{form.id ? "Edit folder" : "New folder"}</DialogTitle>
			<DialogContent>
				<Stack
					spacing={1.5}
					sx={{
						mt: 0.5,
					}}
				>
					<TextField label="Folder name" size="small" value={form.name} onChange={(event) => onChange(event.target.value)} />
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
