/**
 * The core journeys of the concurrent scope data specification over its retained models (CSD-INIT-01, CSD-RETIRE-01,
 * CSD-PREPARE-01, CSD-ISOLATE-01). Frame contents are runtime-only, so this test reads committed state directly; the
 * expected values are read off the proposal's separating-witness table, not off a run.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, EffectExecutionResultKind, SemanticOperationKind, StimulusKind, VariableValueKind, applyInternalOperationStep,
  applyStimulus,
  initialState, isWellFormedRuntimeState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableBinding } from "@bpmn-lean/semantic-core";
import { semanticProcessTestLimits } from "./semantic-process-compilation-test-support.ts";
import { admittedInternalPrefix } from "../../semantic-core/test/internal-operation-prefix-fixture.ts";
const { PreparedInternalTransitionFamily, applyPreparedInternalTransition, deriveInternalTransitionPreparation,
  preparedInternalTransitionsAreIndependent } = await import(
  new URL("../../semantic-core/dist/internal-transition-batch.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/internal-transition-batch.ts");
const { InternalFrontierDisposition, classifyPreparedInternalFrontier } = await import(
  new URL("../../semantic-core/dist/internal-transition-preparation.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/internal-transition-preparation.ts");
const { InternalTransitionStateAtomKind, deriveInternalTransitionFootprint } = await import(
  new URL("../../semantic-core/dist/internal-transition-footprint.js", import.meta.url).href) as
  typeof import("../../semantic-core/src/internal-transition-footprint.ts");

const semanticProfile = "cibseven-2.2.0-embedded-subprocess-completion-draft";
const directory = new URL("../../../scenarios/concurrent-scope-data/", import.meta.url);

async function program(name: string): Promise<SemanticProcessProgram> {
  const overlay = new Uint8Array(await readFile(new URL(`${name}-handlers.json`, directory)));
  const result = await compileBpmnToSemanticProcess({
    bytes: new Uint8Array(await readFile(new URL(`${name}.bpmn`, directory))), sourceId: name,
    expectedSha256: undefined, semanticProfile,
    sourceOverlay: { id: `${name}-handlers`, sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    limits: semanticProcessTestLimits,
  });
  assert.ok(result.status === BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  return result.semanticProcess;
}

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const bind = (name: string, value: VariableBinding["value"]): VariableBinding => ({ name, value });

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus, instanceId: string): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed, JSON.stringify(stimulus));
  assert.equal(result.ambiguousInternalChoice, false, JSON.stringify(stimulus));
  assert.equal(isWellFormedRuntimeState(program, instanceId, result.state), true, JSON.stringify(stimulus));
  return result.state;
}

const frame = (state: RuntimeState, definitionScopeId: string) => {
  const frames = state.variables.scopes.filter(({ owner }) => owner.definitionScopeId === definitionScopeId);
  return frames.map(({ owner, bindings }) => ({ activation: owner.activation, bindings }));
};

test("the facility fork enters both declaring checks in one closure, each reading its own parent chain", async () => {
  const facility = await program("facility-inspection");
  const instanceId = "Facility_1";
  let state = commit(facility, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_FacilityInspection", instanceId, initialVariables: [] }, instanceId);
  assert.deepEqual(frame(state, "scope:Inspection"), [{ activation: 1,
    bindings: [bind("findings", text("open")), bind("result", text("none"))] }]);
  assert.deepEqual(frame(state, "scope:ElectricalCheck"), [{ activation: 1, bindings: [bind("result", text("pending-electrical"))] }]);
  // CSD-INIT-01: the later-executed entry reads the outer result, not its sibling's shadowing literal.
  assert.deepEqual(frame(state, "scope:FireSafetyCheck"), [{ activation: 1, bindings: [bind("result", text("none"))] }]);
  assert.equal(state.userTaskWaits.length, 2);

  const complete = (elementId: string, submittedValues: readonly VariableBinding[]): Stimulus => ({
    kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}`,
    taskId: { processInstanceId: instanceId, elementId, activation: 1 }, submittedValues });
  state = commit(facility, state, complete("RecordElectricalFindings",
    [bind("findings", text("wiring-ok")), bind("result", text("electrical-pass"))]), instanceId);
  assert.deepEqual(frame(state, "scope:ElectricalCheck"), []);
  assert.deepEqual(frame(state, "scope:FireSafetyCheck"), [{ activation: 1, bindings: [bind("result", text("none"))] }]);
  assert.deepEqual(frame(state, "scope:Inspection")[0]?.bindings,
    [bind("findings", text("wiring-ok")), bind("result", text("none"))]);

  state = commit(facility, state, complete("RecordFireSafetyFindings", []), instanceId);
  assert.deepEqual(state.variables.process.bindings,
    [bind("electricalResult", text("electrical-pass")), bind("fireResult", text("none"))]);
  assert.deepEqual(state.effectWaits.map(wait => wait.arguments), [[bind("electricalResult", text("electrical-pass")),
    bind("findings", text("wiring-ok")), bind("fireResult", text("none"))]]);

  state = commit(facility, state, { kind: StimulusKind.CompleteEffect, commandId: "summarize",
    effectId: { processInstanceId: instanceId, elementId: "Summarize", activation: 1 },
    result: { kind: EffectExecutionResultKind.Success, localPatch: [] } }, instanceId);
  assert.equal(state.variables.scopes.length, 0);
});

for (const order of [[1, 2], [2, 1]] as const) {
  test(`two concurrent Price damage occurrences keep separate frames and both output, completing ${order.join(" then ")}`,
    async () => {
      const claim = await program("claim-damage-assessment");
      const instanceId = "Claim_1";
      const nullValue = { kind: VariableValueKind.Null } as const;
      const userTask = (elementId: string, activation: number, submittedValues: readonly VariableBinding[]): Stimulus => ({
        kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
        taskId: { processInstanceId: instanceId, elementId, activation }, submittedValues });
      const fetched = (activation: number): Stimulus => ({ kind: StimulusKind.CompleteEffect, commandId: `fetch-${activation}`,
        effectId: { processInstanceId: instanceId, elementId: "FetchRates", activation },
        result: { kind: EffectExecutionResultKind.Success, localPatch: [] } });
      const pending = [bind("adjuster", nullValue), bind("estimate", text("pending"))];

      let state = commit(claim, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
        processId: "Process_ClaimDamageAssessment", instanceId,
        initialVariables: [bind("adjuster", text("desk")), bind("noAdjuster", nullValue)] }, instanceId);
      state = commit(claim, state, userTask("InspectVehicle", 1, []), instanceId);
      assert.deepEqual(frame(state, "scope:PriceDamage"), [{ activation: 1, bindings: pending }]);
      // CSD-INIT-01 on merge-target entry: the second occurrence reads the same Handle claim chain, not the first frame.
      state = commit(claim, state, userTask("InspectProperty", 1, []), instanceId);
      assert.deepEqual(frame(state, "scope:PriceDamage"), [{ activation: 1, bindings: pending }, { activation: 2, bindings: pending }]);

      state = commit(claim, state, userTask("AssessDamage", 1, []), instanceId);
      state = commit(claim, state, userTask("AssessDamage", 2, [bind("estimate", text("4200"))]), instanceId);
      // CSD-CHAIN-01 and NSD-READ-01: each effect reads its own frame, and the frame's null shadows the Process adjuster.
      assert.deepEqual(state.effectWaits.map(({ id, arguments: values }) => [id.activation, values]), [
        [1, [bind("adjuster", nullValue), bind("estimate", text("pending"))]],
        [2, [bind("adjuster", nullValue), bind("estimate", text("4200"))]],
      ]);
      assert.deepEqual(frame(state, "scope:PriceDamage").map(({ bindings }) => bindings),
        [pending, [bind("adjuster", nullValue), bind("estimate", text("4200"))]]);

      // CSD-RETIRE-01: each completion writes through its own parent chain and disposes exactly its own frame.
      const estimates = { 1: "pending", 2: "4200" } as const;
      state = commit(claim, state, fetched(order[0]), instanceId);
      assert.deepEqual(frame(state, "scope:PriceDamage").map(({ activation }) => activation), [order[1]]);
      assert.deepEqual(state.variables.process.bindings.find(({ name }) => name === "lastEstimate"),
        bind("lastEstimate", text(estimates[order[0]])));
      state = commit(claim, state, fetched(order[1]), instanceId);
      assert.deepEqual(state.variables.scopes, []);
      assert.deepEqual(state.variables.process.bindings, [bind("adjuster", text("desk")),
        bind("lastEstimate", text(estimates[order[1]])), bind("noAdjuster", nullValue)]);
      assert.deepEqual(state.userTaskWaits.map(({ id }) => id.elementId), ["ReviewClaim"]);
    });
}

const operationAt = (program: SemanticProcessProgram, elementId: string, kind: string) => {
  const matching = program.operations.filter(({ origin, kind: candidate }) => origin.elementId === elementId && candidate === kind);
  assert.equal(matching.length, 1, elementId);
  return matching[0]!;
};

type FootprintAtom = NonNullable<ReturnType<typeof deriveInternalTransitionFootprint>>["reads"][number];

/** Every chain link a nested read set walks is read for its liveness as well as its parent, as the Lean footprint states. */
function assertLinksReadLive(reads: readonly FootprintAtom[]): void {
  const live = new Set(reads.flatMap(atom =>
    atom.kind === InternalTransitionStateAtomKind.ScopeOccurrence ? [atom.owner.definitionScopeId] : []));
  for (const atom of reads) {
    if (atom.kind === InternalTransitionStateAtomKind.ScopeParent) assert.ok(live.has(atom.occurrence.definitionScopeId));
  }
}

test("each prepared declared entry equals the evaluator's entry, and the two sibling entries are independent", async () => {
  const facility = await program("facility-inspection");
  const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_FacilityInspection",
    instanceId: "Facility_1", initialVariables: [] };
  const entries = ["ElectricalCheck", "FireSafetyCheck"].map(id => operationAt(facility, id, "enterScope"));
  const state = admittedInternalPrefix(facility, initialState, start,
    [operationAt(facility, "InspectionRequested", "initiate").id, operationAt(facility, "Inspection", "enterScope").id,
      operationAt(facility, "ChecksFork", "duplicate").id], entries.map(({ id }) => id));
  const inspection = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === "scope:Inspection")!.id;
  const prepared = entries.map(operation => deriveInternalTransitionPreparation(facility, state, { operation, owner: inspection }));
  for (const [index, member] of prepared.entries()) {
    assert.ok(member?.family === PreparedInternalTransitionFamily.DeclaredScopeEntry);
    // CSD-PREPARE-01: the composed patch refines the singleton declared entry.
    assert.deepEqual(applyPreparedInternalTransition(facility, state, member),
      applyInternalOperationStep(facility, entries[index]!, state)?.successor);
  }
  assert.equal(preparedInternalTransitionsAreIndependent(prepared[0]!, prepared[1]!), true);
  // The Fire safety entry reads the outer result through the Inspection frame; the literal-only entry reads no frame.
  const frameReads = (index: number) => prepared[index]!.footprint.reads.flatMap(atom =>
    atom.kind === "scopeVariableScope" ? [atom.owner.definitionScopeId] : []);
  assert.deepEqual(frameReads(1), ["scope:FireSafetyCheck", "scope:Inspection"]);
  assert.deepEqual(frameReads(0), ["scope:ElectricalCheck"]);
  for (const member of prepared) assertLinksReadLive(member!.footprint.reads);
});

// Oracle: Lean's `PreparedInternalTransition.Independent`, which refuses a declared entry beside every family but declared
// entries, scope creations, armings, local control and, by the pair laws PTPB-COMMUTE-01 and DTB-COMMUTE-01, Merge inputs
// and ordinary Ends (CSD-PREPARE-01's batch premise); a mapped invocation still refuses both. The companion is the
// independent sibling entry relabelled, because independence reads only family and footprint; the frontier rule is the
// production path that must honour the premise.
test("a declared entry beside an unproved prepared family is dependent and rolls the frontier back, and beside a Merge input or an End batches",
  async () => {
    const facility = await program("facility-inspection");
    const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start", processId: "Process_FacilityInspection",
      instanceId: "Facility_1", initialVariables: [] };
    const entries = ["ElectricalCheck", "FireSafetyCheck"].map(id => operationAt(facility, id, "enterScope"));
    const state = admittedInternalPrefix(facility, initialState, start,
      [operationAt(facility, "InspectionRequested", "initiate").id, operationAt(facility, "Inspection", "enterScope").id,
        operationAt(facility, "ChecksFork", "duplicate").id], entries.map(({ id }) => id));
    const inspection = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === "scope:Inspection")!.id;
    const [declared, sibling] = entries.map(operation =>
      deriveInternalTransitionPreparation(facility, state, { operation, owner: inspection })!);
    const refused = [PreparedInternalTransitionFamily.CallData, PreparedInternalTransitionFamily.BoundedScope,
      PreparedInternalTransitionFamily.Regional];
    for (const family of refused) {
      const companion = { ...sibling!, family } as unknown as typeof sibling;
      assert.equal(preparedInternalTransitionsAreIndependent(declared!, companion!), false, family);
      assert.equal(preparedInternalTransitionsAreIndependent(companion!, declared!), false, family);
      assert.equal(classifyPreparedInternalFrontier([declared!, companion!])?.kind, InternalFrontierDisposition.ObservableChoice,
        family);
    }
    const merge = { ...sibling!, family: PreparedInternalTransitionFamily.MergeInput } as unknown as typeof sibling;
    assert.equal(preparedInternalTransitionsAreIndependent(declared!, merge!), true);
    assert.equal(preparedInternalTransitionsAreIndependent(merge!, declared!), true);
    assert.equal(classifyPreparedInternalFrontier([declared!, merge!])?.kind, InternalFrontierDisposition.IndependentBatch);
    const ending = { ...sibling!, family: PreparedInternalTransitionFamily.OrdinaryEnd } as unknown as typeof sibling;
    assert.equal(preparedInternalTransitionsAreIndependent(declared!, ending!), true);
    assert.equal(preparedInternalTransitionsAreIndependent(ending!, declared!), true);
    assert.equal(classifyPreparedInternalFrontier([declared!, ending!])?.kind, InternalFrontierDisposition.IndependentBatch);
    const invocation = { ...declared!, family: PreparedInternalTransitionFamily.MappedInvocation } as unknown as typeof declared;
    assert.equal(preparedInternalTransitionsAreIndependent(invocation!, merge!), false);
    assert.equal(preparedInternalTransitionsAreIndependent(merge!, invocation!), false);
    assert.equal(preparedInternalTransitionsAreIndependent(invocation!, ending!), false);
    assert.equal(preparedInternalTransitionsAreIndependent(ending!, invocation!), false);
  });

test("nested effect arming reads its precise frame, chain and Process atoms instead of the Activity population", async () => {
  const claim = await program("claim-damage-assessment");
  const instanceId = "Claim_1";
  const nullValue = { kind: VariableValueKind.Null } as const;
  let state = commit(claim, initialState, { kind: StimulusKind.StartProcess, commandId: "start",
    processId: "Process_ClaimDamageAssessment", instanceId,
    initialVariables: [bind("adjuster", text("desk")), bind("noAdjuster", nullValue)] }, instanceId);
  state = commit(claim, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "inspect",
    taskId: { processInstanceId: instanceId, elementId: "InspectVehicle", activation: 1 }, submittedValues: [] }, instanceId);
  const fetch = operationAt(claim, "FetchRates", "awaitEffect");
  const armed = admittedInternalPrefix(claim, state, { kind: StimulusKind.CompleteUserTaskInstance, commandId: "assess",
    taskId: { processInstanceId: instanceId, elementId: "AssessDamage", activation: 1 }, submittedValues: [] }, [], [fetch.id]);
  const price = armed.scopeOccurrences.find(({ id }) => id.definitionScopeId === "scope:PriceDamage")!.id;
  const footprint = deriveInternalTransitionFootprint(claim, armed, { operation: fetch, owner: price });
  assert.ok(footprint !== null);
  const reads = footprint.reads;
  assert.equal(reads.some(({ kind }) => kind === "activityPopulation"), false);
  // Both mapped names resolve to the Price damage frame, so no Process variable is read.
  assert.equal(reads.some(({ kind }) => kind === "processVariable"), false);
  assert.ok(reads.some(atom => atom.kind === "scopeVariableScope" && atom.owner.definitionScopeId === "scope:PriceDamage"));
  assert.deepEqual(reads.flatMap(atom => atom.kind === "scopeParent" ? [atom.occurrence.definitionScopeId] : []).sort(),
    ["scope:HandleClaim", "scope:PriceDamage", "scope:Process_ClaimDamageAssessment"]);
  assertLinksReadLive(reads);
  // Evaluation reads its frames only for enclosing names, so without one the arming claims no chain (Lean's account).
  const literalOnly = { ...claim, operations: claim.operations.map(operation =>
    operation.id === fetch.id && operation.kind === SemanticOperationKind.AwaitEffect
      ? { ...operation, effect: { ...operation.effect, inputMappings: [] } } : operation) };
  const unmapped = deriveInternalTransitionFootprint(literalOnly, armed,
    { operation: operationAt(literalOnly, "FetchRates", "awaitEffect"), owner: price });
  assert.ok(unmapped !== null);
  assert.equal(unmapped.reads.some(({ kind }) => kind === "scopeParent" || kind === "scopeVariableScope"), false);
});
