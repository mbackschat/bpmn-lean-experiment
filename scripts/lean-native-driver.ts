/**
 * Native Lean test drivers.
 *
 * A package test that needs Lean's answer runs the driver's `main` as a native executable built once
 * per source change, not through `lake run`, which interprets the whole semantic core on every call:
 * on the hosted runner (2026-10-22) twelve parallel-scope cases took 15.5 s interpreted and 0.51 s
 * native, with byte-identical output. A driver's executable is the `[[lean_exe]]` whose `root` is the
 * driver module, so `lakefile.toml` stays the one list of drivers.
 *
 * A driver that binds scenarios owned by proof-bearing conformance modules, such as the fixture-binding
 * driver, stays interpreted through `./scripts/lake.sh run`: an executable root must not import proof
 * modules (`scripts/lean-import-boundaries.test.ts`), so a proof change never re-compiles native code.
 *
 * The build never runs inside a test's deadline: {@link prepareNativeLeanDriver} builds once per
 * process under {@link nativeLeanDriverBuildTimeoutMs}, and the caller executes the binary directly.
 * The wrapper's `exe` subcommand stays forbidden, because it re-checks and may re-native-compile the closure on each call
 * (CI run 33748926595 spent its job limit that way).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./run-command.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Allowance for one focused native driver build.
 *
 * A cold build of the parallel-scope driver's closure took 3 min 36 s at one Lean thread on the hosted
 * runner (2026-10-22); later builds recompile only changed modules.
 */
export const nativeLeanDriverBuildTimeoutMs = 600_000;

/** Each declared `[[lean_exe]]` root module mapped to its executable name, in declaration order. */
export function declaredLeanExecutables(lakefile: string): ReadonlyMap<string, string> {
  const executables = new Map<string, string>();
  for (const block of lakefile.split(/^\[\[lean_exe\]\]$/mu).slice(1)) {
    const table = block.split(/^\[/mu)[0] ?? "";
    const name = /^name = "([^"]+)"$/mu.exec(table)?.[1];
    const root = /^root = "([^"]+)"$/mu.exec(table)?.[1];
    if (name === undefined || root === undefined) {
      throw new TypeError(`[[lean_exe]] block needs a name and a root: ${table.trim()}`);
    }
    executables.set(root, name);
  }
  return executables;
}

/** The declared executable for a `BpmnSemantics/<Module>.lean` driver source. */
export function nativeLeanDriverFor(lakefile: string, sourcePath: string): string {
  const relative = /^BpmnSemantics\/([\w/]+)\.lean$/u.exec(sourcePath)?.[1];
  if (relative === undefined) {
    throw new TypeError(`${sourcePath} is not a BpmnSemantics driver source`);
  }
  const module = `BpmnSemantics.${relative.replaceAll("/", ".")}`;
  const name = declaredLeanExecutables(lakefile).get(module);
  if (name === undefined) {
    throw new TypeError(`${sourcePath} has no [[lean_exe]] whose root is ${module}`);
  }
  return name;
}

const prepared = new Map<string, Promise<string>>();

/**
 * Builds the driver's executable once per process and resolves to the binary's absolute path.
 *
 * When the Lean-checks stage already built it, as in hosted integration jobs, the build is Lake's
 * up-to-date check.
 */
export function prepareNativeLeanDriver(sourcePath: string): Promise<string> {
  const name = nativeLeanDriverFor(readFileSync(path.join(projectRoot, "lakefile.toml"), "utf8"), sourcePath);
  let binary = prepared.get(name);
  if (binary === undefined) {
    binary = runCommand("./scripts/lake.sh", ["build", name], {
      cwd: projectRoot,
      env: process.env,
      timeoutMs: nativeLeanDriverBuildTimeoutMs,
    }).then(() => path.join(projectRoot, ".lake", "build", "bin", name));
    prepared.set(name, binary);
  }
  return binary;
}
