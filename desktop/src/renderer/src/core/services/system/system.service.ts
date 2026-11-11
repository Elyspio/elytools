import { NvidiaSmi } from "./types/nvidia";
import { injectable } from "inversify";
import { XMLParser } from "fast-xml-parser";

@injectable()
export class SystemService {
	private readonly xmlParser = new XMLParser();

	public async cpuLoad(): Promise<number> {
		const data = await window.preload.ipc.send.system.getInformation("currentLoad");
		return data.currentLoad;
	}

	public async memoryUsed(): Promise<{ total: number; current: number }> {
		const data = await window.preload.ipc.send.system.getInformation("mem");
		return {
			total: data.total / 1e9,
			current: data.used / 1e9,
		};
	}

	public async gpuLoad(): Promise<{
		encode: number;
		decode: number;
		overall: number;
		memory: number;
	}> {
		const xml = await window.preload.ipc.send.system.queryGpu();
		if (xml === null) throw new Error("nvidia-smi is not available");
		const data: NvidiaSmi = this.xmlParser.parse(xml) as NvidiaSmi;
		const use = data.nvidia_smi_log.gpu.utilization;

		const parse = (number: string) => Number.parseFloat(number.slice(0, -1));

		return {
			decode: parse(use.decoder_util),
			encode: parse(use.encoder_util),
			overall: parse(use.gpu_util),
			memory: parse(use.memory_util),
		};
	}

	public async isAppStarted(name: string) {
		const apps = await window.preload.ipc.send.system.getInformation("processes");
		return apps.list.some((app) => app.name.includes(name));
	}
}
