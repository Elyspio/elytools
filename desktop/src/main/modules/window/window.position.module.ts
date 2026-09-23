import { app, BrowserWindow, screen } from "electron";
import { LogModule } from "../log.module";
import { ConfigModule } from "../config/config.module";
import type { PositionWindowKey, WindowPosition } from "@shared/config/app.config";
import { log } from "../../utils/logs.utils";
import { inject, injectable } from "inversify";

@injectable()
export class WindowPositionModule extends LogModule {
	private default: WindowPosition = {};

	public constructor(@inject(ConfigModule) private readonly configModule: ConfigModule) {
		super("WindowPositionModule");
		app.on("ready", () => {
			const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
			this.default = {
				width: Math.round(display.workAreaSize.width * 0.8),
				height: Math.round(display.workAreaSize.height * 0.8),
			};
		});
	}

	/**
	 * Enregistre la position de la window
	 * @param window
	 */
	setByWindow(window: BrowserWindow) {
		return this.set("main", window.getBounds());
	}

	/**
	 * Enregistre la position d'une window
	 * @param key
	 * @param position
	 */
	async set(key: PositionWindowKey, position: WindowPosition) {
		const conf = await this.configModule.getConfig();

		await this.configModule.writeConfig({
			...conf,
			windows: {
				...conf.windows,
				position: {
					...conf.windows.position,
					[key]: position,
				},
			},
		});
	}

	/**
	 * Récupère la position d'une window
	 * @param key
	 */
	async get(key: PositionWindowKey): Promise<WindowPosition> {
		const conf = await this.configModule.getConfig();

		let position = conf.windows.position[key] ?? this.default;

		if (!this.isPositionInDisplay(position)) {
			this.logger.debug("Position de la fenêtre hors des écrans, on la replace sur l'écran principal");
			position = this.default!;
			await this.set(key, position);
		}

		return position;
	}

	/**
	 * Renvoie si une position fait partie du setup d'écran actuel
	 * @param position
	 */
	@log.debug()
	isPositionInDisplay(position: WindowPosition) {
		if (!position.x || !position.y) return false;

		const displays = screen.getAllDisplays();

		const minX = displays.reduce((acc, display) => {
			return Math.min(display.bounds.x, acc);
		}, 0);

		const maxX = displays.reduce((acc, display) => {
			return Math.max(display.bounds.x + display.workArea.width, acc);
		}, 0);

		const minY = displays.reduce((acc, display) => {
			return Math.min(display.bounds.y, acc);
		}, 0);

		const maxY = displays.reduce((acc, display) => {
			return Math.max(display.bounds.y + display.workArea.height, acc);
		}, 0);

		return position.x > minX && position.x < maxX && position.y > minY && position.y < maxY;
	}
}
