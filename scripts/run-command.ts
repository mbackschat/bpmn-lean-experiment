import { spawn } from "node:child_process";

export type RunCommandOptions = Readonly<{
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  terminationGraceMs?: number;
  stdoutEncoding?: "utf8Fatal";
}>;

export type RunCommandResult = Readonly<{
  stdout: string;
  stderr: string;
}>;

/** Distinguishes an owned deadline from command failure or parent interruption. */
export class CommandTimeoutError extends Error {
  readonly command: string;
  readonly timeoutMs: number;

  constructor(
    command: string,
    timeoutMs: number,
    stdout: string,
    stderr: string,
  ) {
    super(`${command} exceeded ${timeoutMs}ms\n${stdout}${stderr}`);
    this.name = "CommandTimeoutError";
    this.command = command;
    this.timeoutMs = timeoutMs;
  }
}

type TerminationReason = "timeout" | NodeJS.Signals;

function validateDuration(
  value: number,
  name: string,
  minimum: number,
): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer of at least ${minimum}ms`);
  }
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions,
): Promise<RunCommandResult> {
  const terminationGraceMs = options.terminationGraceMs ?? 1_000;
  validateDuration(options.timeoutMs, "timeoutMs", 1);
  validateDuration(terminationGraceMs, "terminationGraceMs", 0);
  const ownsProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: ownsProcessGroup,
  });
  let stdout = "";
  let stderr = "";
  let stdoutDecodingError: unknown;
  const stdoutDecoder = options.stdoutEncoding === "utf8Fatal"
    ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    : undefined;
  if (stdoutDecoder === undefined) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  } else {
    child.stdout.on("data", (chunk: Uint8Array) => {
      if (stdoutDecodingError !== undefined) return;
      try {
        stdout += stdoutDecoder.decode(chunk, { stream: true });
      } catch (error: unknown) {
        stdoutDecodingError = error;
      }
    });
  }
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let timeoutTimer: NodeJS.Timeout | undefined;
  let forceKillTimer: NodeJS.Timeout | undefined;
  let terminationReason: TerminationReason | undefined;

  function signalProcessGroup(signal: NodeJS.Signals): void {
    try {
      if (ownsProcessGroup && child.pid !== undefined) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      ) {
        throw error;
      }
    }
  }

  function beginTermination(reason: TerminationReason): void {
    if (terminationReason !== undefined) {
      return;
    }
    terminationReason = reason;
    signalProcessGroup(reason === "timeout" ? "SIGTERM" : reason);
    forceKillTimer = setTimeout(() => {
      signalProcessGroup("SIGKILL");
    }, terminationGraceMs);
  }

  const forwardedSignals = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
  const signalHandlers = forwardedSignals.map((signal) => {
    const handler = () => beginTermination(signal);
    process.once(signal, handler);
    return { handler, signal };
  });

  const completion = new Promise<RunCommandResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (terminationReason === "timeout") {
        reject(
          new CommandTimeoutError(
            command,
            options.timeoutMs,
            stdout,
            stderr,
          ),
        );
        return;
      }
      if (terminationReason !== undefined) {
        reject(
          new Error(
            `${command} interrupted by ${terminationReason}\n${stdout}${stderr}`,
          ),
        );
        return;
      }
      if (code === 0) {
        try {
          if (stdoutDecodingError !== undefined) throw stdoutDecodingError;
          stdout += stdoutDecoder?.decode() ?? "";
        } catch (error: unknown) {
          reject(new TypeError(`${command} stdout is not valid UTF-8`, { cause: error }));
          return;
        }
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code ?? signal}\n${stdout}${stderr}`,
        ),
      );
    });
    timeoutTimer = setTimeout(() => {
      try {
        beginTermination("timeout");
      } catch (error) {
        reject(
          new Error(`Failed to terminate timed-out ${command}`, {
            cause: error,
          }),
        );
      }
    }, options.timeoutMs);
  });

  try {
    return await completion;
  } finally {
    clearTimeout(timeoutTimer);
    clearTimeout(forceKillTimer);
    for (const { handler, signal } of signalHandlers) {
      process.removeListener(signal, handler);
    }
  }
}
