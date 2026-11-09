import { rmSync } from "node:fs";
import path from "node:path";

const desktopDir = path.resolve(import.meta.dirname, "../..");

rmSync(path.join(desktopDir, "out"), { force: true, recursive: true });
rmSync(path.join(desktopDir, "dist"), { force: true, recursive: true });
