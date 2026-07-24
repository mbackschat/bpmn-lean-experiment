import { spawn } from "node:child_process";

export async function runCommand(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
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

  let timer;
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
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
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} exceeded ${options.timeoutMs}ms`));
    }, options.timeoutMs);
  });

  try {
    return await completion;
  } finally {
    clearTimeout(timer);
  }
}
