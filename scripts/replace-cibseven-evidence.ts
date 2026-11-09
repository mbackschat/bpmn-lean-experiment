import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type BatchOutcome<Result> = Readonly<{ results: ReadonlyArray<Result>; failure: string | null }>;

/**
 * Runs `items` in chunks through `run`, which answers the results of the leading items it ran and, when it stopped early,
 * the failure of the next item. That item is recorded as a harness failure and the rest of its chunk runs again, so one
 * scenario CIB cannot run costs one more invocation instead of the whole batch.
 */
export async function runIsolatedBatches<Item, Result>(
  items: ReadonlyArray<Item>,
  chunkSize: number,
  run: (items: ReadonlyArray<Item>) => Promise<BatchOutcome<Result>>,
): Promise<Readonly<{ results: ReadonlyArray<Result>; failures: ReadonlyArray<Readonly<{ item: Item; failure: string }>> }>> {
  const results: Result[] = [];
  const failures: Array<Readonly<{ item: Item; failure: string }>> = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    let rest = items.slice(start, start + chunkSize);
    while (rest.length > 0) {
      const outcome = await run(rest);
      results.push(...outcome.results);
      if (outcome.failure === null) {
        if (outcome.results.length !== rest.length) {
          throw new Error(`CIB batch returned ${String(outcome.results.length)} results for ${String(rest.length)} scenarios`);
        }
        break;
      }
      failures.push({ item: rest[outcome.results.length]!, failure: outcome.failure });
      rest = rest.slice(outcome.results.length + 1);
    }
  }
  return { results, failures };
}

/**
 * The scenario error an export-bridge run reports, or `null` when the failure is not one scenario's: a deadline, a build
 * or an environment failure fails the whole replacement and is never attributed to the scenario that happened to be next.
 */
export function scenarioFailureOf(error: unknown): string | null {
  if (error instanceof CommandTimeoutError || !(error instanceof Error)) return null;
  if (!error.message.includes("Tests run: 1, Failures: 0, Errors: 1")) return null;
  return /exportsCanonicalScenarioBatch\b.*<<< ERROR!\n(.+)/u.exec(error.message)?.[1]?.trim() ?? null;
}

async function runCibBatch(
  scenarios: ReadonlyArray<ScenarioDocument>,
  temporaryDirectory: string,
  engineVersion: string,
  effectSchedule:
    | "plainSuccess"
    | "incidentReportRetrySuccess"
    | "incidentReportCancel",
): Promise<BatchOutcome<CibRunnerResult>> {
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
  let failure: string | null = null;
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
        timeoutMs: 30_000,
      },
    );
  } catch (error: unknown) {
    failure = scenarioFailureOf(error);
    if (failure === null) throw error;
  }
  // The bridge flushes each result as it finishes, so the results of a stopped run are those of its leading scenarios.
  const output = existsSync(outputPath) ? await readFile(outputPath) : Buffer.alloc(0);
  const results = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(output)
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) =>
      parseWireJson<CibRunnerResult>(
        line,
        `CIB result line ${index + 1}`,
      ));
  return { results, failure };
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
      const batch = await runIsolatedBatches(
        versionSources.map(({ scenario }) => scenario.value),
        cibBatchChunkSize,
        (scenarios) => runCibBatch(scenarios, temporaryDirectory, engineVersion, effectSchedule),
      );
      results.push(...batch.results);
      failures.push(...batch.failures.map(({ item, failure }) => `${item.id}: ${failure}`));
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
    await Promise.all(
      replacements.map(({ relativePath, value }) =>
        writeFile(
          path.join(projectRoot, relativePath),
          `${JSON.stringify(value, null, 2)}\n`,
          "utf8",
        ),
      ),
    );
    process.stdout.write(
      `replaced ${replacements.length} content-bound CIB evidence artifacts\n`,
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
