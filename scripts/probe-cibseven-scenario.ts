/**
 * The single-scenario CIB probe: runs exactly one scenario through the bridge call the evidence replacement uses
 * (`cibBridgeInvocation`, one deadline owner) and writes only into an output directory outside the repository.
 *
 * Usage: `node scripts/probe-cibseven-scenario.ts --out <directory> [--effect-schedule <schedule>] <scenario.json>`.
 * The schedule defaults to the replacement's own choice for the scenario. The output directory keeps the bridge's input
 * and canonical result lines (`results-*.jsonl`), `probe-answer.json` and `probe.log`.
 *
 * scope: writes only inside `--out`, which must lie outside the repository (retained evidence sits under `scenarios/`,
 * `adoption/` and `packages/differential/`); never writes evidence, manifests or digests.
 * target effect: a handful of small files in `--out`.
 *
 * Exit status: 0 the scenario was answered, 2 a usage refusal, 3 a harness failure (deadline, heap, Maven or bridge).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cibEvidenceEffectSchedule,
  isolateResourceBreaches,
  runCibBatch,
} from "./replace-cibseven-evidence.ts";
import type { BridgeAnswer, CibEffectSchedule } from "./replace-cibseven-evidence.ts";
import type { ScenarioDocument } from "./contract-artifacts.ts";
import { parseWireJsonBytes } from "./strict-json.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const effectSchedules: ReadonlyArray<CibEffectSchedule> = ["plainSuccess", "incidentReportRetrySuccess", "incidentReportCancel"];

/** A refused invocation: nothing ran and nothing was written. */
export class ProbeUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeUsageError";
  }
}

export type ProbeArguments = Readonly<{
  scenarioPath: string;
  outputDirectory: string;
  effectSchedule: CibEffectSchedule | undefined;
}>;

/** Admits exactly one scenario path, `--out <directory>` and optionally `--effect-schedule <schedule>`. */
export function parseProbeArguments(args: ReadonlyArray<string>): ProbeArguments {
  const scenarios: string[] = [];
  let outputDirectory: string | undefined;
  let effectSchedule: CibEffectSchedule | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--out" || arg === "--effect-schedule") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new ProbeUsageError(`${arg} needs a value`);
      index += 1;
      if (arg === "--out") outputDirectory = value;
      else {
        const schedule = effectSchedules.find((candidate) => candidate === value);
        if (schedule === undefined) {
          throw new ProbeUsageError(`unknown effect schedule ${value}; expected one of ${effectSchedules.join(", ")}`);
        }
        effectSchedule = schedule;
      }
    } else if (arg.startsWith("--")) throw new ProbeUsageError(`unknown option ${arg}`);
    else scenarios.push(arg);
  }
  if (scenarios.length !== 1) {
    throw new ProbeUsageError(`the probe runs exactly one scenario, received ${String(scenarios.length)}`);
  }
  if (outputDirectory === undefined) throw new ProbeUsageError("the probe needs --out <directory>");
  return { scenarioPath: scenarios[0]!, outputDirectory, effectSchedule };
}

/** Refuses an output directory inside the repository, where the retained evidence and the scenarios live. */
export function requireOutputOutsideRepository(outputDirectory: string): void {
  const relative = path.relative(projectRoot, path.resolve(outputDirectory));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new ProbeUsageError(`the output directory ${outputDirectory} lies inside the repository, which holds the retained evidence`);
  }
}

/** 0 for a scenario the bridge answered, 2 for a usage refusal, 3 for a harness failure. */
export function probeExitCode(outcome: BridgeAnswer | ProbeUsageError): 0 | 2 | 3 {
  if (outcome instanceof ProbeUsageError) return 2;
  return outcome.kind === "failure" ? 3 : 0;
}

async function probe(args: ProbeArguments): Promise<BridgeAnswer> {
  const scenarioBytes = await readFile(path.resolve(args.scenarioPath));
  const scenario = parseWireJsonBytes<Omit<ScenarioDocument, "kind"> & Readonly<{ id: string; kind: string; profile: string }>>(
    scenarioBytes,
    args.scenarioPath,
  );
  const profile = parseWireJsonBytes<Readonly<{ oracle: Readonly<{ version: string }> }>>(
    await readFile(path.join(projectRoot, "profiles", scenario.profile, "profile.json")),
    `profile ${scenario.profile}`,
  );
  const engineVersion = profile.oracle.version;
  // A population runs in the default engine environment only, so the replacement gives it the plain schedule.
  const schedule = args.effectSchedule ??
    (scenario.kind === "populationScenario" ? "plainSuccess" : cibEvidenceEffectSchedule(scenario));
  await mkdir(args.outputDirectory, { recursive: true });
  let log = "";
  const captureLog = async (output: { stdout: string; stderr: string }) => {
    log += `${output.stdout}${output.stderr}`;
  };
  try {
    // The preparing call carries the cold-host work, as in the replacement.
    await runCibBatch([], args.outputDirectory, engineVersion, schedule, captureLog);
    const [answer] = await isolateResourceBreaches(
      [scenario],
      (batch) => runCibBatch(batch, args.outputDirectory, engineVersion, schedule, captureLog),
      (line) => { log += `${line}\n`; },
    );
    return answer!;
  } catch (error) {
    log += `${error instanceof Error ? error.message : String(error)}\n`;
    return { kind: "failure", failure: error instanceof Error ? error.message : String(error) };
  } finally {
    await writeFile(path.join(args.outputDirectory, "probe.log"), log, "utf8");
  }
}

async function main(argv: ReadonlyArray<string>): Promise<number> {
  let args: ProbeArguments;
  try {
    args = parseProbeArguments(argv);
    requireOutputOutsideRepository(args.outputDirectory);
  } catch (error) {
    if (error instanceof ProbeUsageError) {
      process.stderr.write(`${error.message}\n`);
      return probeExitCode(error);
    }
    throw error;
  }
  const answer = await probe(args);
  await writeFile(path.join(args.outputDirectory, "probe-answer.json"), `${JSON.stringify(answer)}\n`, "utf8");
  process.stdout.write(`${answer.kind === "failure" ? `harness failure: ${answer.failure}` : `answered: ${answer.result.scenarioId}`}\n`);
  return probeExitCode(answer);
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
