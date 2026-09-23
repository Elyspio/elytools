import React, { HTMLAttributes } from "react";
import Button, { ButtonProps } from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useAppDispatch } from "@store";
import { selectFolderOrFiles } from "@modules/media/media.async.actions";
import { Stack } from "@mui/material";
import type { FileInfo } from "@shared/types/dialog.types";

type Props = Omit<HTMLAttributes<any>, "onChange"> & {
	showSelected?: boolean;
	color?: ButtonProps["color"];
	variant?: ButtonProps["variant"];
	fullWidth?: boolean;
} & SelectFile;

type SelectFile = {
	mode: "files";
	onChange: (item: FileInfo[]) => void;
};

export function SelectFolder(props: Props) {
	const dispatch = useAppDispatch();

	const [files, setFiles] = React.useState<FileInfo[]>([]);

	async function openDialog(e: React.MouseEvent) {
		e.stopPropagation();
		e.preventDefault();

		const selectedFiles = await dispatch(selectFolderOrFiles("files")).unwrap();

		if (!selectedFiles || !selectedFiles.files) {
			return;
		}

		setFiles(selectedFiles.files ?? []);

		props.onChange(selectedFiles.files);
	}

	return (
		<Stack
			direction={"column"}
			spacing={2}
			sx={{
				minWidth: 200,
			}}
		>
			<Button
				className={"header"}
				color={props.color ?? "primary"}
				fullWidth={props.fullWidth}
				onClick={(e) => {
					void openDialog(e);
				}}
				variant={props.variant ?? "outlined"}
			>
				Select files
			</Button>
			{props.showSelected ? (
				<Typography variant={"caption"} className={"files"} noWrap>
					{files.map((f) => f.name).join(", ")}
				</Typography>
			) : null}
		</Stack>
	);
}
