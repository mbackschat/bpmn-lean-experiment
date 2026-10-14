/**
 * Locks the structured effect-data profile (PBV-EFF-01..04, PBV-COPY-01) through compiled source and the public
 * command boundary: a structured assessment returned by one Service Task is written to a Process Property exactly and
 * copied by value into the next task's argument snapshot.
 *
 * The oracle is the proposal's decisive-witness list; every expected value is built here rather than read back from the
 * production validators, and each refusal asserts the complete committed state is unchanged.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { BpmnCompilationStatus } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, StimulusKind, applyStimulus, initialState, observeStableState,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  EffectOccurrenceId, RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding, VariableValue,
} from "@bpmn-lean/semantic-core";
import {
  assessment, compileCredit, creditNames, creditXml, decimal, integer, list, map, nothing, renamedCredit, text,
} from "./effect-data-fixture.ts";
import type { CreditNames } from "./effect-data-fixture.ts";

const binding = (name: string, value: VariableValue): VariableBinding => ({ name, value });

async function program(names: CreditNames = creditNames, reordered = false): Promise<SemanticProcessProgram> {
  const compiled = await compileCredit(creditXml(names, reordered), names);
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled));
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("unreachable");
  return compiled.semanticProcess;
}

const start = (names: CreditNames, applicant: VariableValue = text("A-17")): Stimulus => ({
  kind: StimulusKind.StartProcess, commandId: "start", processId: names.processId, instanceId: "credit-1",
  initialVariables: [binding(names.applicant, applicant)],
});

const complete = (effectId: EffectOccurrenceId, patch: readonly VariableBinding[], commandId = "complete"): Stimulus => ({
  kind: StimulusKind.CompleteEffect, commandId, effectId,
  result: { kind: EffectExecutionResultKind.Success, localPatch: patch },
});

function committed(p: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(p, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  return result.state;
}

function refused(p: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(p, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

const openId = (state: RuntimeState): EffectOccurrenceId => {
  assert.equal(state.effectWaits.length, 1);
  return state.effectWaits[0]!.id;
};

for (const [names, reordered] of [[creditNames, false], [renamedCredit, false], [creditNames, true], [renamedCredit, true]] as const) {
  test(`a structured assessment reaches the Property and the next snapshot exactly (${names.processId}, reordered ${reordered})`, async () => {
    const p = await program(names, reordered);
    assert.equal(supportsSemanticProcessExecution(start(names) as never, p), true);
    const atAssess = committed(p, initialState, start(names));
    assert.equal(atAssess.effectWaits[0]?.id.elementId, names.assess);
    assert.deepEqual(atAssess.effectWaits[0]?.arguments, [binding("applicant", text("A-17"))]);

    const result = assessment();
    const atNotify = committed(p, atAssess, complete(openId(atAssess), [binding(names.assessed, result)]));
    assert.equal(atNotify.effectWaits[0]?.id.elementId, names.notify);
    assert.deepEqual(atNotify.effectWaits[0]?.arguments, [binding("assessment", assessment())]);
    assert.deepEqual(atNotify.variables.process.bindings.find(({ name }) => name === names.assessed), binding(names.assessed, assessment()));
    assert.deepEqual(atNotify.variables.activities.map(({ bindings }) => bindings), [[binding("assessment", assessment())]]);
    const observed = observeStableState(p, atNotify);
    assert.deepEqual(observed?.variables.find(({ name }) => name === names.assessed)?.value, assessment());
    assert.deepEqual(observed?.openEffects[0]?.arguments, [binding("assessment", assessment())]);

    const done = committed(p, atNotify, complete(openId(atNotify), [binding(names.receipt, nothing)], "notify"));
    assert.equal(done.control.kind, "completed");
    assert.deepEqual(done.variables.activities, []);
    assert.deepEqual(done.variables.process.bindings.map(({ name }) => name).sort(), [names.applicant, names.assessed, names.receipt].sort());
    assert.deepEqual(done.variables.process.bindings.find(({ name }) => name === names.assessed)?.value, assessment());
  });
}

test("the ordered revision and a present Null or empty Map are values, not absence", async () => {
  const p = await program();
  const atAssess = committed(p, initialState, start(creditNames));
  const revision = map(["entries", list(map(["a", integer(2)]), map(["a", integer(1)]))], ["total", decimal("-125", 2)]);
  for (const value of [revision, nothing, map(), text("plain"), integer(0)]) {
    const next = committed(p, atAssess, complete(openId(atAssess), [binding("assessment", value)]));
    assert.deepEqual(next.effectWaits[0]?.arguments, [binding("assessment", value)]);
  }
});

test("a result patch is exactly the referenced local names and a SingletonBusinessItem", async () => {
  const p = await program();
  const atAssess = committed(p, initialState, start(creditNames));
  const id = openId(atAssess);
  const wrongOccurrence = { ...id, activation: id.activation + 1 };
  for (const [label, stimulus] of [
    ["root List", complete(id, [binding("assessment", list(integer(1)))])],
    ["empty root List", complete(id, [binding("assessment", list())])],
    ["root StringList", complete(id, [binding("assessment", { kind: "stringList", value: ["a"] } as VariableValue)])],
    ["missing binding", complete(id, [])],
    ["wrong name", complete(id, [binding("other", text("x"))])],
    ["extra binding", complete(id, [binding("assessment", nothing), binding("extra", nothing)])],
    ["duplicate binding", complete(id, [binding("assessment", nothing), binding("assessment", nothing)])],
    ["wrong occurrence", complete(wrongOccurrence, [binding("assessment", nothing)])],
    ["over-long root String", complete(id, [binding("assessment", text("a".repeat(1025)))])],
    ["malformed in-memory Map order", complete(id, [binding("assessment", map(["b", nothing], ["a", nothing]))])],
  ] as const) {
    refused(p, atAssess, stimulus, label);
  }
  committed(p, atAssess, complete(id, [binding("assessment", text("a".repeat(1024)))]));
});

test("a Map at exactly 16,384 canonical bytes is admitted and one byte more is refused", async () => {
  const p = await program();
  const atAssess = committed(p, initialState, start(creditNames));
  const canonicalBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
  const wrapper = (members: unknown[]) => ({ kind: "map", value: [{ name: "k", value: { kind: "list", value: members } }] });
  const leaf = (room: number) => ({ kind: "string", value: "a".repeat(room) });
  const sized = (target: number): VariableValue => {
    const members: unknown[] = [];
    for (;;) {
      const room = target - canonicalBytes(wrapper([...members, leaf(0)]));
      if (room <= 1024) {
        const value = wrapper([...members, leaf(room)]);
        assert.equal(canonicalBytes(value), target);
        return value as VariableValue;
      }
      members.push(leaf(1024));
    }
  };
  const next = committed(p, atAssess, complete(openId(atAssess), [binding("assessment", sized(16_384))]));
  assert.equal(next.effectWaits[0]?.arguments.length, 1);
  refused(p, atAssess, complete(openId(atAssess), [binding("assessment", sized(16_385))]), "one byte over");
});

test("Process Start keeps String and Null at 1,024 UTF-8 bytes", async () => {
  const p = await program();
  const exact = "é".repeat(512);
  const over = `${exact}a`;
  committed(p, initialState, start(creditNames, text("a".repeat(1024))));
  committed(p, initialState, start(creditNames, text(exact)));
  committed(p, initialState, start(creditNames, nothing));
  for (const [label, value] of [["1,025 bytes", text("a".repeat(1025))], ["1,025 UTF-8 bytes", text(over)],
    ["Map", map()], ["Integer", integer(1)], ["List", list()]] as const) {
    refused(p, initialState, start(creditNames, value), label);
    assert.equal(supportsSemanticProcessExecution(start(creditNames, value) as never, p), false, label);
  }
  const missing = { ...start(creditNames), initialVariables: [] } as Stimulus;
  refused(p, initialState, missing, "the referenced applicant is required at Start");
});

test("a String literal input is bounded at 1,024 UTF-8 bytes at source admission", async () => {
  const withLiteral = (value: string) => compileCredit(creditXml(creditNames).replace(
    `<camunda:inputParameter name="applicant">\${applicantRef}</camunda:inputParameter>`,
    `<camunda:inputParameter name="applicant">${value}</camunda:inputParameter>`));
  const exact = await withLiteral("a".repeat(1024));
  assert.equal(exact.status, BpmnCompilationStatus.Accepted);
  const multibyte = await withLiteral("é".repeat(512));
  assert.equal(multibyte.status, BpmnCompilationStatus.Accepted);
  for (const over of ["a".repeat(1025), `${"é".repeat(512)}a`]) {
    assert.equal((await withLiteral(over)).status, BpmnCompilationStatus.Rejected);
  }
});

test("a literal input reaches the snapshot as a String", async () => {
  const literal = await compileCredit(creditXml(creditNames).replace(
    `<camunda:inputParameter name="applicant">\${applicantRef}</camunda:inputParameter>`,
    `<camunda:inputParameter name="applicant">fixed</camunda:inputParameter>`));
  assert.equal(literal.status, BpmnCompilationStatus.Accepted);
  if (literal.status !== BpmnCompilationStatus.Accepted) return;
  const state = committed(literal.semanticProcess, initialState,
    { ...start(creditNames), initialVariables: [] } as Stimulus);
  assert.deepEqual(state.effectWaits[0]?.arguments, [binding("applicant", text("fixed"))]);
});
