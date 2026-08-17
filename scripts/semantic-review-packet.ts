import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareExactStrings,
  exactSecondLevelSection,
  sha256,
} from "./semantic-review-text.ts";
import {
  loadDocumentMigrationMatrix,
  type ValidatedDocumentMigrationMatrix,
} from "./document-migration-matrix.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const digestPattern = /^[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const uiSnapshotPattern =
  /^showcase\/platform-ui-quality\/e2e\/snapshots\/execution-publication-ui-quality\.spec\.ts\/chromium-1600\/process-execution-diagram\.png$/u;
const mavenWrapperJar = "runners/cibseven/.mvn/wrapper/maven-wrapper.jar";

const ReviewPacketStage = Object.freeze({
  Proposal: "proposal",
  SemanticCheckpoint: "semantic-checkpoint",
  CombinedCheckpointClosure: "combined-checkpoint-closure",
  Closure: "closure",
} as const);

type ReviewPacketStage =
  (typeof ReviewPacketStage)[keyof typeof ReviewPacketStage];

function parseReviewPacketStage(value: string): ReviewPacketStage {
  switch (value) {
    case ReviewPacketStage.Proposal:
    case ReviewPacketStage.SemanticCheckpoint:
    case ReviewPacketStage.CombinedCheckpointClosure:
    case ReviewPacketStage.Closure:
      return value;
    default:
      throw new Error(`unknown semantic review stage: ${value}`);
  }
}

type ReviewPacketChangedTextFile = Readonly<{
  path: string;
  added: number;
  removed: number;
}>;

type ReviewPacketChangedBinaryFile = Readonly<{
  path: string;
  binary: true;
  baselineSha256: string | null;
  targetSha256: string | null;
}>;

/** Text changes carry exact line counts; binary evidence carries exact before/after byte digests. */
export type ReviewPacketChangedFile =
  | ReviewPacketChangedTextFile
  | ReviewPacketChangedBinaryFile;

export type ReviewPacketSection = Readonly<{
  path: string;
  heading: string;
  sha256: string;
}>;

export type ReviewPacketGate = Readonly<{
  command: string;
  exitStatus: number;
  elapsedMs: number;
  outputSha256: string;
}>;

export type SemanticReviewPacketInput = Readonly<{
  stage: ReviewPacketStage;
  baseline: string;
  target: string;
  capsule: Readonly<{ path: string; sha256: string }>;
  changedFiles: ReadonlyArray<ReviewPacketChangedFile>;
  routedSections: ReadonlyArray<ReviewPacketSection>;
  rootGates: ReadonlyArray<ReviewPacketGate>;
  migrationMatrix?: ValidatedDocumentMigrationMatrix;
}>;

export type SemanticReviewPacket = SemanticReviewPacketInput & Readonly<{
  kind: "semanticReviewPacket";
  packetSha256: string;
}>;

function assertRepositoryPath(value: string, label: string): void {
  if (
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    path.posix.normalize(value) !== value ||
    value === ".." ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new Error(`${label} must be a canonical repository-relative path`);
  }
}

/** Keeps Git's binary detection subordinate to the repository's closed artifact ownership. */
function assertRegisteredBinaryArtifact(filePath: string): void {
  if (filePath !== mavenWrapperJar && !uiSnapshotPattern.test(filePath)) {
    throw new Error(
      `${filePath} is classified as binary but is not a registered binary artifact; ` +
        "reviewable source and text must retain exact line counts",
    );
  }
}

function assertUnique<T>(
  values: ReadonlyArray<T>,
  keyOf: (value: T) => string,
  label: string,
): void {
  const keys = values.map(keyOf);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`semantic review packet repeats ${label}`);
  }
}

const gateRecordKeys = ["command", "elapsedMs", "exitStatus", "outputSha256"];

function assertExactGateRecord(value: unknown): asserts value is ReviewPacketGate {
  if (typeof value !== "object" || value === null) {
    throw new Error("each root gate record must be an object");
  }
  const keys = Object.keys(value).sort(compareExactStrings);
  if (
    keys.length !== gateRecordKeys.length ||
    keys.some((key, index) => key !== gateRecordKeys[index])
  ) {
    throw new Error(
      "each root gate record needs exactly command, exitStatus, elapsedMs, and outputSha256",
    );
  }
  if (
    !("command" in value) ||
    !("exitStatus" in value) ||
    !("elapsedMs" in value) ||
    !("outputSha256" in value) ||
    typeof value.command !== "string" ||
    typeof value.exitStatus !== "number" ||
    typeof value.elapsedMs !== "number" ||
    typeof value.outputSha256 !== "string" ||
    value.command.trim().length === 0 ||
    !digestPattern.test(value.outputSha256)
  ) {
    throw new Error("each root gate needs a command and outputSha256");
  }
  if (
    !Number.isSafeInteger(value.exitStatus) ||
    value.exitStatus < 0 ||
    !Number.isSafeInteger(value.elapsedMs) ||
    value.elapsedMs < 0
  ) {
    throw new Error("root gate status and elapsed time must be safe nonnegative integers");
  }
}

/** Assembles and hashes a neutral review-routing packet without semantic conclusions. */
export function assembleSemanticReviewPacket(
  input: SemanticReviewPacketInput,
): SemanticReviewPacket {
  parseReviewPacketStage(input.stage);
  if (!commitPattern.test(input.baseline) || !commitPattern.test(input.target)) {
    throw new Error("baseline and target must be full commit hashes");
  }
  assertRepositoryPath(input.capsule.path, "capsule");
  if (!digestPattern.test(input.capsule.sha256)) {
    throw new Error("capsule sha256 must be a lowercase SHA-256 digest");
  }
  if (input.routedSections.length === 0) {
    throw new Error("semantic review packet needs at least one routed section");
  }
  if (input.rootGates.length === 0) {
    throw new Error("semantic review packet needs at least one root gate record");
  }

  for (const changedFile of input.changedFiles) {
    assertRepositoryPath(changedFile.path, "changed file");
    if ("binary" in changedFile) {
      assertRegisteredBinaryArtifact(changedFile.path);
      if (
        changedFile.binary !== true ||
        (changedFile.baselineSha256 !== null && !digestPattern.test(changedFile.baselineSha256)) ||
        (changedFile.targetSha256 !== null && !digestPattern.test(changedFile.targetSha256)) ||
        (changedFile.baselineSha256 === null && changedFile.targetSha256 === null)
      ) {
        throw new Error(`${changedFile.path} binary change needs an exact baseline or target SHA-256`);
      }
      continue;
    }
    for (const [label, count] of [["added", changedFile.added], ["removed", changedFile.removed]] as const) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(
          `${changedFile.path} ${label} count must be a nonnegative integer; an uncountable file cannot enter a review inventory`,
        );
      }
    }
  }
  for (const section of input.routedSections) {
    assertRepositoryPath(section.path, "routed section");
    if (section.heading.length === 0 || !digestPattern.test(section.sha256)) {
      throw new Error("each routed section needs a heading and lowercase SHA-256 digest");
    }
  }
  for (const gate of input.rootGates) {
    assertExactGateRecord(gate);
  }
  assertUnique(input.changedFiles, ({ path: filePath }) => filePath, "changed file");
  assertUnique(
    input.routedSections,
    ({ path: filePath, heading }) => `${filePath}\u0000${heading}`,
    "routed section",
  );
  assertUnique(input.rootGates, ({ command }) => command, "root gate command");
  if (input.migrationMatrix !== undefined) {
    if (!digestPattern.test(input.migrationMatrix.exactBytesSha256)) {
      throw new Error("migration matrix needs an exact byte SHA-256");
    }
    if (
      input.migrationMatrix.normalized.baseline !== input.baseline ||
      input.migrationMatrix.normalized.target !== input.target
    ) {
      throw new Error("migration matrix commits must equal packet commits");
    }
  }

  const body: SemanticReviewPacketInput & { readonly kind: "semanticReviewPacket" } = {
    kind: "semanticReviewPacket",
    stage: input.stage,
    baseline: input.baseline,
    target: input.target,
    capsule: {
      path: input.capsule.path,
      sha256: input.capsule.sha256,
    },
    changedFiles: [...input.changedFiles]
      .sort((left, right) => compareExactStrings(left.path, right.path))
      .map((changedFile) => "binary" in changedFile
        ? {
            path: changedFile.path,
            binary: true as const,
            baselineSha256: changedFile.baselineSha256,
            targetSha256: changedFile.targetSha256,
          }
        : {
            path: changedFile.path,
            added: changedFile.added,
            removed: changedFile.removed,
          }),
    routedSections: [...input.routedSections]
      .sort((left, right) =>
        compareExactStrings(left.path, right.path) ||
        compareExactStrings(left.heading, right.heading))
      .map(({ path: filePath, heading, sha256: sectionSha256 }) => ({
        path: filePath,
        heading,
        sha256: sectionSha256,
      })),
    rootGates: [...input.rootGates]
      .sort((left, right) => compareExactStrings(left.command, right.command))
      .map(({ command, exitStatus, elapsedMs, outputSha256 }) => ({
        command,
        exitStatus,
        elapsedMs,
        outputSha256,
      })),
    ...(input.migrationMatrix === undefined
      ? {}
      : { migrationMatrix: input.migrationMatrix }),
  };
  return {
    ...body,
    packetSha256: sha256(JSON.stringify(body)),
  };
}

type CliArguments = Readonly<{
  stage: ReviewPacketStage;
  baseline: string;
  target: string;
  capsule: string;
  routes: ReadonlyArray<string>;
  gatesPath: string;
  migrationMatrixPath?: string;
}>;

function parseCliArguments(arguments_: ReadonlyArray<string>): CliArguments {
  let stage: string | undefined;
  let baseline: string | undefined;
  let target: string | undefined;
  let capsule: string | undefined;
  let gatesPath: string | undefined;
  let migrationMatrixPath: string | undefined;
  const routes: string[] = [];
  const seenSingletonFlags = new Set<string>();
  const handlers = new Map<string, (value: string) => void>([
    ["--stage", (value) => { stage = value; }],
    ["--baseline", (value) => { baseline = value; }],
    ["--target", (value) => { target = value; }],
    ["--capsule", (value) => { capsule = value; }],
    ["--route", (value) => { routes.push(value); }],
    ["--gates", (value) => { gatesPath = value; }],
    ["--migration-matrix", (value) => { migrationMatrixPath = value; }],
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (flag === undefined || value === undefined || value.length === 0) {
      throw new Error(`unknown or valueless review-packet argument: ${flag ?? "<missing>"}`);
    }
    const handler = handlers.get(flag);
    if (handler === undefined) {
      throw new Error(`unknown or valueless review-packet argument: ${flag}`);
    }
    if (flag !== "--route") {
      if (seenSingletonFlags.has(flag)) {
        throw new Error(`review packet repeats singleton argument ${flag}`);
      }
      seenSingletonFlags.add(flag);
    }
    handler(value);
  }
  if (
    stage === undefined ||
    baseline === undefined ||
    target === undefined ||
    capsule === undefined ||
    gatesPath === undefined
  ) {
    throw new Error("--stage, --baseline, --target, --capsule, and --gates are required");
  }
  assertRepositoryPath(capsule, "capsule");
  return {
    stage: parseReviewPacketStage(stage),
    baseline,
    target,
    capsule,
    routes,
    gatesPath,
    ...(migrationMatrixPath === undefined ? {} : { migrationMatrixPath }),
  };
}

function gitText(arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function exactCommit(revision: string): string {
  return gitText(["rev-parse", "--verify", `${revision}^{commit}`]).trim();
}

function isAncestor(ancestor: string, descendant: string): boolean {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`cannot compare commits ${ancestor} and ${descendant}`);
  }
  return result.status === 0;
}

function parseNumstat(baseline: string, target: string): ReadonlyArray<ReviewPacketChangedFile> {
  const result = spawnSync(
    "git",
    ["diff", "--numstat", "--no-renames", "-z", baseline, target],
    { cwd: projectRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`git diff --numstat failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\u0000").filter(Boolean).map((record) => {
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      throw new Error("git numstat returned an invalid record");
    }
    const addedText = record.slice(0, firstTab);
    const removedText = record.slice(firstTab + 1, secondTab);
    const filePath = record.slice(secondTab + 1);
    if (addedText === "-" && removedText === "-") {
      assertRegisteredBinaryArtifact(filePath);
      return {
        path: filePath,
        binary: true,
        baselineSha256: gitBlobSha256(baseline, filePath),
        targetSha256: gitBlobSha256(target, filePath),
      };
    }
    if (addedText === "-" || removedText === "-") {
      throw new Error(`git returned inconsistent binary line counts for ${filePath}`);
    }
    return { path: filePath, added: Number(addedText), removed: Number(removedText) };
  });
}

function gitBlobSha256(revision: string, filePath: string): string | null {
  const object = `${revision}:${filePath}`;
  const exists = spawnSync("git", ["cat-file", "-e", object], {
    cwd: projectRoot,
    stdio: "ignore",
  });
  if (exists.status !== 0) return null;
  const result = spawnSync("git", ["show", object], {
    cwd: projectRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git show ${object} failed: ${String(result.stderr)}`);
  }
  return sha256(result.stdout);
}

function parseRoutes(target: string, routes: ReadonlyArray<string>): ReadonlyArray<ReviewPacketSection> {
  return routes.map((route) => {
    const separator = route.indexOf("::");
    if (separator <= 0 || separator === route.length - 2) {
      throw new Error(`route must use <path>::<level-two-heading>: ${route}`);
    }
    const filePath = route.slice(0, separator);
    const heading = route.slice(separator + 2);
    assertRepositoryPath(filePath, "routed section");
    const document = gitText(["show", `${target}:${filePath}`]);
    return { path: filePath, heading, sha256: sha256(exactSecondLevelSection(document, heading)) };
  });
}

function parseGateRecords(gatesPath: string): ReadonlyArray<ReviewPacketGate> {
  const value: unknown = JSON.parse(readFileSync(gatesPath, "utf8"));
  if (!Array.isArray(value)) {
    throw new Error("--gates must contain a JSON array");
  }
  return value.map((gate): ReviewPacketGate => {
    assertExactGateRecord(gate);
    return gate;
  });
}

function runCli(arguments_: ReadonlyArray<string>): void {
  const parsed = parseCliArguments(arguments_);
  const baseline = exactCommit(parsed.baseline);
  const target = exactCommit(parsed.target);
  if (baseline === target || !isAncestor(baseline, target)) {
    throw new Error("baseline must be a strict ancestor of target");
  }
  if (!isAncestor(target, "HEAD")) {
    throw new Error("target must be an ancestor of HEAD");
  }
  const capsuleDocument = gitText(["show", `${target}:${parsed.capsule}`]);
  const migrationMatrix = parsed.migrationMatrixPath === undefined
    ? undefined
    : loadDocumentMigrationMatrix({
        repositoryRoot: projectRoot,
        matrixPath: parsed.migrationMatrixPath,
        baseline,
        target,
      });
  const packet = assembleSemanticReviewPacket({
    stage: parsed.stage,
    baseline,
    target,
    capsule: { path: parsed.capsule, sha256: sha256(capsuleDocument) },
    changedFiles: parseNumstat(baseline, target),
    routedSections: parseRoutes(target, parsed.routes),
    rootGates: parseGateRecords(parsed.gatesPath),
    ...(migrationMatrix === undefined ? {} : { migrationMatrix }),
  });
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SEMANTIC_REVIEW_PACKET_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
