import React, { ReactNode } from "react";
import { Menu, PopoverPosition, Stack } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";

function extract<T>(init?: T) {
	// eslint-disable-next-line react-hooks/rules-of-hooks
	const [get, set] = React.useState<T>(init as T);
	return {
		value: get,
		set,
	};
}

type ContextMenuWrapperProps = {
	children: ReactNode;
	items: {
		label: string;
		show?: <T>(param: { close: () => void } & T) => ReactNode;
		action?: () => void;
	}[];
};

export function ContextMenuWrapper(config: Readonly<ContextMenuWrapperProps>) {
	const [pos, setPos] = React.useState<PopoverPosition>();
	const modal = {
		open: extract<boolean>(false),
		component: extract<ContextMenuWrapperProps["items"][number]["show"]>(),
	};

	const items = config.items.map((item) => {
		const onClicks: (() => void)[] = [];

		if (item.action) {
			onClicks.push(item.action);
		}

		if (item.show) {
			onClicks.push(() => {
				modal.component.set(item.show);
				modal.open.set(true);
			});
		}

		onClicks.push(() => setPos(undefined));

		return (
			<MenuItem key={item.label} onClick={() => onClicks.forEach((f) => f())}>
				{item.label}
			</MenuItem>
		);
	});

	const handleClose = () => {
		modal.open.set(false);
	};

	const onContextMenu = (e: React.MouseEvent<HTMLElement, MouseEvent>) => {
		setPos({
			left: e.clientX,
			top: e.clientY,
		});
	};

	return (
		<Stack
			onContextMenu={onContextMenu}
			sx={{
				height: "100%",
				width: "100%",
			}}
		>
			{config.children}
			<Menu anchorReference="anchorPosition" anchorPosition={pos} keepMounted open={Boolean(pos?.left)} onClose={() => setPos(undefined)}>
				{items}
			</Menu>
			<Dialog open={modal.open.value}>{modal.component.value?.({ close: handleClose })}</Dialog>
		</Stack>
	);
}
