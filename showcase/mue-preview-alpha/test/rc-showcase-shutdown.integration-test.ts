import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

for (const automated of [false, true]) for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(`RC ${automated ? "automation" : "user"} showcase exits cleanly after ${signal}`, { timeout: 60_000 }, async () => {
    const child = spawn(process.execPath, [new URL("../src/rc-showcase-host.ts", import.meta.url).pathname, ...(automated ? ["--automated-participants"] : [])], {
      env: { ...process.env, PLATFORM_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
    });
    const exit = once(child, "exit");
    let output = "";
    let signalled = false;
    const receive = (chunk: Buffer) => {
      output += chunk.toString();
      if (!signalled && output.includes("RC showcase: http://")) {
        signalled = true;
        child.kill(signal);
      }
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    const deadline = setTimeout(() => child.kill("SIGKILL"), 55_000);
    try {
      const [code, exitSignal] = await exit;
      assert.equal(signalled, true, output);
      assert.equal(exitSignal, null, output);
      assert.equal(code, 0, output);
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exit; }
    }
  });
}
