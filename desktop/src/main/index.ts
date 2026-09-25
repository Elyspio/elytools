import "reflect-metadata";
import { app, BrowserWindow, session } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { installExtension, REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS } from "@chrissantamaria/electron-devtools-installer";
import { registerIpcHandlers } from "@main/ipc/ipc.handler";
import { mainContainer } from "@main/di/container.di";
import { WindowModule } from "@main/modules/window/window.module";
import { UpdateModule } from "@main/modules/update.module";
import { RequestInterceptionModule } from "@main/modules/request/interception.request.module";
import { DeeplinkModule } from "@main/modules/deeplink.module";
import { MainContextModule } from "@main/modules/context/main.context.module";
import { TrayIconModule } from "@main/modules/trayicon.module";
import { LlmUsageModule } from "@main/modules/llm-usage/llm-usage.module";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
	app.quit();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
if (hasSingleInstanceLock) {
	void app.whenReady().then(async () => {
		// Set app user model id for windows
		electronApp.setAppUserModelId("fr.elyspio.elytools.app");

		const requestInterceptionModule = mainContainer.get(RequestInterceptionModule);
		session.defaultSession.webRequest.onHeadersReceived(requestInterceptionModule.bind("handleHeaderReceived"));

		registerIpcHandlers();

		const mainContextModule = mainContainer.get(MainContextModule);
		if (mainContextModule.allowDebug) {
			await installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
				.then(([redux, react]) => console.log(`Added Extensions:  ${redux.name}, ${react.name}`))
				.catch((err) => console.log("An error occurred: ", err));
		}

		// Default open or close DevTools by F12 in development
		// and ignore CommandOrControl + R in production.
		// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
		app.on("browser-window-created", (_, window) => {
			if (mainContextModule.autoOpenDevTools) {
				window.webContents.openDevTools({ mode: "detach" });
			}
		});

		const windowModule = mainContainer.get(WindowModule);
		mainContainer.get(DeeplinkModule).register();

		const mainWindow = await windowModule.createMainWindow();
		mainContainer.get(TrayIconModule).createTrayIcon(mainWindow);
		mainContainer.get(LlmUsageModule).start();

		mainWindow.on("show", () => {
			void mainContainer.get(UpdateModule).checkForUpdates();
		});

		app.on("activate", function () {
			// On macOS it's common to re-create a window in the app when the
			// dock icon is clicked and there are no other windows open.
			if (BrowserWindow.getAllWindows().length === 0) {
				void windowModule.createMainWindow();
			}
		});
	});
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
