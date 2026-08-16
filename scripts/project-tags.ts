import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCleanCommittedHead } from "./clean-committed-head.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export const ProjectTagKind = {
  Phase: "phase",
  Release: "release",
} as const;

export type ProjectTagKind = typeof ProjectTagKind[keyof typeof ProjectTagKind];

export type ProjectTagIdentity = Readonly<{
  kind: ProjectTagKind;
  identifier: string;
}>;

export type ProjectTagRequest = ProjectTagIdentity & Readonly<{
  message: string;
}>;

export type ProjectTagResult = Readonly<{
  name: string;
  status: "created" | "verified";
  target: string;
}>;

const phaseIdentifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const numericIdentifier = String.raw`(?:0|[1-9]\d*)`;
const prereleaseIdentifier = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semanticVersionPattern = new RegExp(
  String.raw`^${numericIdentifier}\.${numericIdentifier}\.${numericIdentifier}(?:-${prereleaseIdentifier}(?:\.${prereleaseIdentifier})*)?$`,
  "u",
);

type GitResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

function gitResult(repository: string, arguments_: ReadonlyArray<string>): GitResult {
  const result = spawnSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
  });
  if (result.status === null) {
    throw result.error ?? new Error(`git ${arguments_.join(" ")} did not exit`);
  }
  return {
    status: result.status,
    stdout: result.stdout.trimEnd(),
    stderr: result.stderr.trimEnd(),
  };
}

function git(repository: string, arguments_: ReadonlyArray<string>): string {
  const result = gitResult(repository, arguments_);
  if (result.status !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed with exit ${result.status}: ${result.stderr}`,
    );
  }
  return result.stdout;
}

/** Resolves a non-release phase or SemVer release identity into its disjoint tag namespace. */
export function projectTagName(identity: ProjectTagIdentity): string {
  switch (identity.kind) {
    case ProjectTagKind.Phase: {
      if (
        !phaseIdentifierPattern.test(identity.identifier)
        || /^m\d+$/u.test(identity.identifier)
        || identity.identifier === "mvp"
      ) {
        throw new Error(
          "phase identifier must be a descriptive lowercase kebab-case name outside the historical M1-M6/MVP namespace",
        );
      }
      return `phase/${identity.identifier}`;
    }
    case ProjectTagKind.Release: {
      if (!semanticVersionPattern.test(identity.identifier)) {
        throw new Error(
          "release identifier must follow Semantic Versioning without a leading v or build metadata",
        );
      }
      return `v${identity.identifier}`;
    }
  }
}

function assertMessage(message: string): void {
  if (message.trim() !== message || message.length === 0 || message.includes("\n")) {
    throw new Error("project tag requires one nonempty annotation message line without outer whitespace");
  }
}

function assertReleaseVersion(repository: string, request: ProjectTagRequest): void {
  if (request.kind !== ProjectTagKind.Release) {
    return;
  }
  const manifest = JSON.parse(
    readFileSync(path.join(repository, "package.json"), "utf8"),
  ) as Readonly<{ version?: unknown }>;
  if (manifest.version !== request.identifier) {
    throw new Error(
      `package.json version ${JSON.stringify(manifest.version)} does not match release ${request.identifier}`,
    );
  }
}

function assertAnnotatedTag(
  repository: string,
  name: string,
  expectedTarget?: string,
  expectedMessage?: string,
): string {
  const reference = `refs/tags/${name}`;
  if (git(repository, ["cat-file", "-t", reference]) !== "tag") {
    throw new Error(`project tag ${name} exists but is not annotated`);
  }
  const target = git(repository, ["rev-parse", `${reference}^{commit}`]);
  if (expectedTarget !== undefined && target !== expectedTarget) {
    throw new Error(`project tag ${name} targets ${target}, expected ${expectedTarget}`);
  }
  const message = git(repository, [
    "for-each-ref",
    reference,
    "--format=%(subject)",
  ]);
  if (expectedMessage !== undefined && message !== expectedMessage) {
    throw new Error(
      `project tag ${name} message is ${JSON.stringify(message)}, expected ${JSON.stringify(expectedMessage)}`,
    );
  }
  return target;
}

/** Creates or verifies one immutable annotated tag at a clean committed HEAD. */
export function createProjectTag(
  repository: string,
  request: ProjectTagRequest,
): ProjectTagResult {
  assertCleanCommittedHead(repository);
  const name = projectTagName(request);
  assertMessage(request.message);
  assertReleaseVersion(repository, request);
  const target = git(repository, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const reference = `refs/tags/${name}`;
  const existing = gitResult(repository, ["show-ref", "--verify", "--quiet", reference]);
  if (existing.status === 0) {
    assertAnnotatedTag(repository, name, target, request.message);
    return { name, status: "verified", target };
  }
  if (existing.status !== 1) {
    throw new Error(`could not inspect project tag ${name}: ${existing.stderr}`);
  }
  git(repository, [
    "tag",
    "--annotate",
    name,
    target,
    "--message",
    request.message,
  ]);
  assertAnnotatedTag(repository, name, target, request.message);
  return { name, status: "created", target };
}

function assertSupportedTagName(name: string): void {
  if (name.startsWith("phase/")) {
    projectTagName({ kind: ProjectTagKind.Phase, identifier: name.slice("phase/".length) });
    return;
  }
  if (name.startsWith("v")) {
    projectTagName({ kind: ProjectTagKind.Release, identifier: name.slice(1) });
    return;
  }
  throw new Error(`unsupported project tag name ${name}`);
}

/** Pushes one exact local tag and never moves or overwrites its remote reference. */
export function pushProjectTag(
  repository: string,
  remote: string,
  name: string,
): "pushed" | "verified" {
  assertSupportedTagName(name);
  assertAnnotatedTag(repository, name);
  const reference = `refs/tags/${name}`;
  const localObject = git(repository, ["rev-parse", "--verify", reference]);
  const remoteResult = git(repository, ["ls-remote", "--tags", remote, reference]);
  if (remoteResult.length !== 0) {
    const [remoteObject, remoteReference, ...extra] = remoteResult.split(/\s+/u);
    if (
      remoteObject === undefined
      || remoteReference !== reference
      || extra.length !== 0
      || remoteObject !== localObject
    ) {
      throw new Error(`remote tag ${name} at ${remote} conflicts with the local annotated tag object`);
    }
    return "verified";
  }
  git(repository, ["push", remote, reference]);
  const pushed = git(repository, ["ls-remote", "--tags", remote, reference]);
  if (pushed !== `${localObject}\t${reference}`) {
    throw new Error(`remote ${remote} did not retain exact project tag ${name}`);
  }
  return "pushed";
}

function parseKind(value: string | undefined): ProjectTagKind {
  switch (value) {
    case ProjectTagKind.Phase:
      return ProjectTagKind.Phase;
    case ProjectTagKind.Release:
      return ProjectTagKind.Release;
    default:
      throw new Error("tag kind must be phase or release");
  }
}

function runCli(): void {
  const [operation, kindArgument, identifier, ...options] = process.argv.slice(2);
  const kind = parseKind(kindArgument);
  if (identifier === undefined) {
    throw new Error("tag identifier is required");
  }
  const name = projectTagName({ kind, identifier });
  switch (operation) {
    case "create": {
      const messageIndex = options.indexOf("--message");
      const message = options[messageIndex + 1];
      const push = options.includes("--push");
      const allowedLength = push ? 3 : 2;
      if (
        messageIndex === -1
        || message === undefined
        || options.length !== allowedLength
        || options.some((option, index) =>
          index !== messageIndex
          && index !== messageIndex + 1
          && option !== "--push"
        )
      ) {
        throw new Error(
          "usage: node scripts/project-tags.ts create <phase|release> <identifier> --message <message> [--push]",
        );
      }
      const result = createProjectTag(projectRoot, {
        kind,
        identifier,
        message,
      });
      process.stdout.write(
        `PROJECT_TAG status=${result.status} name=${result.name} target=${result.target}\n`,
      );
      if (push) {
        const status = pushProjectTag(projectRoot, "origin", result.name);
        process.stdout.write(`PROJECT_TAG_PUSH status=${status} remote=origin name=${result.name}\n`);
      }
      return;
    }
    case "push": {
      if (options.length !== 0) {
        throw new Error(
          "usage: node scripts/project-tags.ts push <phase|release> <identifier>",
        );
      }
      const status = pushProjectTag(projectRoot, "origin", name);
      process.stdout.write(`PROJECT_TAG_PUSH status=${status} remote=origin name=${name}\n`);
      return;
    }
    default:
      throw new Error("tag operation must be create or push");
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`PROJECT_TAG_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
