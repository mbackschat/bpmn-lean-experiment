/**
 * The core journeys of the concurrent structured scope data proposal over its retained models (CSSD-VALUE-01,
 * CSSD-SNAPSHOT-01 and the reused CSD and CMCALL frame rules). Frame contents are runtime-only, so this test reads
 * committed state directly; every expected value is read off the proposal's witness-model account, not off a run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticProfileId, StimulusKind, applyInternalOperationStep, applyStimulus,
  deriveCalledProcessInstanceId, initialState, isWellFormedRuntimeState, nestedScopePatchByteLimit,
} from "@bpmn-lean/semantic-core";
import type { BusinessValue, RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { decimal, list, map, nothing, text } from "./effect-data-fixture.ts";
import { patchOfSize } from "./exact-size-patch-fixture.ts";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";
const { PreparedInternalTransitionFamily, applyPreparedInternalTransition, deriveInternalTransitionPreparation,
  preparedInternalTransitionsAreIndependent } = await import(
  new URL("../../semantic-core/dist/internal-transition-batch.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/internal-transition-batch.ts");

const directory = new URL("../../../scenarios/concurrent-structured-scope-data/", import.meta.url);

async function program(name: string): Promise<SemanticProcessProgram> {
  return compiled(name, await readFile(new URL(`${name}.bpmn`, directory), "utf8"));
}

async function compiled(name: string, xml: string): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL(`${name}-overlay.json`, directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml), sourceId: name, expectedSha256: undefined,
    semanticProfile: SemanticProfileId.NestedEmbeddedScopeData,
    sourceOverlay: { id: `${name}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const bind = (name: string, value: BusinessValue): VariableBinding => ({ name, value });

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, instanceId: string): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

const frame = (state: RuntimeState, definitionScopeId: string, processInstanceId?: string) =>
  state.variables.scopes.filter(({ owner }) => owner.definitionScopeId === definitionScopeId &&
    (processInstanceId === undefined || owner.processInstanceId === processInstanceId)).map(({ bindings }) => bindings);

const userTask = (processInstanceId: string, elementId: string, submittedValues: readonly VariableBinding[], activation = 1):
  Stimulus => ({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${processInstanceId}`,
  taskId: { processInstanceId, elementId, activation }, submittedValues });

const effect = (processInstanceId: string, elementId: string, localPatch: readonly VariableBinding[]): Stimulus => ({
  kind: StimulusKind.CompleteEffect, commandId: `effect-${elementId}`,
  effectId: { processInstanceId, elementId, activation: 1 },
  result: { kind: EffectExecutionResultKind.Success, localPatch } });

const argumentsOf = (state: RuntimeState, elementId: string) =>
  state.effectWaits.find(({ id }) => id.elementId === elementId)?.arguments;

// Two equal line items, a present-null unit and a negative scale-two discount defeat deduplication, null-dropping and
// rounding; the Map names are in canonical order.
const lineItem = map(["quantity", text("2")], ["sku", text("A-17")]);
const order = map(["discount", decimal("-125", 2)], ["lines", list(lineItem, lineItem)],
  ["shipTo", map(["city", text("Leeds")], ["unit", nothing])]);
const reroutedOrder = map(["discount", decimal("-125", 2)], ["lines", list(lineItem, lineItem)],
  ["shipTo", map(["city", text("York")], ["unit", nothing])]);
const parcel = map(["weight", decimal("1525", 3)]);
const packed = map(["parcels", list(parcel, parcel)]);
const quote = map(["carrier", text("north")], ["price", decimal("1249", 2)]);
// Review route writes `instructions` as a Map over the declared String.
const fragile = map(["handling", text("fragile")]);

for (const reviewFirst of [true, false]) {
  test(`order fulfilment keeps each frame's structured values exact when Review route completes ${
    reviewFirst ? "while Pick items is open" : "after its result"}`, async () => {
    const fulfilment = await program("order-fulfilment");
    const instanceId = "Order_1";
    let state = commit(fulfilment, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
      processId: "Process_OrderFulfilment", instanceId, initialVariables: [bind("order", order)] }, instanceId);
    assert.deepEqual(frame(state, "scope:PickStock"), [[bind("packing", text("none")), bind("pickList", order)]]);
    assert.deepEqual(frame(state, "scope:PlanShipment"), [[bind("shipment", order)]]);
    // CSSD-SNAPSHOT-01: the arming step commits Pick items' argument snapshot.
    const pickArguments = [bind("instructions", text("standard")), bind("items", order)];
    assert.deepEqual(argumentsOf(state, "PickItems"), pickArguments);

    const review = (current: RuntimeState) => commit(fulfilment, current, userTask(instanceId, "ReviewRoute",
      [bind("instructions", fragile), bind("shipment", reroutedOrder)]), instanceId);
    const pick = (current: RuntimeState) =>
      commit(fulfilment, current, effect(instanceId, "PickItems", [bind("packed", packed)]), instanceId);
    if (reviewFirst) {
      state = review(state);
      // A sibling's later write of `instructions` does not rewrite the open effect's snapshot.
      assert.deepEqual(argumentsOf(state, "PickItems"), pickArguments);
      state = pick(state);
    } else {
      state = pick(state);
      assert.deepEqual(frame(state, "scope:PickStock"), []);
      state = review(state);
    }
    assert.deepEqual(frame(state, "scope:FulfilOrder"),
      [[bind("instructions", fragile), bind("label", text("none")), bind("parcels", packed)]]);
    assert.deepEqual(argumentsOf(state, "RateShipment"),
      [bind("instructions", fragile), bind("shipment", reroutedOrder)]);

    // One result fans out to an enclosing local and to a Process name no scope declares (PC-DATA-06).
    state = commit(fulfilment, state, effect(instanceId, "RateShipment", [bind("quote", quote)]), instanceId);
    assert.deepEqual(frame(state, "scope:FulfilOrder"),
      [[bind("instructions", fragile), bind("label", quote), bind("parcels", packed)]]);
    assert.deepEqual(argumentsOf(state, "NotifyCustomer"), [bind("quote", quote)]);
    state = commit(fulfilment, state, effect(instanceId, "NotifyCustomer", []), instanceId);
    state = commit(fulfilment, state, userTask(instanceId, "ConfirmFulfilment", []), instanceId);
    assert.deepEqual(state.variables.scopes, []);
    assert.deepEqual(state.variables.process.bindings, [bind("carrierQuote", quote),
      bind("finalInstructions", fragile), bind("order", order), bind("shippedParcels", packed),
      bind("shippingLabel", quote)]);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["CloseOrder"]);
  });
}

const application = map(["amount", decimal("2500075", 2)],
  ["applicant", map(["employer", nothing], ["name", text("Ada")])],
  ["collateral", list(map(["kind", text("flat")]), map(["kind", text("flat")]))]);
const surveyedApplication = map(["amount", decimal("2500075", 2)],
  ["applicant", map(["employer", nothing], ["name", text("Ada")])],
  ["collateral", list(map(["kind", text("flat")]), map(["kind", text("flat")]))], ["survey", text("done")]);
// Each opinion repeats a condition, so a deduplicating copy loses a member.
const opinion = (verdict: string) =>
  map(["conditions", list(text("insured"), text("insured"))], ["notes", nothing], ["verdict", text(verdict)]);

/** The Loan assessment instance up to both open expert reviews, valuation's dossier amended before its Call. */
async function loanAwaitingExperts() {
  const loan = await program("loan-assessment");
  const instanceId = "Loan_1";
  const credit = deriveCalledProcessInstanceId(instanceId, "CreditExpertReview", 1);
  const valuation = deriveCalledProcessInstanceId(instanceId, "ValuationExpertReview", 1);
  let state = commit(loan, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_LoanAssessment", instanceId, initialVariables: [bind("application", application)] }, instanceId);
  assert.deepEqual(frame(state, "scope:CreditCheck"), [[bind("dossier", application)]]);
  assert.deepEqual(frame(state, "scope:CollateralValuation"), [[bind("dossier", application)]]);
  // Prepare valuation amends only its own branch's dossier.
  state = commit(loan, state, userTask(instanceId, "PrepareValuation", [bind("dossier", surveyedApplication)]), instanceId);
  assert.deepEqual(frame(state, "scope:CreditCheck"), [[bind("dossier", application)]]);
  state = commit(loan, state, userTask(instanceId, "PrepareCreditFile", []), instanceId);
  // Activations count per element across called instances, so the later invocation's task is activation 2.
  assert.deepEqual(state.userTaskWaits.map(({ id }) => [id.processInstanceId, id.activation]), [[credit, 2], [valuation, 1]]);
  const give = (calledInstance: string, submittedValues: readonly VariableBinding[]) =>
    userTask(calledInstance, "GiveOpinion", submittedValues, calledInstance === credit ? 2 : 1);
  return { loan, instanceId, credit, valuation, state, give };
}

for (const valuationFirst of [true, false]) {
  test(`loan assessment isolates both called frames and lands each opinion at its own target, ${
    valuationFirst ? "valuation" : "credit"} first`, async () => {
    const { loan, instanceId, credit, valuation, give, state: awaiting } = await loanAwaitingExperts();
    let state = awaiting;
    // CMCALL isolation: each called root holds the copy its own caller chain resolved.
    assert.deepEqual(frame(state, "scope:Process_ExpertReview", credit), [[bind("case", application)]]);
    assert.deepEqual(frame(state, "scope:Process_ExpertReview", valuation), [[bind("case", surveyedApplication)]]);

    const [first, second] = valuationFirst
      ? [[valuation, "sound", "valuationFile", surveyedApplication], [credit, "good", "creditFile", application]] as const
      : [[credit, "good", "creditFile", application], [valuation, "sound", "valuationFile", surveyedApplication]] as const;
    state = commit(loan, state, give(first[0], [bind("opinion", opinion(first[1]))]), instanceId);
    // A branch Sub-Process outputs on its own completion, while its sibling still waits.
    assert.deepEqual(state.variables.process.bindings.find(({ name }) => name === first[2]), bind(first[2], first[3]));
    assert.equal(state.variables.process.bindings.some(({ name }) => name === second[2]), false);
    state = commit(loan, state, give(second[0], [bind("opinion", opinion(second[1]))]), instanceId);
    assert.deepEqual(state.variables.scopes, []);
    assert.deepEqual(state.variables.process.bindings, [bind("application", application),
      bind("credit", opinion("good")), bind("creditFile", application), bind("valuation", opinion("sound")),
      bind("valuationFile", surveyedApplication)]);
    assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["DecideLoan"]);
  });
}

function rejected(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, label: string): void {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Rejected, label);
  assert.deepEqual(result.state, state, label);
}

test("a Pick items read of the sibling-written carrierQuote makes it a required Start binding", async () => {
  const xml = (await readFile(new URL("order-fulfilment.bpmn", directory), "utf8")).replace(
    '<camunda:inputParameter name="items">${pickList}</camunda:inputParameter>',
    '<camunda:inputParameter name="items">${pickList}</camunda:inputParameter>' +
      '<camunda:inputParameter name="quote">${carrierQuote}</camunda:inputParameter>');
  const variant = await compiled("order-fulfilment", xml);
  const start = (initialVariables: readonly VariableBinding[]): Stimulus => ({ kind: StimulusKind.StartProcess,
    commandId: "start", processId: "Process_OrderFulfilment", instanceId: "Order_1", initialVariables });
  rejected(variant, initialState, start([bind("order", order)]), "Start without carrierQuote");
  commit(variant, initialState, start([bind("carrierQuote", quote), bind("order", order)]), "Order_1");
});

test("CSSD-REFUSE-01 a refused result or patch on one branch leaves every frame, sibling wait and snapshot unchanged",
  async () => {
    const fulfilment = await program("order-fulfilment");
    const instanceId = "Order_1";
    const state = commit(fulfilment, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
      processId: "Process_OrderFulfilment", instanceId, initialVariables: [bind("order", order)] }, instanceId);
    rejected(fulfilment, state, effect(instanceId, "PickItems", [bind("packed", list(parcel))]), "root List result");
    rejected(fulfilment, state, effect(instanceId, "PickItems", [bind("packed", text("p".repeat(1025)))]),
      "1,025-byte root String result");
    rejected(fulfilment, state, userTask(instanceId, "ReviewRoute", patchOfSize("shipment", nestedScopePatchByteLimit + 1)),
      "over-allowance Review route patch");
    const atAllowance = commit(fulfilment, state,
      userTask(instanceId, "ReviewRoute", patchOfSize("shipment", nestedScopePatchByteLimit)), instanceId);
    assert.deepEqual(argumentsOf(atAllowance, "PickItems"), [bind("instructions", text("standard")), bind("items", order)]);

    const { loan, credit, give, state: awaiting } = await loanAwaitingExperts();
    rejected(loan, awaiting, give(credit, patchOfSize("opinion", nestedScopePatchByteLimit + 1)), "over-allowance opinion");
  });

// Oracle: CSD-PREPARE-01's batch premise, Lean's `PreparedInternalTransition.Independent`, which admits a declared entry
// only beside declared entries, scope creations, armings and local control; this profile's forks reach it as the
// embedded completion profile's do.
test("the two sibling declared entries after the order fork are independent and each refines its singleton step", async () => {
  const order = await program("order-fulfilment");
  const operationAt = (elementId: string, kind: string) => {
    const matching = order.operations.filter(({ origin, kind: candidate }) => origin.elementId === elementId && candidate === kind);
    assert.equal(matching.length, 1, elementId);
    return matching[0]!;
  };
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: order.processId,
    instanceId: "Order_1", initialVariables: [bind("order", map(["lines", list()]))] };
  const entries = ["PickStock", "PlanShipment"].map(id => operationAt(id, "enterScope"));
  const state = admittedInternalPrefix(order, initialState, start, [operationAt("OrderReceived", "initiate").id,
    operationAt("FulfilOrder", "enterScope").id, operationAt("SplitFulfilment", "duplicate").id], entries.map(({ id }) => id));
  const fulfil = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === "scope:FulfilOrder")!.id;
  const prepared = entries.map(operation => deriveInternalTransitionPreparation(order, state, { operation, owner: fulfil }));
  for (const [index, member] of prepared.entries()) {
    assert.ok(member?.family === PreparedInternalTransitionFamily.DeclaredScopeEntry);
    assert.deepEqual(applyPreparedInternalTransition(order, state, member),
      applyInternalOperationStep(order, entries[index]!, state)?.successor);
  }
  assert.equal(preparedInternalTransitionsAreIndependent(prepared[0]!, prepared[1]!), true);
});
