/** Project paths, strict JSON reading and bounded child processes shared by the differential targets. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runCommand } from "../../../scripts/run-command.ts";
import { parseWireJsonBytes } from "../../../scripts/strict-json.ts";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export async function readJson<Value>(filePath: string): Promise<Value> {
  return parseWireJsonBytes<Value>(await readFile(filePath), filePath);
}

export function runProcess(
  command: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
  stdoutEncoding?: "utf8Fatal",
) {
  return runCommand(command, args, {
    cwd: projectRoot,
    env: process.env,
    timeoutMs,
    ...(stdoutEncoding === undefined ? {} : { stdoutEncoding }),
  });
}
