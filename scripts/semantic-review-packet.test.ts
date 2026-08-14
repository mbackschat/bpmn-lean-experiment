import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assembleSemanticReviewPacket,
  type SemanticReviewPacketInput,
} from "./semantic-review-packet.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function stringField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

async function initializeReviewRepository(repository: string): Promise<void> {
  await mkdir(path.join(repository, "scripts"), { recursive: true });
  await mkdir(path.join(repository, "docs/capsules"), { recursive: true });
  await mkdir(path.join(repository, "BpmnSemantics"), { recursive: true });
  await copyFile(
    path.join(projectRoot, "scripts/semantic-review-packet.ts"),
    path.join(repository, "scripts/semantic-review-packet.ts"),
  );
  await copyFile(
    path.join(projectRoot, "scripts/semantic-review-text.ts"),
    path.join(repository, "scripts/semantic-review-text.ts"),
  );
  await writeFile(
    path.join(repository, "docs/capsules/EXAMPLE-PROPOSAL.md"),
    "# Example proposal\n\n## Selected rules\n\nOne exact rule.\n",
    "utf8",
  );
  await writeFile(
    path.join(repository, "BpmnSemantics/Example.lean"),
    "def example := true\n",
    "utf8",
  );
  await writeFile(
    path.join(repository, "gates.json"),
    JSON.stringify(packetInput.rootGates),
    "utf8",
  );
  const initialized = spawnSync("git", ["init", "--quiet"], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  commitAll(repository, "baseline");
}

function commitAll(repository: string, message: string): void {
  const added = spawnSync("git", ["add", "--all"], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(added.status, 0, added.stderr);
  const committed = spawnSync(
    "git",
    [
      "-c", "user.name=Review Packet Test",
      "-c", "user.email=review-packet@example.invalid",
      "commit", "--quiet", "-m", message,
    ],
    { cwd: repository, encoding: "utf8" },
  );
  assert.equal(committed.status, 0, committed.stderr);
}

function runPacketCli(repository: string) {
  return spawnSync(
    process.execPath,
    [
      "scripts/semantic-review-packet.ts",
      "--stage", "closure",
      "--baseline", "HEAD^",
      "--target", "HEAD",
      "--capsule", "docs/capsules/EXAMPLE-PROPOSAL.md",
      "--route", "docs/capsules/EXAMPLE-PROPOSAL.md::Selected rules",
      "--gates", "gates.json",
    ],
    { cwd: repository, encoding: "utf8" },
  );
}

const packetInput = {
  stage: "semantic-checkpoint",
  baseline: "a".repeat(40),
  target: "b".repeat(40),
  capsule: {
    path: "docs/capsules/EXAMPLE-PROPOSAL.md",
    sha256: "c".repeat(64),
  },
  changedFiles: [
    { path: "BpmnSemantics/Example.lean", added: 10, removed: 2 },
  ],
  routedSections: [
    {
      path: "docs/SEMANTIC-PROCESS-IL-SPEC.md",
      heading: "Runtime state",
      sha256: "d".repeat(64),
    },
  ],
  rootGates: [
    {
      command: "lake build BpmnSemantics.Example",
      exitStatus: 0,
      elapsedMs: 1200,
      outputSha256: "e".repeat(64),
    },
  ],
} as const satisfies SemanticReviewPacketInput;

test("the semantic review packet is deterministic and digest-sensitive", () => {
  const first = assembleSemanticReviewPacket(packetInput);
  const second = assembleSemanticReviewPacket(packetInput);
  const reorderedObjectKeys = assembleSemanticReviewPacket({
    stage: packetInput.stage,
    baseline: packetInput.baseline,
    target: packetInput.target,
    capsule: {
      sha256: packetInput.capsule.sha256,
      path: packetInput.capsule.path,
    },
    changedFiles: packetInput.changedFiles.map(({ path: filePath, added, removed }) => ({
      removed,
      added,
      path: filePath,
    })),
    routedSections: packetInput.routedSections.map(({ path: filePath, heading, sha256 }) => ({
      sha256,
      heading,
      path: filePath,
    })),
    rootGates: packetInput.rootGates.map(({ command, exitStatus, elapsedMs, outputSha256 }) => ({
      outputSha256,
      elapsedMs,
      exitStatus,
      command,
    })),
  });
  const permuted = assembleSemanticReviewPacket({
    ...packetInput,
    changedFiles: [
      { path: "z-last.ts", added: 1, removed: 0 },
      ...packetInput.changedFiles,
    ].reverse(),
    routedSections: [
      { path: "docs/Z.md", heading: "Z", sha256: "f".repeat(64) },
      ...packetInput.routedSections,
    ].reverse(),
    rootGates: [
      {
        command: "node --test z.test.ts",
        exitStatus: 0,
        elapsedMs: 2,
        outputSha256: "1".repeat(64),
      },
      ...packetInput.rootGates,
    ].reverse(),
  });
  const canonicalPermutation = assembleSemanticReviewPacket({
    ...packetInput,
    changedFiles: [...permuted.changedFiles].reverse(),
    routedSections: [...permuted.routedSections].reverse(),
    rootGates: [...permuted.rootGates].reverse(),
  });
  const changed = assembleSemanticReviewPacket({
    ...packetInput,
    rootGates: [{ ...packetInput.rootGates[0], elapsedMs: 1201 }],
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, reorderedObjectKeys);
  assert.deepEqual(permuted, canonicalPermutation);
  assert.match(first.packetSha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(first.packetSha256, changed.packetSha256);
});

test("the semantic review packet inventories binary evidence by exact byte digests", () => {
  const binaryChangedFile = {
    path: "showcase/platform-ui-quality/e2e/snapshots/execution-publication-ui-quality.spec.ts/chromium-1600/process-execution-diagram.png",
    binary: true,
    baselineSha256: null,
    targetSha256: "f".repeat(64),
  } as const;
  const packet = assembleSemanticReviewPacket({
    ...packetInput,
    changedFiles: [binaryChangedFile],
  });

  assert.deepEqual(packet.changedFiles, [binaryChangedFile]);
  assert.notEqual(
    packet.packetSha256,
    assembleSemanticReviewPacket({
      ...packetInput,
      changedFiles: [{ ...binaryChangedFile, targetSha256: "0".repeat(64) }],
    }).packetSha256,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      changedFiles: [{
        path: binaryChangedFile.path,
        binary: true,
        baselineSha256: null,
        targetSha256: null,
      }],
    } as unknown as SemanticReviewPacketInput),
    /binary change/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      changedFiles: [{ path: "BpmnSemantics/Example.lean", added: null, removed: 2 }],
    } as unknown as SemanticReviewPacketInput),
    /count/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      changedFiles: [{
        path: "BpmnSemantics/Example.lean",
        binary: true,
        baselineSha256: "f".repeat(64),
        targetSha256: "0".repeat(64),
      }],
    }),
    /registered binary artifact/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      changedFiles: [{
        path: "showcase/platform-ui-quality/e2e/snapshots/example.spec.ts/chromium-768/diagram.png",
        binary: true,
        baselineSha256: null,
        targetSha256: "0".repeat(64),
      }],
    }),
    /registered binary artifact/u,
  );
});

test("the semantic review packet CLI accepts registered PNG evidence and refuses binary source", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "semantic-review-binary-"));
  try {
    const pngRepository = path.join(temporaryRoot, "png");
    await initializeReviewRepository(pngRepository);
    const pngPath = "showcase/platform-ui-quality/e2e/snapshots/execution-publication-ui-quality.spec.ts/chromium-1600/process-execution-diagram.png";
    await mkdir(path.join(pngRepository, path.dirname(pngPath)), { recursive: true });
    await writeFile(path.join(pngRepository, pngPath), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]));
    commitAll(pngRepository, "add binary evidence");

    const pngResult = runPacketCli(pngRepository);
    assert.equal(pngResult.status, 0, pngResult.stderr);
    const pngPacket = JSON.parse(pngResult.stdout) as Readonly<{
      changedFiles: ReadonlyArray<Readonly<Record<string, unknown>>>;
    }>;
    const pngRecord = pngPacket.changedFiles.find((candidate) => candidate.path === pngPath);
    assert.deepEqual(pngRecord, {
      path: pngPath,
      binary: true,
      baselineSha256: null,
      targetSha256: "ad91235e882292469812e16da0b8fc77075a7c6d6f8760c24be14a5c792508cf",
    });

    const sourceRepository = path.join(temporaryRoot, "source");
    await initializeReviewRepository(sourceRepository);
    await writeFile(
      path.join(sourceRepository, "BpmnSemantics/Example.lean"),
      new Uint8Array([0x64, 0x65, 0x66, 0x20, 0x78, 0x00, 0x0a]),
    );
    commitAll(sourceRepository, "corrupt source");

    const sourceResult = runPacketCli(sourceRepository);
    assert.notEqual(sourceResult.status, 0);
    assert.match(sourceResult.stderr, /registered binary artifact/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("the semantic review packet rejects duplicate routes and malformed gates", () => {
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      routedSections: [packetInput.routedSections[0], packetInput.routedSections[0]],
    }),
    /repeats routed section/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      rootGates: [{ ...packetInput.rootGates[0], outputSha256: "not-a-digest" }],
    }),
    /outputSha256/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      routedSections: [{
        ...packetInput.routedSections[0],
        path: "./docs/SEMANTIC-PROCESS-IL-SPEC.md",
      }],
    }),
    /canonical repository-relative path/u,
  );
  assert.throws(
    () => assembleSemanticReviewPacket({
      ...packetInput,
      rootGates: [{
        ...packetInput.rootGates[0],
        elapsedMs: Number.MAX_SAFE_INTEGER + 1,
      }],
    }),
    /safe nonnegative integers/u,
  );
});

test("the packet source uses no locale-sensitive ordering", async () => {
  const source = await readFile(
    path.join(projectRoot, "scripts/semantic-review-packet.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /localeCompare/u);
});

test("the semantic review packet CLI resolves exact commits, sections, and numstat", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "semantic-review-packet-"));
  try {
    const gatesPath = path.join(temporaryRoot, "gates.json");
    await writeFile(gatesPath, JSON.stringify(packetInput.rootGates), "utf8");
    const arguments_ = [
      "--stage", "closure",
      "--baseline", "HEAD^",
      "--target", "HEAD",
      "--capsule", "docs/capsules/CALL-ACTIVITY-SPEC.md",
      "--route", "docs/capsules/CALL-ACTIVITY-SPEC.md::Selected rules",
      "--gates", gatesPath,
    ];
    const result = spawnSync(
      process.execPath,
      ["scripts/semantic-review-packet.ts", ...arguments_],
      { cwd: projectRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const packet: unknown = JSON.parse(result.stdout);
    assert.ok(isRecord(packet));
    assert.ok("baseline" in packet);
    assert.ok("target" in packet);
    assert.ok("changedFiles" in packet);
    assert.ok("routedSections" in packet);
    assert.ok("packetSha256" in packet);
    assert.ok(Array.isArray(packet.changedFiles));
    assert.ok(Array.isArray(packet.routedSections));
    const baseline = stringField(packet, "baseline");
    const target = stringField(packet, "target");
    const packetSha256 = stringField(packet, "packetSha256");
    assert.match(baseline, /^[0-9a-f]{40}$/u);
    assert.match(target, /^[0-9a-f]{40}$/u);
    const firstRoute: unknown = packet.routedSections[0];
    assert.ok(isRecord(firstRoute));
    assert.ok("heading" in firstRoute);
    assert.equal(firstRoute.heading, "Selected rules");
    assert.equal(packet.changedFiles.length > 0, true);
    assert.match(packetSha256, /^[0-9a-f]{64}$/u);

    const reversed = spawnSync(
      process.execPath,
      ["scripts/semantic-review-packet.ts", ...arguments_.map((value, index) => {
        if (arguments_[index - 1] === "--baseline") return "HEAD";
        if (arguments_[index - 1] === "--target") return "HEAD^";
        return value;
      })],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.notEqual(reversed.status, 0);
    assert.match(reversed.stderr, /baseline must be a strict ancestor/u);

    const missingSection = spawnSync(
      process.execPath,
      [
        "scripts/semantic-review-packet.ts",
        ...arguments_.map((value) => value === "docs/capsules/CALL-ACTIVITY-SPEC.md::Selected rules"
          ? "docs/capsules/CALL-ACTIVITY-SPEC.md::Missing section"
          : value),
      ],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.notEqual(missingSection.status, 0);
    assert.match(missingSection.stderr, /heading must occur exactly once/u);

    const duplicateStage = spawnSync(
      process.execPath,
      ["scripts/semantic-review-packet.ts", ...arguments_, "--stage", "proposal"],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.notEqual(duplicateStage.status, 0);
    assert.match(duplicateStage.stderr, /repeats singleton argument --stage/u);

    const extraFieldGatesPath = path.join(temporaryRoot, "extra-field-gates.json");
    await writeFile(
      extraFieldGatesPath,
      JSON.stringify([{ ...packetInput.rootGates[0], semanticConclusion: "approve" }]),
      "utf8",
    );
    const extraFieldGate = spawnSync(
      process.execPath,
      [
        "scripts/semantic-review-packet.ts",
        ...arguments_.map((value, index) =>
          arguments_[index - 1] === "--gates" ? extraFieldGatesPath : value),
      ],
      { cwd: projectRoot, encoding: "utf8" },
    );
    assert.notEqual(extraFieldGate.status, 0);
    assert.match(extraFieldGate.stderr, /exactly command, exitStatus, elapsedMs, and outputSha256/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
