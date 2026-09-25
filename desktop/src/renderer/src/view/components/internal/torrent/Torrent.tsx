import React, { useCallback, useMemo, useState } from "react";
import { Autocomplete, Box, Checkbox, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { toast } from "react-toastify";
import { NyaaTorrentItem } from "@shared/types/torrent.types";
import { store, useAppDispatch, useAppSelector } from "@store";
import { searchTorrents, sendTorrent, sendTorrentGroup } from "@modules/torrent/torrent.async.actions";
import { torrentActions } from "@modules/torrent/torrent.reducer";
import dayjs from "dayjs";
import { SearchOutlined } from "@mui/icons-material";
import type { GetTorrentGroupedResult } from "@modules/torrent/torrent.types";
import { useModal } from "@hooks/useModal";
import "./Torrent.scss";
import { TorrentRowAction } from "./cells/TorrentRowAction";
import { TorrentGroupAction } from "./cells/TorrentGroupAction";

const resolutions = ["720p", "1080p", "2160p", "4K", "8K"] as const;

type Resolution = (typeof resolutions)[number];

const CLEAR_DELAY = 3000;

export function Torrent() {
	const dispatch = useAppDispatch();
	const { query, results, loading, sendStatuses, parseEpisodeInfos } = useAppSelector((s) => s.torrent);

	const [forceVostfr, setForceVostfr] = useState(true);
	const [forceResolution, setForceResolution] = useState<Resolution>("1080p");

	const search = useCallback(
		(e?: React.SubmitEvent) => {
			e?.preventDefault();
			if (!query.trim()) return;

			let search = query.trim();

			if (forceVostfr) search += " vostfr";

			search += ` ${forceResolution}`;

			void dispatch(searchTorrents(search))
				.unwrap()
				.catch((error) => {
					toast.error(error instanceof Error ? error.message : "Failed to search nyaa.si");
				});
		},
		[dispatch, forceResolution, forceVostfr, query]
	);

	const clearNonDuplicateStatus = useCallback(
		(id: string) => {
			setTimeout(() => {
				const current = store.getState().torrent.sendStatuses[id];
				if (current && current !== "duplicate") {
					dispatch(torrentActions.clearSendStatus(id));
				}
			}, CLEAR_DELAY);
		},
		[dispatch]
	);

	const sendToQbittorrent = useCallback(
		(row: NyaaTorrentItem) => {
			if (!row.torrentUrl) return;
			void dispatch(sendTorrent(row))
				.unwrap()
				.finally(() => clearNonDuplicateStatus(row.id));
		},
		[clearNonDuplicateStatus, dispatch]
	);

	const sendGroupToQbittorrent = useCallback(
		(group: GetTorrentGroupedResult, e: React.MouseEvent) => {
			e.stopPropagation();
			void dispatch(sendTorrentGroup(group))
				.unwrap()
				.finally(() => {
					for (const item of group.data) {
						clearNonDuplicateStatus(item.id);
					}
				});
		},
		[clearNonDuplicateStatus, dispatch]
	);

	const [selectedGroup, setSelectedGroup] = useState<GetTorrentGroupedResult>();

	const modal = useModal(false);

	const onIconButtonClick = useCallback(
		(torrent: GetTorrentGroupedResult) => {
			modal.setOpen();
			setSelectedGroup(torrent);
		},
		[modal]
	);

	const closeModal = () => {
		modal.setClose();
		setTimeout(() => setSelectedGroup(undefined), 300);
	};

	const columns = useMemo<GridColDef<NyaaTorrentItem>[]>(
		() => [
			{
				field: "title",
				headerName: "Title",
				flex: 1,
			},
			{
				field: "seeders",
				headerName: "Seed",
				width: 60,
				align: "center",
				headerAlign: "center",
				cellClassName: (params) => {
					if (params.value === 0) return "Torrent__seed-none";
					if (params.value <= 5) return "Torrent__seed-low";
					return "Torrent__seed-ok";
				},
				sortComparator: (v1: number, v2: number) => v1 - v2,
			},
			{
				field: "size",
				headerName: "Size",
				headerAlign: "center",
				align: "right",
				width: 120,
				valueGetter: (_, row) => row.size,
			},
			{
				field: "date",
				headerName: "Date",
				width: 100,
				align: "center",
				headerAlign: "center",
				valueGetter: (_, row) => dayjs(row.date).format("YYYY-MM-DD"),
			},
			{
				field: "actions",
				headerName: "",
				width: 90,
				sortable: false,
				disableColumnMenu: true,
				renderCell: ({ row }) => <TorrentRowAction row={row} sendToQbittorrent={sendToQbittorrent} />,
			},
		],
		[sendToQbittorrent, sendStatuses]
	);

	const columnsGlobal = useMemo<GridColDef<GetTorrentGroupedResult>[]>(
		() => [
			{
				field: "template",
				headerName: "Title",
				flex: 1,
			},
			{
				field: "min",
				headerName: "Min",
				width: 80,
				headerAlign: "center",
				align: "center",
			},
			{
				field: "max",
				headerName: "Max",
				headerAlign: "center",
				align: "center",
				width: 80,
			},
			{
				field: "count",
				headerName: "Count",
				headerAlign: "center",
				align: "center",
				width: 70,
				valueGetter: (_, row) => row.data.length,
			},
			{
				field: "actions",
				headerName: "",
				width: 80,
				sortable: false,
				disableColumnMenu: true,
				renderCell: ({ row }) => <TorrentGroupAction row={row} onClick={sendGroupToQbittorrent} onIconButtonClick={onIconButtonClick} />,
			},
		],
		[onIconButtonClick, sendGroupToQbittorrent, sendStatuses]
	);

	const torrents = useMemo(() => [...results].sort((a, b) => a.template.localeCompare(b.template)), [results]);

	return (
		<Stack className={"Torrent"}>
			<Box className={"Torrent__search"}>
				<form onSubmit={search}>
					<Stack spacing={1}>
						<Stack
							direction={"row"}
							spacing={1.5}
							sx={{
								alignItems: "flex-end",
							}}
						>
							<TextField
								value={query}
								onChange={(e) => dispatch(torrentActions.setQuery(e.target.value))}
								label="Search nyaa.si"
								size="small"
								fullWidth
								placeholder="e.g. Some Anime 1080p"
							/>

							<Autocomplete
								renderInput={(params) => <TextField {...params} size={"small"} label={"Resolution"} />}
								options={resolutions}
								value={forceResolution}
								sx={{ width: 140, flexShrink: 0 }}
								disableClearable
								onChange={(_, v) => setForceResolution(v)}
							/>

							<IconButton color={"primary"} disabled={loading || !query.trim()} type={"submit"} sx={{ flexShrink: 0 }}>
								<SearchOutlined />
							</IconButton>
						</Stack>

						<Stack
							direction={"row"}
							spacing={1}
							sx={{
								alignItems: "center",
							}}
						>
							<FormControlLabel
								control={<Checkbox size={"small"} checked={forceVostfr} />}
								checked={forceVostfr}
								onChange={(_, v) => setForceVostfr(v)}
								label="vostfr"
								slotProps={{ typography: { sx: { fontSize: "0.8125rem" } } }}
							/>
							<FormControlLabel
								control={<Checkbox size={"small"} checked={parseEpisodeInfos} />}
								checked={parseEpisodeInfos}
								onChange={(_, v) => dispatch(torrentActions.setParseEpisodeInfos(v))}
								label="Group by episode"
								slotProps={{ typography: { sx: { fontSize: "0.8125rem" } } }}
							/>
						</Stack>
					</Stack>
				</form>
			</Box>
			{torrents.length > 0 ? (
				<Box className={"Torrent__results"}>
					<DataGrid
						columns={columnsGlobal}
						onRowClick={(params) => onIconButtonClick(params.row as GetTorrentGroupedResult)}
						rows={torrents}
						getRowId={(row) => row.template}
						hideFooter
						loading={loading}
						disableRowSelectionOnClick
						sx={{ cursor: "pointer" }}
					/>
				</Box>
			) : (
				!loading && (
					<Box className={"Torrent__empty"}>
						<SearchOutlined sx={{ fontSize: 40, color: "var(--text-faint)" }} />
						<Typography sx={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Search for anime on nyaa.si</Typography>
					</Box>
				)
			)}
			{torrents.length > 0 && (
				<Box className={"Torrent__status"}>
					<Typography variant="caption" sx={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>
						{torrents.length} result{torrents.length !== 1 ? "s" : ""}
					</Typography>
				</Box>
			)}
			<Dialog open={modal.open} onClose={closeModal} keepMounted fullWidth maxWidth={"md"}>
				<DialogTitle sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{selectedGroup?.template}</DialogTitle>
				<DialogContent sx={{ p: 0 }}>
					<Box sx={{ height: 400 }}>
						<DataGrid rows={selectedGroup?.data ?? []} columns={columns} loading={loading} getRowId={(row) => row.id} disableRowSelectionOnClick hideFooter />
					</Box>
				</DialogContent>
			</Dialog>
		</Stack>
	);
}
