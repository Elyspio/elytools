import { store } from "@store";
import { Provider } from "react-redux";
import { theme } from "@/config/theme";
import { Outlet } from "react-router";
import { ToastContainer } from "react-toastify";
import { StyledEngineProvider, ThemeProvider } from "@mui/material";
import { Frame } from "@components/frame/Frame";

export function Root() {
	return (
		<StyledEngineProvider injectFirst>
			<ThemeProvider theme={theme}>
				<Provider store={store}>
					<Frame>
						<Outlet />
					</Frame>
					<ToastContainer theme={"dark"} position={"top-right"} className={"no-autoresize"} />
				</Provider>
			</ThemeProvider>
		</StyledEngineProvider>
	);
}
