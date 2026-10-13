/**
 * Locks the command boundary of the serial portable-value handoff: Start carries exactly one P_in binding and
 * each completion exactly its task's DataOutput binding, both a SingletonBusinessItem, and every refusal leaves the
 * complete committed state untouched so a later valid completion still commits.
 *
 * Wire validity, profile eligibility and typed command refusal are separate outcomes here: a typed value outside the
 * selected domain is a rejection and an unsupported scenario, never a malformed value.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome, SemanticProfileId, applyStimulus, initialState, isVariableValue, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, Stimulus, VariableBinding, VariableValue } from "@bpmn-lean/semantic-core";
import {
  binding, completion, decimal, emptyMap, handoffProgram, integer, list, nothing, order, output, renamed, revision,
  reviewArchive, start, stringList, text, truth,
} from "./portable-handoff-fixture.ts";

const program = handoffProgram();
const names = reviewArchive;

function committed(state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  return result.state;
}

function refused(state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

const atReview = () => committed(initialState, start(order));

test("Start accepts a nested order, a present Null and an empty Map, and refuses a root List", () => {
  for (const value of [order, nothing, emptyMap, text("scalar"), truth(true), integer(7), decimal("-125", 2)]) {
    assert.equal(supportsSemanticProcessExecution(start(value), program), true, JSON.stringify(value));
    committed(initialState, start(value));
  }
  for (const [label, value] of [["root List", list(integer(1))], ["empty root List", list()],
    ["root StringList", stringList("a")]] as const) {
    refused(initialState, start(value), label);
    assert.equal(supportsSemanticProcessExecution(start(value), program), false, label);
  }
});

test("Start requires exactly one binding named by the first task's source Property", () => {
  const wrongName = (name: string) => start(order, names, name);
  for (const [label, stimulus] of [
    ["missing binding", { ...start(order), initialVariables: [] }],
    ["Property of a later task", wrongName(names.pmid)],
    ["DataInput name", wrongName("Review_Input")],
    ["unrelated name", wrongName("Customer")],
    ["extra binding", { ...start(order), initialVariables: [binding(names.pin, order), binding("Z", text("x"))] }],
    ["only the extra binding", { ...start(order), initialVariables: [binding("A", text("x"))] }],
    ["two Property bindings", { ...start(order), initialVariables: [binding(names.pin, order), binding(names.pmid, order)] }],
  ] as const) {
    refused(initialState, stimulus, label);
    assert.equal(supportsSemanticProcessExecution(stimulus, program), false, label);
  }
});

test("a root String is bounded at 1,024 UTF-8 bytes at both selected surfaces", () => {
  const exact = text("a".repeat(1024));
  const over = text("a".repeat(1025));
  assert.equal(isVariableValue(over), true, "the generic value stays valid; only the port domain refuses it");
  committed(initialState, start(exact));
  refused(initialState, start(over), "Start over the bound");
  assert.equal(supportsSemanticProcessExecution(start(over), program), false);
  const waiting = atReview();
  committed(waiting, completion("Review", [output("Review", exact)]));
  refused(waiting, completion("Review", [output("Review", over)]), "completion over the bound");
});

test("a completion carries exactly its DataOutput binding and a SingletonBusinessItem", () => {
  const waiting = atReview();
  const good = output("Review", revision);
  for (const [label, submitted] of [
    ["omitted output", []],
    ["Property-named output", [binding(names.pmid, revision)]],
    ["input-named output", [binding("Review_Input", revision)]],
    ["another task's output", [output("Archive", revision)]],
    ["extra binding", [good, binding("Zzz", text("x"))]],
    ["two outputs", [good, output("Review", nothing)]],
    ["root List", [output("Review", list(integer(1), integer(1)))]],
    ["root StringList", [output("Review", stringList("a"))]],
  ] as const satisfies readonly (readonly [string, readonly VariableBinding[]])[]) {
    refused(waiting, completion("Review", submitted), label);
  }
  // The refusals changed nothing, so the same task still completes with the same occurrence.
  const archived = committed(waiting, completion("Review", [good]));
  assert.deepEqual(archived.userTaskWaits.map(({ id }) => id.elementId), ["Archive"]);
});

test("a completion for a stale, future or unknown occurrence is refused without partial writes", () => {
  const waiting = atReview();
  refused(waiting, completion("Review", [output("Review", revision)], 2), "future activation");
  refused(waiting, completion("Archive", [output("Archive", revision)]), "task not yet open");
  refused(waiting, completion("Nonexistent", [output("Nonexistent", revision)]), "unknown task");
  const next = committed(waiting, completion("Review", [output("Review", revision)]));
  refused(next, completion("Review", [output("Review", revision)]), "stale completed task");
});

test("present Null and an empty Map complete a task, and a missing output is not a Null", () => {
  const waiting = atReview();
  for (const value of [nothing, emptyMap, decimal("0", 0), truth(false), integer(0), text("")]) {
    committed(waiting, completion("Review", [output("Review", value)]));
  }
  refused(waiting, completion("Review", []), "absence is not Null");
});

test("the same nested order is refused by an old String/Null profile at both surfaces", () => {
  const old = handoffProgram(reviewArchive, SemanticProfileId.StructuredProcessComposition);
  assert.equal(supportsSemanticProcessExecution(start(order), old), false);
  const rejected = applyStimulus(old, initialState, start(order));
  assert.equal(rejected.outcome, CommandOutcome.Rejected);
  assert.deepEqual(rejected.state, initialState);
  // A String start commits under the old profile, then its nested completion is still refused there.
  const started = applyStimulus(old, initialState, start(text("order-4711")));
  assert.equal(started.outcome, CommandOutcome.Committed);
  const refusal = applyStimulus(old, started.state, completion("Review", [output("Review", order)]));
  assert.equal(refusal.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refusal.state, started.state);
});

test("renamed identifiers admit the same commands and refuse the same mistakes", () => {
  const other = handoffProgram(renamed);
  const started = applyStimulus(other, initialState, start(order, renamed));
  assert.equal(started.outcome, CommandOutcome.Committed);
  const wrong = applyStimulus(other, started.state, completion(renamed.first, [binding(renamed.pmid, revision)]));
  assert.equal(wrong.outcome, CommandOutcome.Rejected);
  const right = applyStimulus(other, started.state, completion(renamed.first, [output(renamed.first, revision)]));
  assert.equal(right.outcome, CommandOutcome.Committed);
  assert.deepEqual(right.state.userTaskWaits.map(({ id }) => id.elementId), [renamed.second]);
});

test("a value generic to the wire but outside the port never leaks into a partial write", () => {
  const waiting = atReview();
  const value: VariableValue = list(order, revision);
  const result = applyStimulus(program, waiting, completion("Review", [output("Review", value)]));
  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state.variables, waiting.variables);
  assert.deepEqual(result.state.userTaskWaits, waiting.userTaskWaits);
});
