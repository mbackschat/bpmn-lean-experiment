import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPlatformServer } from "./composition.js";
import { readPlatformServerConfig } from "./config.js";

export async function runPlatformServer(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const runtime = await createPlatformServer(readPlatformServerConfig(environment));
  try {
    const origin = await runtime.listen();
    process.stdout.write(`${origin}\n`);
  } catch (error: unknown) {
    await runtime.close();
    throw error;
  }
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined
    && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void runPlatformServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
