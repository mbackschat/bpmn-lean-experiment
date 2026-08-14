import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    path: "evidence/diagram.png",
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
        path: "evidence/diagram.png",
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
