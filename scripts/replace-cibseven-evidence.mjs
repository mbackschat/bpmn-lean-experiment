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

import { artifactCases } from "./contract-artifacts.mjs";
import { resolveJavaHome } from "./java-home.mjs";
import { runCommand } from "./run-command.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function requireReplacementAuthorization(args) {
  if (
    args.length !== 1 ||
    args[0] !== "--replace"
  ) {
    throw new Error(
      "CIB evidence replacement requires the exact --replace flag",
    );
  }
}

async function readJsonWithBytes(relativePath) {
  const bytes = await readFile(path.join(projectRoot, relativePath));
  return {
    bytes,
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireCleanDiagnostics(result) {
  const cleanup = result?.diagnostics?.cleanup;
  if (
    cleanup === undefined ||
    Object.values(cleanup).some((count) => count !== 0)
  ) {
    throw new Error(
      `CIB scenario ${result?.scenarioId ?? "<unknown>"} did not clean up`,
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
}

async function runCibBatch(scenarios, temporaryDirectory) {
  const inputPath = path.join(temporaryDirectory, "scenarios.jsonl");
  const outputPath = path.join(temporaryDirectory, "results.jsonl");
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
    `-Dbpmn.pipeline.projectRoot=${projectRoot}`,
    `-Dbpmn.pipeline.input=${inputPath}`,
    `-Dbpmn.pipeline.output=${outputPath}`,
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
    .map((line) => JSON.parse(line));
}

async function replaceEvidence() {
  const sources = await Promise.all(
    artifactCases.map(async (artifactCase) => {
      const scenario = await readJsonWithBytes(
        artifactCase.scenarioRelativePath,
      );
      const profile = await readJsonWithBytes(
        `profiles/${scenario.value.profile}/profile.json`,
      );
      return { artifactCase, scenario, profile };
    }),
  );
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-cib-evidence-"),
  );
  try {
    const results = await runCibBatch(
      sources.map(({ scenario }) => scenario.value),
      temporaryDirectory,
    );
    const byScenario = new Map(
      results.map((result) => [result.scenarioId, result]),
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
              taskQueries: result.diagnostics.taskQueries,
              timerJobs: result.diagnostics.timerJobs,
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
