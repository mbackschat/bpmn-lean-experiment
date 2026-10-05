import assert from "node:assert/strict";
import { test } from "node:test";
import { SemanticOperationKind as Kind, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { SemanticOperation } from "@bpmn-lean/semantic-core";
import { assessTemporalHostCapability, TemporalHostCapabilityResultKind } from "../dist/index.js";
import { program } from "./semantic-publication-fixture.ts";

const origin = { kind: SemanticOriginKind.BpmnElement, elementId: "Batch" } as const;
const entry: SemanticOperation = { id: "enter", kind: Kind.EnterSequentialMultiInstanceScope, origin,
  input: "incoming", childEntry: "child", childScopeId: "body", normalOutput: "outgoing",
  collectionName: "items", itemName: "item", bodyInputs: [], completionBooleanName: null };
const completion: SemanticOperation = { id: "complete", kind: Kind.CompleteSequentialMultiInstanceScope,
  origin, entryOperationId: entry.id };

test("MI Sub-Process representations cannot reach hosting before repeated-scope qualification", () => {
  for (const additions of [[entry], [completion], [entry, completion]]) {
    const result = assessTemporalHostCapability({ ...program, operations: [...program.operations, ...additions] });
    assert.equal(result.kind, TemporalHostCapabilityResultKind.Rejected);
    assert.ok(result.kind === TemporalHostCapabilityResultKind.Rejected);
    assert.equal(result.failure.code, "sequentialSubProcessQualificationUnavailable");
  }
});
