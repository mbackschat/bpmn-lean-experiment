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

import { artifactCases } from "./contract-artifact-cases.ts";
import { resolveJavaHome } from "./java-home.ts";
import { runCommand } from "./run-command.ts";
import { parseStrictJson } from "./strict-json.ts";
import type {
  Scenario,
  ScenarioResult,
} from "../packages/semantic-core/src/index.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

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
  outcome: ScenarioResult["outcome"];
  trace: ScenarioResult["trace"];
  diagnostics: Readonly<{
    engineVersion: string;
    databaseVersion: string;
    cleanup: Readonly<Record<string, number>>;
    stateQueries: ReadonlyArray<unknown>;
    taskQueries: ReadonlyArray<unknown>;
    messageSubscriptions: ReadonlyArray<Readonly<{
      subscriptions: ReadonlyArray<unknown>;
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
    value: parseStrictJson<Value>(
      bytes.toString("utf8"),
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

async function runCibBatch(
  scenarios: ReadonlyArray<Scenario>,
  temporaryDirectory: string,
  engineVersion: string,
  effectSchedule:
    | "plainSuccess"
    | "incidentReportRetrySuccess"
    | "incidentReportCancel",
): Promise<ReadonlyArray<CibRunnerResult>> {
  const inputPath = path.join(
    temporaryDirectory,
    `scenarios-${engineVersion}.jsonl`,
  );
  const outputPath = path.join(
    temporaryDirectory,
    `results-${engineVersion}.jsonl`,
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
  return (await readFile(outputPath, "utf8"))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) =>
      parseStrictJson<CibRunnerResult>(
        line,
        `CIB result line ${index + 1}`,
      ));
}

export function cibEvidenceEffectSchedule(
  profileId: string,
): "plainSuccess" | "incidentReportRetrySuccess" | "incidentReportCancel" {
  switch (profileId) {
    case "cibseven-2.2.0-service-task-incident-draft":
      return "incidentReportRetrySuccess";
    case "cibseven-2.2.0-service-task-incident-cancellation-draft":
      return "incidentReportCancel";
    default:
      return "plainSuccess";
  }
}

async function replaceEvidence() {
  const sources = await Promise.all(
    artifactCases.map(async (artifactCase) => {
      const scenario = await readJsonWithBytes<Scenario>(
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
      ({ profile }) => JSON.stringify([
        profile.value.oracle.version,
        cibEvidenceEffectSchedule(profile.value.id),
      ]),
    );
    const results: CibRunnerResult[] = [];
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
      results.push(
        ...await runCibBatch(
          versionSources.map(({ scenario }) => scenario.value),
          temporaryDirectory,
          engineVersion,
          effectSchedule,
        ),
      );
    }
    const byScenario = new Map<string, CibRunnerResult>(
      results.map(
        (result) => [result.scenarioId, result] as const,
      ),
    );
    if (
      byScenario.size !== sources.length ||
      sources.some(
        ({ scenario }) => !byScenario.has(scenario.value.id),
      )
    ) {
      throw new Error("CIB evidence batch returned different scenarios");
    }

    const replacements = sources.map(
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
                ({ subscriptions }) => subscriptions.length > 0,
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
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  requireReplacementAuthorization(process.argv.slice(2));
  await replaceEvidence();
}
