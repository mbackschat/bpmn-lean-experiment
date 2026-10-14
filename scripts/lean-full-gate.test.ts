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
 * probes recur as [Finding 75](../docs/PROCESS-ASSESSMENT-LEDGER.md#finding-75), which a self-assessment
 * question alone did not stop. Classification is fail-closed: only a `BpmnSemantics.` submodule or a
 * declared `lean_exe` is narrow, so a package, facet or umbrella spelling cannot slip past as focused.
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
      ["build", "+BpmnSemantics"],
      ["build", "BpmnSemantics:olean"],
      ["build", "BpmnSemantics.SemanticProcess.Data", ":default"],
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
      [["build", "BpmnSemantics.SemanticProcess.Data", "+BpmnSemantics.Scenario:olean"], undefined],
      [["build", "emitSemanticProcessResults"], undefined],
      [["--version"], undefined],
    ] as const) {
      const allowed = run(args, gate);
      assert.equal(allowed.status, 0, `${args.join(" ")}: ${allowed.stderr}`);
      assert.equal(allowed.stdout, `${args.join(" ")}\n`);
      assert.equal(allowed.stderr, "", "a permitted invocation must add no output");
    }
    const umbrella = run(["build", "BpmnSemantics"], "effect-data-shared-batch");
    assert.equal(umbrella.status, 64);
    assert.match(umbrella.stderr, /umbrella/u);
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});
