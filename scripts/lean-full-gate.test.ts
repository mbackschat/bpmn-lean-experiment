import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const lakeWrapperPath = fileURLToPath(new URL("./lake.sh", import.meta.url));

/**
 * A full-library build must be a declared gate, never a reflex.
 *
 * Lake rebuilds every module downstream of an edit, so a full build during development of a widely
 * imported owner costs up to the cold library time per run, while a narrow build compiles only the
 * named targets' import closure. Full builds started as consumer discovery or as "is it still red"
 * probes recurred (Finding 75 of the retired process assessment ledger), which a self-assessment
 * question alone did not stop. Classification is fail-closed: only the `Kernel` library, one of its modules or a
 * declared `lean_exe` is narrow, so a package, facet or default-target spelling cannot slip past as focused,
 * and more than 16 narrow targets are a wide build, so enumerating a reverse closure cannot either.
 * The pass-through stays silent because retained memory receipts hash the build output.
 */
test("the Lean wrapper requires a declared gate for every full-library build", async () => {
  const fakeBin = await mkdtemp(path.join(tmpdir(), "bpmn-lean-full-gate-"));
  const lockOwner = path.basename(fakeBin);
  const lockPath = `/tmp/bpmn-lean-experiment-${lockOwner}.lake-build.lock`;
  await writeFile(path.join(fakeBin, "id"), `#!/bin/sh\nprintf '%s\\n' '${lockOwner}'\n`, { mode: 0o755 });
  await writeFile(path.join(fakeBin, "lake"), "#!/bin/sh\nprintf '%s\\n' \"$*\"\n", { mode: 0o755 });
  const { LEAN_FULL_GATE: _ambientGate, ...ambient } = process.env;
  const undeclared = { ...ambient, PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
  const run = (args: ReadonlyArray<string>, gate?: string) =>
    spawnSync(lakeWrapperPath, args, {
      encoding: "utf8",
      timeout: 10_000,
      env: gate === undefined ? undeclared : { ...undeclared, LEAN_FULL_GATE: gate },
    });
  try {
    for (const args of [
      ["build"],
      ["build", "-v"],
      ["test"],
      ["build", "@bpmn-lean-experiment"],
      ["build", "+Kernel"],
      ["build", "Kernel:olean"],
      ["build", "Kernel.Step", ":default"],
    ]) {
      const refused = run(args);
      assert.equal(refused.status, 64, `${args.join(" ")}: ${refused.stdout}${refused.stderr}`);
      assert.equal(refused.stdout, "", `${args.join(" ")} reached Lake`);
      assert.match(refused.stderr, /LEAN_BUILD_REFUSED .*LEAN_FULL_GATE/u);
    }
    for (const gate of ["", "two words", "-leading"]) {
      const malformed = run(["build"], gate);
      assert.equal(malformed.status, 64, `label ${JSON.stringify(gate)} was accepted`);
      assert.equal(malformed.stdout, "");
    }
    for (const [args, gate] of [
      [["build"], "effect-data-shared-batch"],
      [["test"], "verify-lean-library"],
      [["build", "Kernel.Step", "+Kernel.State:olean"], undefined],
      [["build", "Kernel", "kernelRun"], undefined],
      [["--version"], undefined],
    ] as const) {
      const allowed = run(args, gate);
      assert.equal(allowed.status, 0, `${args.join(" ")}: ${allowed.stderr}`);
      assert.equal(allowed.stdout, `${args.join(" ")}\n`);
      assert.equal(allowed.stderr, "", "a permitted invocation must add no output");
    }
    const submodules = (count: number) =>
      ["build", ...Array.from({ length: count }, (_, index) => `Kernel.Module${index}`)];
    const enumerated = run(submodules(17));
    assert.equal(enumerated.status, 64, `17 narrow targets: ${enumerated.stdout}${enumerated.stderr}`);
    assert.equal(enumerated.stdout, "", "an enumerated wide build reached Lake");
    assert.match(enumerated.stderr, /LEAN_BUILD_REFUSED .*16 .*LEAN_FULL_GATE/u);
    for (const [args, gate] of [[submodules(16), undefined], [submodules(17), "effect-data-shared-batch"]] as const) {
      const allowed = run(args, gate);
      assert.equal(allowed.status, 0, `${args.length - 1} targets: ${allowed.stderr}`);
      assert.equal(allowed.stderr, "", "a permitted invocation must add no output");
    }
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});
