import { LogModule } from "../log.module";
import { injectable } from "inversify";

const headersToDelete = ["Access-Control-Allow-Origin", "X-Frame-Options", "Content-Security-Policy"];

@injectable()
export class RequestInterceptionModule extends LogModule {
	public constructor() {
		super("RequestInterceptionModule");
	}

	public bind<K extends keyof Pick<RequestInterceptionModule, "handleHeaderReceived">>(method: K): RequestInterceptionModule[K] {
		return this[method].bind(this);
	}

	public handleHeaderReceived(details: Electron.OnHeadersReceivedListenerDetails, callback: (headersReceivedResponse: Electron.HeadersReceivedResponse) => void) {
		const responseHeaders = { ...details.responseHeaders };
		const headers = Object.keys(responseHeaders);

		// On ne conserve que les headers qui ne sont pas dans la liste des headers à supprimer
		const headersFiltered = headers.reduce((acc, header) => {
			const headerLower = header.toLowerCase();
			if (headersToDelete.every((h) => h.toLowerCase() !== headerLower)) {
				acc[header] = responseHeaders[header];
			}
			return acc;
		}, {});

		// Ajout du header origin en fonction de l'url demandée

		const webContent = details.webContents;
		const url = webContent?.getURL();

		if (url) {
			headersFiltered["Access-Control-Allow-Origin"] = [new URL(url).origin];
			headersFiltered["Access-Control-Expose-Headers"] = [headers.join(",")];
		}

		callback({
			responseHeaders: {
				...headersFiltered,
			},
		});
	}
}
