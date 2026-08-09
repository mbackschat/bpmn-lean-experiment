/**
 * Locks the Workflow-safe typed-tuple encoder and SHA-256 implementation at the cross-language boundary.
 *
 * Known-answer vectors cover SHA-256 padding boundaries. Native-crypto comparisons are test-only:
 * Workflow code must remain independent of Node APIs while producing the same bytes and digest.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  canonicalTypedTupleEncoding,
  deterministicSha256Hex,
} from "@bpmn-lean/temporal-testkit";
import type { CanonicalTupleValue } from "@bpmn-lean/temporal-testkit";

const knownAnswerVectors: ReadonlyArray<readonly [string, string]> = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  ["a".repeat(55), "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
  ["a".repeat(56), "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
  ["a".repeat(57), "f13b2d724659eb3bf47f2dd6af1accc87b81f09f59f2b75e5c0bed6589dfe8c6"],
  ["a".repeat(63), "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34"],
  ["a".repeat(64), "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"],
  ["a".repeat(65), "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0"],
  ["😀", "f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9"],
];

test("matches SHA-256 known-answer vectors across padding boundaries", () => {
  for (const [input, expected] of knownAnswerVectors) {
    assert.equal(deterministicSha256Hex(input), expected);
  }
});

test("matches native SHA-256 for the proposed multi-block effect transport bytes", () => {
  const encoding = canonicalTypedTupleEncoding([
    "effectTransport",
    [
      "profile:service-task-effect-v1",
      "service-task-effect/process.bpmn",
      "a".repeat(64),
      "Process_ServiceTaskEffect",
    ],
    ["Instance_1", "ServiceTask_Record", 1],
    [
      "urn:bpmn-lean:effect-protocol:activity-v1",
      "urn:bpmn-lean:effect-operation:probe-v1",
    ],
  ]);
  assert.ok(Buffer.byteLength(encoding, "utf8") > 64);
  assert.equal(
    deterministicSha256Hex(encoding),
    createHash("sha256").update(encoding, "utf8").digest("hex"),
  );
});

test("encodes only nested strings and non-negative safe integers", () => {
  assert.equal(
    canonicalTypedTupleEncoding(["domain", ["😀", 0, 9007199254740991]]),
    '["domain",["😀",0,9007199254740991]]',
  );
  // Every rejected case is deliberately outside `CanonicalTupleValue`, so the
  // list stays untyped input for the runtime validator under test.
  const invalidTuples: ReadonlyArray<ReadonlyArray<unknown>> = [
    ["domain", -1],
    ["domain", 1.5],
    ["domain", 9007199254740992],
    ["domain", "\ud800"],
    ["domain", null],
    ["domain", { value: "object" }],
  ];
  for (const invalid of invalidTuples) {
    assert.throws(
      () =>
        canonicalTypedTupleEncoding(
          invalid as ReadonlyArray<CanonicalTupleValue>,
        ),
      /canonical typed-tuple value/,
    );
  }
});

test("rejects a non-scalar input before Workflow-safe UTF-8 encoding", () => {
  assert.throws(
    () => deterministicSha256Hex("\ud800"),
    /well-formed Unicode scalar string/,
  );
});
