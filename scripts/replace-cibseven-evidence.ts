import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCibSevenMavenTimeoutMs, wrapCibSevenMavenFailure } from "./cibseven-maven-budget.ts";
import { populationEvidenceCases, populationEvidenceDocument } from "./cibseven-population-evidence.ts";
import type { CibPopulationResult } from "./cibseven-population-evidence.ts";
import { oracleEvidenceCases } from "./contract-artifact-cases.ts";
import { resolveJavaHome } from "./java-home.ts";
import { CommandTimeoutError, runCommand } from "./run-command.ts";
import { parseWireJson, parseWireJsonBytes } from "./strict-json.ts";
import type { CibSevenEvidence, ScenarioDocument } from "./contract-artifacts.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
let batchInvocations = 0;

type JsonDocument<Value> = Readonly<{
  bytes: Buffer;
  value: Value;
}>;

type SemanticProfile = Readonly<{
  id: string;
  oracle: Readonly<{
    version: string;
    revision: string;
  }>;
  environment: Readonly<{
    java: string;
    database: string;
  }>;
}>;

type CibRunnerResult = Readonly<{
  scenarioId: string;
  outcome: CibSevenEvidence["result"]["outcome"];
  trace: CibSevenEvidence["result"]["trace"];
  diagnostics: Readonly<{
    engineVersion: string;
    databaseVersion: string;
    cleanup: Readonly<Record<string, number>>;
    stateQueries: ReadonlyArray<unknown>;
    taskQueries: ReadonlyArray<unknown>;
    messageSubscriptions: ReadonlyArray<Readonly<{
      subscriptions: ReadonlyArray<unknown>;
      addresslessReceiveWaits?: ReadonlyArray<unknown>;
    }>>;
    timerJobs: ReadonlyArray<unknown>;
    effectJobs: ReadonlyArray<Readonly<{
      jobs: ReadonlyArray<unknown>;
    }>>;
    incidentJobs?: ReadonlyArray<unknown>;
    historicProcessStates?: ReadonlyArray<unknown>;
    effectExecutions: ReadonlyArray<unknown>;
    mappingExecutions: ReadonlyArray<unknown>;
  }>;
}>;

export function requireReplacementAuthorization(
  args: ReadonlyArray<string>,
): void {
  if (
    args.length !== 1 ||
    args[0] !== "--replace"
  ) {
    throw new Error(
      "CIB evidence replacement requires the exact --replace flag",
    );
  }
}

async function readJsonWithBytes<Value>(
  relativePath: string,
): Promise<JsonDocument<Value>> {
  const bytes = await readFile(path.join(projectRoot, relativePath));
  return {
    bytes,
    value: parseWireJsonBytes<Value>(
      bytes,
      relativePath,
    ),
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireCleanDiagnostics(
  result: CibRunnerResult | undefined,
): asserts result is CibRunnerResult {
  if (result === undefined) {
    throw new Error("CIB evidence batch omitted one scenario");
  }
  const cleanup = result.diagnostics.cleanup;
  if (
    cleanup === undefined ||
    Object.values(cleanup).some((count) => count !== 0)
  ) {
    throw new Error(
      `CIB scenario ${result.scenarioId} did not clean up`,
    );
  }
  if (!Array.isArray(result.diagnostics.stateQueries)) {
    throw new Error(
      `CIB scenario ${result.scenarioId} omitted raw state-query observations`,
    );
  }
  if (!Array.isArray(result.diagnostics.taskQueries)) {
    throw new Error(
      `CIB scenario ${result.scenarioId} omitted raw task-query observations`,
    );
  }
  if (!Array.isArray(result.diagnostics.timerJobs)) {
    throw new Error(
      `CIB scenario ${result.scenarioId} omitted raw timer-job observations`,
    );
  }
  if (!Array.isArray(result.diagnostics.messageSubscriptions)) {
    throw new Error(
      `CIB scenario ${result.scenarioId} omitted raw Message-subscription observations`,
    );
  }
  if (
    !Array.isArray(result.diagnostics.effectJobs) ||
    !Array.isArray(result.diagnostics.effectExecutions) ||
    !Array.isArray(result.diagnostics.mappingExecutions)
  ) {
    throw new Error(
      `CIB scenario ${result.scenarioId} omitted raw effect observations`,
    );
  }
}

/** Scenarios per Maven invocation, so one invocation stays inside its deadline as the batch grows. */
const cibBatchChunkSize = 20;

/** The kill deadline of one bridge call that runs scenarios. */
const cibBatchDeadlineMs = 30_000;

/**
 * The kill deadline of one bridge call. The preparing call runs no scenario and carries the cold-host work (dependency
 * resolution after a Maven cache miss, compilation, JVM start), so it gets the ceiling every CIB Maven call site
 * shares (`cibseven-maven-budget.ts`); a scenario batch then keeps its fixed deadline for the scenarios alone.
 */
export function cibBridgeDeadlineMs(scenarioCount: number, environment: NodeJS.ProcessEnv): number {
  return scenarioCount === 0 ? resolveCibSevenMavenTimeoutMs(environment) : cibBatchDeadlineMs;
}

type HarnessFailure = Readonly<{ scenarioId: string; failure: string }>;
type BatchOutcome = Readonly<{
  results: ReadonlyArray<CibRunnerResult>;
  populations: ReadonlyArray<CibPopulationResult>;
  failures: ReadonlyArray<HarnessFailure>;
}>;

/**
 * Splits the export bridge's output into answers and harness failures. The bridge answers every requested scenario in
 * request order, either with its result or with the harness failure that stopped it, and keeps running the rest in the
 * same engine; anything else, a missing line included, is a failure of the whole run and is never attributed to a scenario.
 */
export function bridgeOutcomes(requested: ReadonlyArray<string>, lines: ReadonlyArray<string>): BatchOutcome {
  if (lines.length !== requested.length) {
    throw new Error(`CIB bridge answered ${String(lines.length)} of ${String(requested.length)} scenarios`);
  }
  const results: CibRunnerResult[] = [];
  const populations: CibPopulationResult[] = [];
  const failures: HarnessFailure[] = [];
  for (const [index, line] of lines.entries()) {
    const answer = parseWireJson<Readonly<{ kind: string; scenarioId: string; failure?: string }>>(
      line,
      `CIB result line ${String(index + 1)}`,
    );
    if (answer.scenarioId !== requested[index]) {
      throw new Error(`CIB bridge line ${String(index + 1)} answers ${answer.scenarioId}, not ${requested[index]!}`);
    }
    if (answer.kind === "scenarioResult") results.push(answer as unknown as CibRunnerResult);
    else if (answer.kind === "cibSevenPopulationResult") populations.push(answer as unknown as CibPopulationResult);
    else if (answer.kind === "scenarioHarnessFailure" && typeof answer.failure === "string") {
      failures.push({ scenarioId: answer.scenarioId, failure: answer.failure });
    } else throw new Error(`CIB bridge line ${String(index + 1)} has kind ${answer.kind}`);
  }
  return { results, populations, failures };
}

/** The bridge's failure text for a scenario during which the JVM exhausted its heap (`CibSevenOracleMain`). */
const heapExhaustedFailure = "CIB_SCENARIO_HEAP_EXHAUSTED";

/** A bridge call the JVM heap ceiling ended; the bridge's last line names the scenario it was running then. */
export class CibHeapExhaustedError extends Error {
  readonly scenarioId: string;

  constructor(scenarioId: string, cause: unknown) {
    super(`CIB exhausted the JVM heap while running ${scenarioId}`, { cause });
    this.name = "CibHeapExhaustedError";
    this.scenarioId = scenarioId;
  }
}

/**
 * The scenario a failed bridge call names as the one that exhausted the heap: only its last line counts, because the
 * bridge writes that line and then ends the batch instead of reusing the engine.
 */
export function exhaustedHeapScenario(lines: ReadonlyArray<string>): string | undefined {
  const last = lines.at(-1);
  if (last === undefined) return undefined;
  const answer = parseWireJson<Readonly<{ kind: string; scenarioId: string; failure?: string }>>(last, "CIB last result line");
  return answer.kind === "scenarioHarnessFailure" && answer.failure === heapExhaustedFailure ? answer.scenarioId : undefined;
}

/** The harness failure a lone scenario records when its bridge call breached a resource bound, else `undefined`. */
function resourceBreach(error: unknown): string | undefined {
  if (error instanceof CibHeapExhaustedError) return heapExhaustedFailure;
  if (error instanceof Error && error.cause instanceof CommandTimeoutError) {
    return `CIB_SCENARIO_DEADLINE_EXCEEDED budgetMs=${String(error.cause.timeoutMs)}`;
  }
  return undefined;
}

/**
 * Runs `scenarios` through `run` under its two resource bounds, the batch deadline and the JVM heap. When either ends a
 * batch of several scenarios, each half runs again in a fresh bridge call, recursively, so that a single scenario that
 * alone breaches a bound becomes its own harness failure and keeps its retained evidence; every other failure propagates
 * unchanged. A scenario is named only when it breaches alone, because the scenario running at the breach may only have
 * been the last to add to its batch's cost.
 */
export async function isolateResourceBreaches<S extends Readonly<{ id: string }>>(
  scenarios: ReadonlyArray<S>,
  run: (batch: ReadonlyArray<S>) => Promise<BatchOutcome>,
  log: (line: string) => void,
): Promise<BatchOutcome> {
  try {
    return await run(scenarios);
  } catch (error) {
    const breach = resourceBreach(error);
    if (breach === undefined) throw error;
    if (scenarios.length === 1) {
      return { results: [], populations: [], failures: [{ scenarioId: scenarios[0]!.id, failure: breach }] };
    }
    // A chunk's composition is arbitrary, so one costly scenario must not decide the fate of the others: in Verify run
    // 43069801261 the chunk holding `cycle-compositions/automatic-loop-beyond-bound` (about 13 s of engine time alone)
    // exceeded the deadline, and in run 43235878488 `count-product-over-safe` exhausted the heap first, each aborting
    // the whole replacement. Splitting keeps both bounds and names the culprit.
    log(`CIB batch breached ${breach}; splitting ${scenarios.map(({ id }) => id).join(", ")}`);
    const middle = Math.ceil(scenarios.length / 2);
    const halves = [
      await isolateResourceBreaches(scenarios.slice(0, middle), run, log),
      await isolateResourceBreaches(scenarios.slice(middle), run, log),
    ];
    return {
      results: halves.flatMap(({ results }) => results),
      populations: halves.flatMap(({ populations }) => populations),
      failures: halves.flatMap(({ failures }) => failures),
    };
  }
}

function logSplit(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function runCibBatch(
  scenarios: ReadonlyArray<Readonly<{ id: string }>>,
  temporaryDirectory: string,
  engineVersion: string,
  effectSchedule:
    | "plainSuccess"
    | "incidentReportRetrySuccess"
    | "incidentReportCancel",
): Promise<BatchOutcome> {
  batchInvocations += 1;
  const inputPath = path.join(
    temporaryDirectory,
    `scenarios-${engineVersion}-${String(batchInvocations)}.jsonl`,
  );
  const outputPath = path.join(
    temporaryDirectory,
    `results-${engineVersion}-${String(batchInvocations)}.jsonl`,
  );
  await writeFile(
    inputPath,
    `${scenarios.map((scenario) => JSON.stringify(scenario)).join("\n")}\n`,
    "utf8",
  );
  const runnerDirectory = path.join(projectRoot, "runners/cibseven");
  const args = [
    "-s",
    process.env.BPMN_MAVEN_SETTINGS ??
      path.join(runnerDirectory, "maven-settings.xml"),
    "-f",
    path.join(runnerDirectory, "pom.xml"),
    "--no-transfer-progress",
    "-Dstyle.color=never",
    "-Dtest=CibSevenPipelineExportBridge",
    `-Dcibseven.version=${engineVersion}`,
    `-Dbpmn.pipeline.projectRoot=${projectRoot}`,
    `-Dbpmn.pipeline.input=${inputPath}`,
    `-Dbpmn.pipeline.output=${outputPath}`,
    `-Dbpmn.pipeline.effectSchedule=${effectSchedule}`,
    "test",
  ];
  if (process.env.BPMN_MAVEN_REPO_LOCAL !== undefined) {
    args.unshift(
      `-Dmaven.repo.local=${process.env.BPMN_MAVEN_REPO_LOCAL}`,
    );
  }
  try {
    await runCommand(
      path.join(runnerDirectory, "mvnw"),
      args,
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          JAVA_HOME: resolveJavaHome(),
        },
        timeoutMs: cibBridgeDeadlineMs(scenarios.length, process.env),
      },
    );
  } catch (error) {
    const exhausted = error instanceof CommandTimeoutError ? undefined : exhaustedHeapScenario(await bridgeLines(outputPath));
    if (exhausted !== undefined) throw new CibHeapExhaustedError(exhausted, error);
    throw wrapCibSevenMavenFailure(engineVersion, error);
  }
  return bridgeOutcomes(scenarios.map(({ id }) => id), await bridgeLines(outputPath));
}

/** The bridge's answer lines; a failed call may have written none, or no file at all. */
async function bridgeLines(outputPath: string): Promise<ReadonlyArray<string>> {
  const output = await readFile(outputPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Buffer.alloc(0);
    throw error;
  });
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(output)
    .split("\n")
    .filter((line) => line.length > 0);
}

/**
 * The harness schedule a scenario's evidence run uses. A scenario without incident options runs the plain schedule; one
 * with them runs the cancellation schedule when its stimuli cancel the incident's Process and the retry schedule
 * otherwise. Cancellability is no input, because CIB always offers public deletion. The consolidated profiles carry no
 * per-scenario identity, so the schedule follows the scenario itself, in step with `CibSevenRetainedEvidenceTest`.
 */
export function cibEvidenceEffectSchedule(
  scenario: Pick<ScenarioDocument, "options" | "stimuli">,
): "plainSuccess" | "incidentReportRetrySuccess" | "incidentReportCancel" {
  if (scenario.options?.incidents === undefined) return "plainSuccess";
  const cancels = scenario.stimuli.some((stimulus) =>
    stimulus.kind === "command" &&
    (stimulus["action"] as { readonly kind?: unknown } | undefined)?.kind === "cancelIncidentProcess");
  return cancels ? "incidentReportCancel" : "incidentReportRetrySuccess";
}

type Replacement = Readonly<{ relativePath: string; value: unknown }>;

/** A population run removed everything it created, under the profile's pinned producer. */
export function requireCleanPopulation(result: CibPopulationResult, profile: SemanticProfile): void {
  const { cleanup, engineVersion, databaseVersion } = result.diagnostics;
  if (Object.values(cleanup).some((count) => count !== 0)) {
    throw new Error(`CIB population ${result.scenarioId} did not clean up`);
  }
  if (engineVersion !== profile.oracle.version || databaseVersion !== profile.environment.database.split(" ")[1]) {
    throw new Error(`CIB producer identity differs for ${result.scenarioId}`);
  }
}

/**
 * The evidence of every population an evidence run covers (`populationEvidenceCases`). The bridge runs a population in
 * the default engine environment, the only one it runs in, so every population takes the plain schedule.
 */
async function populationReplacements(
  temporaryDirectory: string,
): Promise<Readonly<{ replacements: ReadonlyArray<Replacement>; failures: ReadonlyArray<string> }>> {
  const sources = await Promise.all(populationEvidenceCases(projectRoot).map(async (artifactCase) => {
    const scenario = await readJsonWithBytes<Readonly<{ id: string; profile: string }>>(artifactCase.scenarioRelativePath);
    const profile = await readJsonWithBytes<SemanticProfile>(`profiles/${scenario.value.profile}/profile.json`);
    return { artifactCase, scenario, profile };
  }));
  const replacements: Replacement[] = [];
  const failures: string[] = [];
  for (const [engineVersion, versionSources] of Map.groupBy(sources, ({ profile }) => profile.value.oracle.version)) {
    await runCibBatch([], temporaryDirectory, engineVersion, "plainSuccess");
    for (let start = 0; start < versionSources.length; start += cibBatchChunkSize) {
      const chunk = versionSources.slice(start, start + cibBatchChunkSize);
      const batch = await isolateResourceBreaches(
        chunk.map(({ scenario }) => scenario.value),
        (scenarios) => runCibBatch(scenarios, temporaryDirectory, engineVersion, "plainSuccess"),
        logSplit,
      );
      if (batch.results.length > 0) throw new Error("CIB answered a population with a single-instance result");
      failures.push(...batch.failures.map(({ scenarioId, failure }) => `${scenarioId}: ${failure}`));
      for (const result of batch.populations) {
        const source = chunk.find(({ scenario }) => scenario.value.id === result.scenarioId);
        if (source === undefined) throw new Error(`CIB answered population ${result.scenarioId}, which it was not asked`);
        requireCleanPopulation(result, source.profile.value);
        const { scenario, profile } = source;
        replacements.push({
          relativePath: source.artifactCase.evidenceRelativePath,
          value: populationEvidenceDocument(
            { id: scenario.value.id, bytes: scenario.bytes },
            {
              id: profile.value.id, bytes: profile.bytes, revision: profile.value.oracle.revision,
              java: profile.value.environment.java, database: profile.value.environment.database,
            },
            result,
          ),
        });
      }
    }
  }
  return { replacements, failures };
}

async function replaceEvidence() {
  const sources = await Promise.all(
    oracleEvidenceCases.map(async (artifactCase) => {
      const scenario = await readJsonWithBytes<ScenarioDocument>(
        artifactCase.scenarioRelativePath,
      );
      const profile = await readJsonWithBytes<SemanticProfile>(
        `profiles/${scenario.value.profile}/profile.json`,
      );
      return { artifactCase, scenario, profile };
    }),
  );
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-cib-evidence-"),
  );
  try {
    const sourcesByVersion = Map.groupBy(
      sources,
      ({ profile, scenario }) => JSON.stringify([
        profile.value.oracle.version,
        cibEvidenceEffectSchedule(scenario.value),
      ]),
    );
    const results: CibRunnerResult[] = [];
    const failures: string[] = [];
    for (const [group, versionSources] of sourcesByVersion) {
      const parsed: unknown = JSON.parse(group);
      if (
        !Array.isArray(parsed) ||
        typeof parsed[0] !== "string" ||
        (
          parsed[1] !== "plainSuccess" &&
          parsed[1] !== "incidentReportRetrySuccess" &&
          parsed[1] !== "incidentReportCancel"
        )
      ) {
        throw new TypeError("invalid CIB evidence replacement group");
      }
      const engineVersion = parsed[0];
      const effectSchedule = parsed[1];
      const scenarios = versionSources.map(({ scenario }) => scenario.value);
      await runCibBatch([], temporaryDirectory, engineVersion, effectSchedule);
      for (let start = 0; start < scenarios.length; start += cibBatchChunkSize) {
        const batch = await isolateResourceBreaches(
          scenarios.slice(start, start + cibBatchChunkSize),
          (chunk) => runCibBatch(chunk, temporaryDirectory, engineVersion, effectSchedule),
          logSplit,
        );
        results.push(...batch.results);
        failures.push(...batch.failures.map(({ scenarioId, failure }) => `${scenarioId}: ${failure}`));
      }
    }
    const failedIds = new Set(failures.map((failure) => failure.slice(0, failure.indexOf(": "))));
    const produced = sources.filter(({ scenario }) => !failedIds.has(scenario.value.id));
    const byScenario = new Map<string, CibRunnerResult>(
      results.map(
        (result) => [result.scenarioId, result] as const,
      ),
    );
    if (
      byScenario.size !== produced.length ||
      produced.some(
        ({ scenario }) => !byScenario.has(scenario.value.id),
      )
    ) {
      throw new Error("CIB evidence batch returned different scenarios");
    }

    const replacements = produced.map(
      ({ artifactCase, scenario, profile }) => {
        const result = byScenario.get(scenario.value.id);
        requireCleanDiagnostics(result);
        if (
          result.diagnostics.engineVersion !==
            profile.value.oracle.version ||
          result.diagnostics.databaseVersion !==
            profile.value.environment.database.split(" ")[1]
        ) {
          throw new Error(
            `CIB producer identity differs for ${scenario.value.id}`,
          );
        }
        return {
          relativePath: artifactCase.evidenceRelativePath,
          value: {
            kind: "cibSevenScenarioEvidence",
            scenario: {
              id: scenario.value.id,
              sha256: sha256(scenario.bytes),
            },
            profile: {
              id: profile.value.id,
              sha256: sha256(profile.bytes),
            },
            producer: {
              engine: "CIB Seven",
              engineVersion: result.diagnostics.engineVersion,
              engineRevision: profile.value.oracle.revision,
              runner: "cibseven-oracle",
              java: profile.value.environment.java,
              database: profile.value.environment.database,
              // The runner fails closed outside UTC (`CibSevenScenarioRunner.TIME_ZONE`).
              timeZone: "UTC",
            },
            producerObservations: {
              stateQueries: result.diagnostics.stateQueries,
              taskQueries: result.diagnostics.taskQueries,
              ...(result.diagnostics.messageSubscriptions.some(
                ({ subscriptions, addresslessReceiveWaits }) =>
                  subscriptions.length > 0 ||
                  (addresslessReceiveWaits?.length ?? 0) > 0,
              )
                ? {
                    messageSubscriptions:
                      result.diagnostics.messageSubscriptions,
                  }
                : {}),
              timerJobs: result.diagnostics.timerJobs,
              ...(result.diagnostics.effectJobs.some(
                ({ jobs }) => jobs.length > 0,
              )
                ? {
                    effectJobs: result.diagnostics.effectJobs,
                  }
                : {}),
              ...(result.diagnostics.incidentJobs !== undefined
                ? { incidentJobs: result.diagnostics.incidentJobs }
                : {}),
              ...(result.diagnostics.historicProcessStates !== undefined
                ? {
                    historicProcessStates:
                      result.diagnostics.historicProcessStates,
                  }
                : {}),
              ...(result.diagnostics.effectJobs.some(
                ({ jobs }) => jobs.length > 0,
              )
                ? {
                    effectExecutions:
                      result.diagnostics.effectExecutions,
                  }
                : {}),
              ...(result.diagnostics.mappingExecutions.length > 0
                ? {
                    mappingExecutions:
                      result.diagnostics.mappingExecutions,
                  }
                : {}),
            },
            projection: {
              id: "canonical-scenario-result",
            },
            result: {
              outcome: result.outcome,
              trace: result.trace,
            },
          },
        };
      },
    );
    const population = await populationReplacements(temporaryDirectory);
    failures.push(...population.failures);
    await Promise.all(
      [...replacements, ...population.replacements].map(({ relativePath, value }) =>
        writeFile(
          path.join(projectRoot, relativePath),
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        ),
      ),
    );
    process.stdout.write(
      `replaced ${replacements.length + population.replacements.length} content-bound CIB evidence artifacts\n`,
    );
    if (failures.length > 0) {
      throw new Error(`CIB could not run ${String(failures.length)} scenarios:\n${failures.join("\n")}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  requireReplacementAuthorization(process.argv.slice(2));
  await replaceEvidence();
}
