import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type RunCommand = (
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
) => Promise<void>;

export type BrowserWalkthroughRefreshOptions = Readonly<{
  allocatePort?: () => Promise<number>;
  processId?: number;
  run?: RunCommand;
}>;

/**
 * Captures against a fresh isolated evaluation stack using the distribution's
 * 30-second read tolerance, proactive 5-second projection refresh, and a
 * dynamically allocated loopback port. The transient Compose volumes are
 * removed after success or failure; simultaneous capture and cleanup failures
 * are reported together.
 */
export async function refreshBrowserWalkthroughScreenshots(
  options: BrowserWalkthroughRefreshOptions = {},
): Promise<void> {
  const port = await (options.allocatePort ?? allocateLoopbackPort)();
  const projectName = `bpmn-lean-walkthrough-${options.processId ?? process.pid}`;
  const run = options.run ?? runCommand;
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    BPMN_EVALUATION_ORIGIN: `http://127.0.0.1:${port}`,
    BPMN_EVALUATION_PORT: String(port),
    BPMN_EVALUATION_PROJECTION_MAX_AGE_MS: "30000",
    BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS: "5000",
    BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS: "true",
  };
  const composePrefix = ["compose", "--project-name", projectName] as const;

  let primaryFailure: unknown;
  try {
    await run("docker", [...composePrefix, "up", "--build", "--wait"], environment);
    await run("./scripts/pnpm.sh", [
      "--filter",
      "@bpmn-lean/showcase-platform-browser-walkthrough",
      "exec",
      "playwright",
      "test",
    ], environment);
  } catch (error: unknown) {
    primaryFailure = error;
  }

  try {
    await run("docker", [
      ...composePrefix,
      "down",
      "--volumes",
      "--remove-orphans",
    ], environment);
  } catch (cleanupFailure: unknown) {
    if (primaryFailure !== undefined) {
      throw new AggregateError(
        [primaryFailure, cleanupFailure],
        "Walkthrough capture and Compose cleanup both failed",
      );
    }
    throw cleanupFailure;
  }
  if (primaryFailure !== undefined) throw primaryFailure;
}

async function allocateLoopbackPort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a loopback port"));
        return;
      }
      server.close((error) => error === undefined
        ? resolvePort(address.port)
        : reject(error));
    });
  });
}

async function runCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  await new Promise<void>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error(
        signal === null
          ? `${command} exited with code ${String(code)}`
          : `${command} exited after signal ${signal}`,
      ));
    });
  });
}

function isEntryPoint(moduleUrl: string, argvEntry: string | undefined): boolean {
  return argvEntry !== undefined
    && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  void refreshBrowserWalkthroughScreenshots().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
