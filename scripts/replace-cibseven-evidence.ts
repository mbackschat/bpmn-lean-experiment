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

import type { ValidateFunction } from "ajv/dist/2020.js";

import { declaredCibHarnessFailures } from "./cib-declared-harness-failures.ts";
import type { DeclaredHarnessFailure } from "./cib-declared-harness-failures.ts";
import { parseShard, shardCases } from "./cib-evidence-shards.ts";
import type { Shard } from "./cib-evidence-shards.ts";
import { resolveCibSevenMavenTimeoutMs, wrapCibSevenMavenFailure } from "./cibseven-maven-budget.ts";
import { populationEvidenceDocument, populationEvidenceValidator } from "./cibseven-population-evidence.ts";
import type { CibPopulationResult, PopulationEvidenceCase } from "./cibseven-population-evidence.ts";
import { resolveJavaHome } from "./java-home.ts";
import { CommandTimeoutError, runCommand } from "./run-command.ts";
import { parseWireJson, parseWireJsonBytes } from "./strict-json.ts";
import { scenarioEvidenceValidator } from "./contract-artifacts.ts";
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

/**
 * Admits only `--replace`, optionally followed by `--shard <i>/<n>`, and returns the shard: the hosted replay runs one job
 * per shard (`cib-evidence-shards.ts`), while a replay without one covers every case.
 */
export function requireReplacementAuthorization(
  args: ReadonlyArray<string>,
): Shard | undefined {
  const sharded = args.length === 3 && args[1] === "--shard";
  if (args[0] !== "--replace" || (args.length !== 1 && !sharded)) {
    throw new Error(
      "CIB evidence replacement requires the exact --replace flag, optionally followed by --shard <i>/<n>",
    );
  }
  return sharded ? parseShard(args[2]!) : undefined;
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

/** The leading text of the failure a lone scenario records when it exceeded the batch deadline. */
const deadlineExceededFailure = "CIB_SCENARIO_DEADLINE_EXCEEDED";

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
    return `${deadlineExceededFailure} budgetMs=${String(error.cause.timeoutMs)}`;
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

type Replacement = Readonly<{ scenarioRelativePath: string; relativePath: string; value: unknown }>;

/** A case the replay could not answer: its scenario and the harness failure or schema violation that stopped it. */
export type CaseFailure = Readonly<{ scenarioRelativePath: string; failure: string }>;

/**
 * The replacements that meet their evidence schema, and one failure for each that does not: evidence the runner wrote
 * outside its contract is never retained, so the retake reports it beside the scenarios CIB could not run.
 */
export function admitReplacements(
  replacements: ReadonlyArray<Replacement>,
  validate: ValidateFunction,
): Readonly<{ admitted: ReadonlyArray<Replacement>; failures: ReadonlyArray<CaseFailure> }> {
  const admitted: Replacement[] = [];
  const failures: CaseFailure[] = [];
  for (const replacement of replacements) {
    if (validate(replacement.value)) admitted.push(replacement);
    else {
      failures.push({
        scenarioRelativePath: replacement.scenarioRelativePath,
        failure: `evidence violates its schema: ${JSON.stringify(validate.errors)}`,
      });
    }
  }
  return { admitted, failures };
}

function declaredFailureMatches(declaration: DeclaredHarnessFailure, failure: string): boolean {
  if (declaration.kind === "resource") {
    return failure === heapExhaustedFailure || failure.startsWith(`${deadlineExceededFailure} `);
  }
  return failure.startsWith(declaration.failure);
}

/**
 * How the cases a replay could not answer differ from their declaration (`cib-declared-harness-failures.ts`), one line
 * per difference: a failure of an undeclared scenario, a declared scenario that failed another way, and a declared
 * scenario of `covered` that did not fail. A declared scenario outside `covered` belongs to another shard's replay.
 */
export function harnessFailureDrift(
  covered: ReadonlyArray<string>,
  failures: ReadonlyArray<CaseFailure>,
  declared: ReadonlyMap<string, DeclaredHarnessFailure>,
): ReadonlyArray<string> {
  const drift: string[] = [];
  for (const { scenarioRelativePath, failure } of failures) {
    const declaration = declared.get(scenarioRelativePath);
    if (declaration === undefined) drift.push(`${scenarioRelativePath}: undeclared harness failure: ${failure}`);
    else if (!declaredFailureMatches(declaration, failure)) {
      drift.push(`${scenarioRelativePath}: failed otherwise than declared (${JSON.stringify(declaration)}): ${failure}`);
    }
  }
  const failed = new Set(failures.map(({ scenarioRelativePath }) => scenarioRelativePath));
  for (const scenarioRelativePath of covered) {
    if (declared.has(scenarioRelativePath) && !failed.has(scenarioRelativePath)) {
      drift.push(`${scenarioRelativePath}: declared as a harness failure, but CIB answered it`);
    }
  }
  return drift;
}

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
 * The evidence of every population in `cases`, all or one shard's part of those an evidence run covers
 * (`populationEvidenceCases`). The bridge runs a population in the default engine environment, the only one it runs in,
 * so every population takes the plain schedule.
 */
async function populationReplacements(
  cases: ReadonlyArray<PopulationEvidenceCase>,
  temporaryDirectory: string,
): Promise<Readonly<{ replacements: ReadonlyArray<Replacement>; failures: ReadonlyArray<CaseFailure> }>> {
  const sources = await Promise.all(cases.map(async (artifactCase) => {
    const scenario = await readJsonWithBytes<Readonly<{ id: string; profile: string }>>(artifactCase.scenarioRelativePath);
    const profile = await readJsonWithBytes<SemanticProfile>(`profiles/${scenario.value.profile}/profile.json`);
    return { artifactCase, scenario, profile };
  }));
  const replacements: Replacement[] = [];
  const failures: CaseFailure[] = [];
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
      const sourceOf = (scenarioId: string) => {
        const source = chunk.find(({ scenario }) => scenario.value.id === scenarioId);
        if (source === undefined) throw new Error(`CIB answered population ${scenarioId}, which it was not asked`);
        return source;
      };
      failures.push(...batch.failures.map(({ scenarioId, failure }) => ({
        scenarioRelativePath: sourceOf(scenarioId).artifactCase.scenarioRelativePath,
        failure,
      })));
      for (const result of batch.populations) {
        const source = sourceOf(result.scenarioId);
        requireCleanPopulation(result, source.profile.value);
        const { scenario, profile } = source;
        replacements.push({
          scenarioRelativePath: source.artifactCase.scenarioRelativePath,
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

async function replaceEvidence(shard: Shard | undefined) {
  const cases = shardCases(shard);
  const sources = await Promise.all(
    cases.scenarios.map(async (artifactCase) => {
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
    const failedIds = new Set<string>();
    const failures: CaseFailure[] = [];
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
        for (const { scenarioId, failure } of batch.failures) {
          const source = versionSources.find(({ scenario }) => scenario.value.id === scenarioId);
          if (source === undefined) throw new Error(`CIB failed scenario ${scenarioId}, which it was not asked`);
          failedIds.add(scenarioId);
          failures.push({ scenarioRelativePath: source.artifactCase.scenarioRelativePath, failure });
        }
      }
    }
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
          scenarioRelativePath: artifactCase.scenarioRelativePath,
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
    const population = await populationReplacements(cases.populations, temporaryDirectory);
    failures.push(...population.failures);
    const scenarioAdmission = admitReplacements(replacements, await scenarioEvidenceValidator(projectRoot));
    const populationAdmission = admitReplacements(population.replacements, await populationEvidenceValidator(projectRoot));
    failures.push(...scenarioAdmission.failures, ...populationAdmission.failures);
    const admitted = [...scenarioAdmission.admitted, ...populationAdmission.admitted];
    await Promise.all(
      admitted.map(({ relativePath, value }) =>
        writeFile(
          path.join(projectRoot, relativePath),
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        ),
      ),
    );
    process.stdout.write(
      `replaced ${admitted.length} content-bound CIB evidence artifacts\n`,
    );
    for (const { scenarioRelativePath, failure } of failures) {
      process.stdout.write(`CIB could not run ${scenarioRelativePath}: ${failure}\n`);
    }
    const drift = harnessFailureDrift(
      [...cases.scenarios, ...cases.populations].map(({ scenarioRelativePath }) => scenarioRelativePath),
      failures,
      declaredCibHarnessFailures,
    );
    if (drift.length > 0) {
      throw new Error(
        `CIB's harness failures differ from scripts/cib-declared-harness-failures.ts:\n${drift.join("\n")}`,
      );
    }
    process.stdout.write(`all ${String(failures.length)} harness failures are declared\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await replaceEvidence(requireReplacementAuthorization(process.argv.slice(2)));
}
