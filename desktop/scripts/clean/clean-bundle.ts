import { rmSync } from "node:fs";
import path from "node:path";

rmSync(path.resolve(import.meta.dirname, "../../out"), { force: true, recursive: true });
