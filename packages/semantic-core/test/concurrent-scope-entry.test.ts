/**
 * CEA-OCCUR-01 entry consumes the arriving token of its parent. The oracle is the capsule's entry frame: a
 * successful entry removes exactly one `(input, parent)` token and issues a fresh child; without that token entry
 * refuses rather than issuing a child that consumed nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ControlStateKind, initialState } from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";

type ScopeRuntimeModule = typeof import("../src/semantic-process-scope-runtime.ts");
const { enterConcurrentChildScope } = await import(
  new URL("../dist/semantic-process-scope-runtime.js", import.meta.url).href
) as ScopeRuntimeModule;

const root = { processInstanceId: "I", definitionScopeId: "scope:P", activation: 1 };
const other = { processInstanceId: "I", definitionScopeId: "scope:S", activation: 1 };
const entry = { input: "merge-output", childEntry: "remediation-start", childScopeId: "scope:R" };

function running(tokens: RuntimeState["controlTokens"]): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: "I" },
    scopeOccurrences: [{ id: root, parent: null }, { id: other, parent: root }],
    scopeActivations: [{ elementId: "scope:P", count: 1 }, { elementId: "scope:S", count: 1 }],
    controlTokens: tokens,
  };
}

test("entry without the parent's arriving token is refused", () => {
  assert.equal(enterConcurrentChildScope(running([]), root, entry), null);
  // A token on the input place owned by another occurrence is not the parent's arriving token.
  assert.equal(enterConcurrentChildScope(running([{ placeId: entry.input, owner: other, multiplicity: 1 }]), root, entry),
    null);
});

test("entry consumes exactly the arriving token and issues a fresh child", () => {
  const entered = enterConcurrentChildScope(
    running([{ placeId: entry.input, owner: root, multiplicity: 2 }]), root, entry);
  assert.ok(entered !== null);
  const child = { processInstanceId: "I", definitionScopeId: "scope:R", activation: 1 };
  assert.deepEqual(entered.controlTokens.filter(({ placeId }) => placeId === entry.input),
    [{ placeId: entry.input, owner: root, multiplicity: 1 }]);
  assert.deepEqual(entered.controlTokens.filter(({ placeId }) => placeId === entry.childEntry),
    [{ placeId: entry.childEntry, owner: child, multiplicity: 1 }]);
  assert.ok(entered.scopeOccurrences.some(({ id }) => id.definitionScopeId === "scope:R" && id.activation === 1));
});
