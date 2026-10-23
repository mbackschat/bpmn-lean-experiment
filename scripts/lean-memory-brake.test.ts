import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const lakeWrapperPath = fileURLToPath(new URL("./lake.sh", import.meta.url));

/**
 * Every Lean process tree runs under a memory brake.
 *
 * Ordinary builds run natively, and macOS offers no hard process-tree memory ceiling, so on
 * 2026-10-14 a delegated build of a new kernel-reduced conformance module grew to a 13 GB footprint,
 * 12 GB of it compressed and invisible to `ps` RSS, and filled 9.5 of 10 GB swap before anyone
 * noticed. The brake samples the physical footprint of the wrapper's descendants and terminates the
 * tree above the manifest-owned limit. An environment value may only lower that limit, which is what
 * lets this witness fire on a 300 MB allocation without a setting that could raise it.
 */
async function withFakeLake(
  lakeBody: string,
  run: (fakeBin: string) => Promise<void>,
): Promise<void> {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "bpmn-lean-memory-brake-"));
  const lockPath = `/tmp/bpmn-lean-experiment-${path.basename(fakeBin)}.lake-build.lock`;
  await writeFile(path.join(fakeBin, "id"), `#!/bin/sh\nprintf '%s\\n' '${path.basename(fakeBin)}'\n`, {
    mode: 0o755,
  });
  await writeFile(path.join(fakeBin, "lake"), `#!/bin/sh\n${lakeBody}\n`, { mode: 0o755 });
  try {
    await run(fakeBin);
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
}

function runWrapper(fakeBin: string, brakeMib: string, extra: Readonly<Record<string, string>> = {}) {
  const { LEAN_FULL_GATE: _gate, LEAN_MEMORY_BRAKE_MIB: _brake, LEAN_MEMORY_PEAK_FILE: _peak, ...ambient } = process.env;
  return spawnSync(lakeWrapperPath, ["build", "BpmnSemantics.Fake"], {
    encoding: "utf8",
    timeout: 60_000,
    env: { ...ambient, ...extra, LEAN_MEMORY_BRAKE_MIB: brakeMib, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
  });
}

test("the Lean wrapper terminates a process tree above the memory brake", async () => {
  await withFakeLake(
    `"${process.execPath}" -e 'const held = Buffer.alloc(300 * 1024 * 1024, 1); ` +
      `require("node:fs").writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => held, 45000)' "$(dirname "$0")/child.pid"`,
    async (fakeBin) => {
      const started = Date.now();
      const braked = runWrapper(fakeBin, "100");
      assert.equal(braked.status, 70, braked.stdout + braked.stderr);
      assert.match(braked.stderr, /LEAN_MEMORY_BRAKE .*100 MiB/u);
      assert.ok(Date.now() - started < 30_000, "the brake did not fire before the allocation's own timeout");
      const childPid = Number(await readFile(path.join(fakeBin, "child.pid"), "utf8"));
      assert.throws(() => process.kill(childPid, 0), "the braked child survived its wrapper");
    },
  );
});

test("the Lean wrapper passes an ordinary process tree through the brake silently", async () => {
  await withFakeLake("printf '%s\\n' \"$*\"", async (fakeBin) => {
    const ordinary = runWrapper(fakeBin, "100");
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(ordinary.stdout, "build BpmnSemantics.Fake\n");
    assert.equal(ordinary.stderr, "");
  });
});

test("an environment brake value can only lower the manifest limit", async () => {
  await withFakeLake("printf '%s\\n' \"$*\"", async (fakeBin) => {
    for (const malformed of ["", "0", "-5", "12x", "4096 MiB"]) {
      const refused = runWrapper(fakeBin, malformed);
      assert.equal(refused.status, 64, `brake ${JSON.stringify(malformed)} was accepted`);
      assert.equal(refused.stdout, "");
    }
  });
  const wrapper = await readFile(lakeWrapperPath, "utf8");
  assert.match(wrapper, /-lt "\$required_lean_memory_brake_mib"/u, "a larger environment value must not raise the brake");
});

/**
 * CI raises Lean parallelism under its own brake, so each run reports the largest process-tree
 * footprint the brake sampled. The report goes to a file the caller names rather than to output,
 * because retained Lean memory receipts hash the build output, and it keeps the larger of the file's
 * value and this run's peak so that several wrapper invocations in one job report their maximum.
 */
test("the Lean wrapper reports the sampled peak footprint only to a requested file", async () => {
  await withFakeLake(
    `"${process.execPath}" -e 'const held = Buffer.alloc(64 * 1024 * 1024, 1); setTimeout(() => held, 5000)'`,
    async (fakeBin) => {
      const peakFile = path.join(fakeBin, "peak-kib");
      const reported = runWrapper(fakeBin, "4096", { LEAN_MEMORY_PEAK_FILE: peakFile });
      assert.equal(reported.status, 0, reported.stderr);
      assert.equal(reported.stdout + reported.stderr, "");
      const peak = Number(await readFile(peakFile, "utf8"));
      assert.ok(peak >= 60 * 1024 && peak < 4096 * 1024, `implausible peak ${peak} KiB`);

      await writeFile(peakFile, String(4000 * 1024));
      assert.equal(runWrapper(fakeBin, "4096", { LEAN_MEMORY_PEAK_FILE: peakFile }).status, 0);
      assert.equal(Number(await readFile(peakFile, "utf8")), 4000 * 1024, "a smaller peak replaced a larger one");
    },
  );
});
