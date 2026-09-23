import { dialog, shell } from "electron";
import { type Dirent, promises as fsPromises, type RmDirOptions } from "node:fs";
import { LogModule } from "./log.module";
import { log } from "../utils/logs.utils";
import { injectable } from "inversify";
import type {
  FileInfo,
  GetFolderOptions,
  GetFolderResult,
  SelectPathsOptions,
} from "@shared/types/dialog.types";
import path from "node:path";
import os from "os";
import { execFile } from "node:child_process";

@injectable()
export class FileModule extends LogModule {
  /**
   * Since Electron 43, open dialogs default to the Downloads folder when no `defaultPath` is given
   * and the OS no longer restores the last-used directory, so it is tracked here instead.
   */
  private lastDialogPath: string | undefined;

  constructor() {
    super("FileModule");
  }

  @log.debug()
  public async getFolder<WithFiles = true>({
    returnFiles,
  }: GetFolderOptions<WithFiles>): Promise<GetFolderResult<WithFiles>> {
    const { filePaths } = await dialog.showOpenDialog({
      defaultPath: this.lastDialogPath,
      properties: ["openDirectory"],
    });
    const folderPath = filePaths.at(0);

    if (!folderPath) return null;

    this.lastDialogPath = path.dirname(folderPath);

    let files: Dirent[] | undefined;

    if (returnFiles) {
      files = await fsPromises.readdir(folderPath, { withFileTypes: true });
    }

    const filesInfo = await Promise.all(
      (files ?? []).map(async (dirent): Promise<FileInfo> => {
        const filePath = path.resolve(dirent.parentPath, dirent.name);
        const stats = await fsPromises.lstat(filePath);

        return {
          name: dirent.name,
          type: stats.isDirectory() ? "directory" : "file",
          path: filePath,
          size: stats.size,
        };
      }),
    );

    return {
      folderPath,
      files: filesInfo,
    } as unknown as GetFolderResult<WithFiles>;
  }

  @log.debug()
  public async selectPaths(options: SelectPathsOptions = {}): Promise<string[] | null> {
    const properties: NonNullable<Electron.OpenDialogOptions["properties"]> = [];

    if (options.allowFiles !== false) {
      properties.push("openFile");
    }

    if (options.allowDirectories !== false) {
      properties.push("openDirectory");
    }

    if (options.multiSelections !== false) {
      properties.push("multiSelections");
    }

    const { filePaths, canceled } = await dialog.showOpenDialog({
      defaultPath: this.lastDialogPath,
      properties,
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    this.lastDialogPath = path.dirname(filePaths[0]);

    return filePaths;
  }

  @log.debug()
  public async fileExists(filePath: string) {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  @log.debug()
  public async readText(filePath: string): Promise<string> {
    return await fsPromises.readFile(filePath, "utf-8");
  }

  @log.debug()
  public async openFileFromPath(filePath: string) {
    return new Promise((resolve, reject) => {
      shell
        .openPath(filePath)
        .then(() => resolve(filePath))
        .catch(reject);
    });
  }

  @log.debug([1])
  public async writeFile(binaryContent: Uint8Array, filePath: string): Promise<void> {
    const filePathResolved = path.resolve(filePath);

    await fsPromises.writeFile(filePathResolved, binaryContent);
  }

  @log.debug()
  getTempFilePath(filename: string) {
    return path.resolve(os.tmpdir(), filename);
  }

  @log.debug()
  delete(filename: string, options: RmDirOptions | undefined) {
    return fsPromises.rm(filename, options);
  }

  @log.debug()
  mkdir(filename: string) {
    return fsPromises.mkdir(filename, { recursive: true });
  }

  @log.debug()
  lstat(filename: string) {
    return fsPromises.lstat(filename);
  }

  @log.debug()
  async rename(from: string, to: string) {
    const toDir = path.dirname(to);

    await fsPromises.mkdir(toDir, { recursive: true });

    await fsPromises.rename(from, to);
  }

  @log.debug()
  readdir(filename: string, recursively?: boolean) {
    return fsPromises.readdir(filename, { recursive: recursively });
  }

  @log.debug()
  async readdirEntries(filename: string) {
    const entries = await fsPromises.readdir(filename, { withFileTypes: true });

    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
    }));
  }

  @log.debug()
  async getDirectorySize(directory: string): Promise<number> {
    const stdout = await this.executeDirectorySizeCommand(directory);
    const parsed = Number.parseFloat(stdout.trim());

    if (Number.isNaN(parsed)) {
      throw new Error(`Unable to parse directory size for ${directory}: ${stdout}`);
    }

    return Math.max(0, Math.round(parsed));
  }

  private async executeDirectorySizeCommand(directory: string): Promise<string> {
    switch (process.platform) {
      case "win32":
        return await this.execFileText("powershell.exe", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          this.getWindowsDirectorySizeScript(directory),
        ]);
      case "darwin":
        return await this.execFileText("/bin/sh", [
          "-lc",
          this.getMacDirectorySizeScript(),
          "sh",
          directory,
        ]);
      default:
        return await this.execFileText("/bin/sh", [
          "-lc",
          this.getLinuxDirectorySizeScript(),
          "sh",
          directory,
        ]);
    }
  }

  private async execFileText(command: string, args: string[]): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      execFile(
        command,
        args,
        { windowsHide: true, maxBuffer: 1024 * 1024 * 16 },
        (error, stdout, stderr) => {
          if (error) {
            this.logger.error("Directory size command failed", { command, args, stderr });
            reject(error);
            return;
          }

          resolve(stdout.toString());
        },
      );
    });
  }

  private getWindowsDirectorySizeScript(directory: string): string {
    const escapedPath = directory.replaceAll("'", "''");

    return [
      "$ErrorActionPreference = 'Stop'",
      `$target = '${escapedPath}'`,
      "$sum = (Get-ChildItem -LiteralPath $target -Recurse -Force -File | Measure-Object -Property Length -Sum -ErrorAction Stop).Sum",
      "if ($null -eq $sum) { $sum = 0 }",
      "[Console]::Out.Write($sum)",
    ].join("; ");
  }

  private getMacDirectorySizeScript(): string {
    return `find "$1" -type f -exec stat -f %z {} + | awk '{ sum += $1 } END { print sum + 0 }'`;
  }

  private getLinuxDirectorySizeScript(): string {
    return `find "$1" -type f -printf '%s\n' | awk '{ sum += $1 } END { print sum + 0 }'`;
  }
}
