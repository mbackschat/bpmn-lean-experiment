import { spawn } from "node:child_process";

function validateDuration(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer of at least ${minimum}ms`);
  }
}

export async function runCommand(command, args, options) {
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
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let timeoutTimer;
  let forceKillTimer;
  let timedOut = false;

  function signalProcessGroup(signal) {
    try {
      if (ownsProcessGroup && child.pid !== undefined) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }

  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (timedOut) {
        reject(
          new Error(
            `${command} exceeded ${options.timeoutMs}ms\n${stdout}${stderr}`,
          ),
        );
        return;
      }
      if (code === 0) {
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
      timedOut = true;
      try {
        signalProcessGroup("SIGTERM");
      } catch (error) {
        reject(
          new Error(`Failed to terminate timed-out ${command}`, {
            cause: error,
          }),
        );
        return;
      }
      forceKillTimer = setTimeout(() => {
        try {
          signalProcessGroup("SIGKILL");
        } catch (error) {
          reject(
            new Error(`Failed to kill timed-out ${command}`, {
              cause: error,
            }),
          );
        }
      }, terminationGraceMs);
    }, options.timeoutMs);
  });

  try {
    return await completion;
  } finally {
    clearTimeout(timeoutTimer);
    clearTimeout(forceKillTimer);
  }
}
