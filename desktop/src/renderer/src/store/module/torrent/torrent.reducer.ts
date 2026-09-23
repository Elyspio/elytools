import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SendStatus, TorrentState } from "./torrent.types";
import { searchTorrents, sendTorrent } from "./torrent.async.actions";

const defaultState: TorrentState = {
	query: "",
	results: [],
	loading: false,
	sendStatuses: {},
	parseEpisodeInfos: true,
};

const slice = createSlice({
	name: "torrent",
	initialState: defaultState,
	reducers: {
		setQuery(state, action: PayloadAction<string>) {
			state.query = action.payload;
		},
		setParseEpisodeInfos(state, action: PayloadAction<boolean>) {
			state.parseEpisodeInfos = action.payload;
		},
		setSendStatus(state, action: PayloadAction<{ id: string; status: SendStatus }>) {
			state.sendStatuses[action.payload.id] = action.payload.status;
		},
		clearSendStatus(state, action: PayloadAction<string>) {
			delete state.sendStatuses[action.payload];
		},
	},
	extraReducers: ({ addCase }) => {
		addCase(searchTorrents.pending, (state) => {
			state.loading = true;
			state.sendStatuses = {};
		});
		addCase(searchTorrents.fulfilled, (state, action) => {
			state.loading = false;
			state.results = action.payload;
		});
		addCase(searchTorrents.rejected, (state) => {
			state.loading = false;
		});

		addCase(sendTorrent.pending, (state, action) => {
			state.sendStatuses[action.meta.arg.id] = "sending";
		});
		addCase(sendTorrent.fulfilled, (state, action) => {
			state.sendStatuses[action.payload.id] = action.payload.duplicate ? "duplicate" : "success";
		});
		addCase(sendTorrent.rejected, (state, action) => {
			state.sendStatuses[action.meta.arg.id] = "error";
		});
	},
});

export const { reducer: torrentReducer, actions: torrentActions } = slice;
