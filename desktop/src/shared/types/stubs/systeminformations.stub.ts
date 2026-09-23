export interface StubOsData {
	platform: string;
	distro: string;
	release: string;
	codename: string;
	kernel: string;
	arch: string;
	hostname: string;
	fqdn: string;
	codepage: string;
	logofile: string;
	serial: string;
	build: string;
	servicepack: string;
	uefi: boolean | null;
	hypervizor?: boolean;
	remoteSession?: boolean;
}

export interface StubSystemData {
	manufacturer: string;
	model: string;
	version: string;
	serial: string;
	uuid: string;
	sku: string;
	virtual: boolean;
	virtualHost?: string;
	raspberry?: {
		manufacturer: string;
		processor: string;
		type: string;
		revision: string;
	};
}
