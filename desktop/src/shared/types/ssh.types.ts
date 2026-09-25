export type SshMachine = {
	id: string;
	name: string;
	host: string;
	port: number;
	user: string;
	publicKey: string;
	hasPassword: boolean;
	hasPrivateKey: boolean;
	folderId?: string | null;
};

export type SshMachineInput = {
	id?: string;
	name: string;
	host: string;
	port: number;
	user: string;
	publicKey: string;
	password?: string;
	privateKey?: string;
	clearPassword?: boolean;
	clearPrivateKey?: boolean;
	folderId?: string | null;
};

export type SshFolder = {
	id: string;
	name: string;
};

export type SshFolderInput = {
	id?: string;
	name: string;
};

export type SshConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type SshSession = {
	id: string;
	machineId: string;
	path: string;
	state: SshConnectionState;
	error?: string;
};

export type SshDirectoryEntry = {
	name: string;
	path: string;
	type: "file" | "directory" | "symlink";
	size: number;
	modifiedAt?: string;
};

export type SshDirectoryListing = {
	sessionId: string;
	machineId: string;
	path: string;
	entries: SshDirectoryEntry[];
};

export type SshTransferDirection = "upload" | "download";

export type SshTransferStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type SshTransfer = {
	id: string;
	machineId: string;
	sessionId: string;
	direction: SshTransferDirection;
	sourcePath: string;
	targetPath: string;
	status: SshTransferStatus;
	transferredBytes: number;
	totalBytes: number;
	error?: string;
};

export type SshCommandRunStatus = "running" | "completed" | "failed" | "cancelled";

export type SshRunTarget = {
	runTargetId: string;
	machineId: string;
	status: SshCommandRunStatus;
	exitCode?: number | null;
	error?: string;
};

export type SshCommandRun = {
	id: string;
	command: string;
	useSudo: boolean;
	startedAt: string;
	targets: SshRunTarget[];
};

export type SshCommandRequest = {
	command: string;
	machineIds: string[];
	useSudo: boolean;
};

export type SshConnectionStatusEvent = {
	machineId: string;
	state: SshConnectionState;
	error?: string;
};

export type SshTransferProgressEvent = {
	transferId: string;
	status: SshTransferStatus;
	transferredBytes: number;
	totalBytes: number;
	error?: string;
};

export type SshCommandChunkEvent = {
	runId: string;
	runTargetId: string;
	machineId: string;
	stream: "stdout" | "stderr";
	data: string;
	at: string;
};

export type SshCommandCompletedEvent = {
	runId: string;
	runTargetId: string;
	machineId: string;
	status: SshCommandRunStatus;
	exitCode: number | null;
	error?: string;
};
