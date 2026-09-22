import assert from "node:assert/strict";
import {
  SemanticOperationKind as Kind, SemanticOriginKind, StimulusKind,
  applyInternalOperationStep, compareCanonicalStrings, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalRegionalOperation } from "../src/internal-transition-regional-preparation.ts";
import { program as baseProgram, startStimulus } from "./embedded-subprocess-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { completeOrdinaryUserTask } = await import(
  new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-user-task-runtime.ts");

export const regionalKinds = [Kind.ReturnProcess, Kind.CompleteScope, Kind.ThrowError, Kind.TerminateScope] as const;
export type RegionalKind = typeof regionalKinds[number];
const root = baseProgram.definitionScopes[0];
const place = (name: string) => `place:${name}`;
const task = (name: string, input: string, output: string) => ({
  ...operationBase(name), kind: Kind.AwaitUserTask, input, output, task: { elementId: name, name },
} as const);

/** Constructed runtime witness; scope and Call identities come from the actual entry operations. */
export function regionalPairFixture(left: RegionalKind, right: RegionalKind, boundedCompletion = false) {
  return regionalFrontierFixture([left, right], boundedCompletion);
}

export function regionalFrontierFixture(kinds: readonly [RegionalKind, RegionalKind, ...RegionalKind[]], boundedCompletion = false) {
  const operations: SemanticOperation[] = [];
  const definitionScopes: SemanticProcessProgram["definitionScopes"][number][] = [root];
  const operationScopes: SemanticProcessProgram["operationScopes"][number][] = [];
  const controlPlaceScopes: SemanticProcessProgram["controlPlaceScopes"][number][] = [];
  const addOperation = (operation: SemanticOperation, scopeId: string = root.id) => {
    operations.push(operation);
    operationScopes.push({ operationId: operation.id, scopeId });
    return operation;
  };
  const addPlaces = (names: string[], scopeId: string = root.id) => {
    controlPlaceScopes.push(...names.map((name) => ({ controlPlaceId: place(name), scopeId })));
  };
  const branches = kinds.map((kind, index) => {
    const name = `Branch_${index}:é😀`;
    const scopeId = `scope:${name}`;
    const calledProcessId = `Process_${name}`;
    const bounded = boundedCompletion && kind === Kind.CompleteScope;
    const destructive = kind === Kind.ThrowError || kind === Kind.TerminateScope;
    definitionScopes.push({ id: scopeId, parentScopeId: kind === Kind.ReturnProcess ? null : root.id,
      originElementId: kind === Kind.ReturnProcess ? calledProcessId : name });
    addPlaces([`${name}_Input`, `${name}_Output`]);
    addPlaces([`${name}_Entry`, `${name}_End`], scopeId);
    const normalOutput = place(`${name}_Output`);
    const alternate = kind === Kind.ThrowError || bounded;
    if (alternate) {
      addPlaces([`${name}_Normal`, `${name}_Alternate`]);
      const mergeInputs: [string, string] = [place(`${name}_Alternate`), place(`${name}_Normal`)];
      addOperation({ ...operationBase(`${name}_Merge`), kind: Kind.MergeExclusive,
        inputs: mergeInputs.sort(compareCanonicalStrings), output: normalOutput });
    }
    const completionOutput = alternate ? place(`${name}_Normal`) : normalOutput;
    const entry = addOperation(kind === Kind.ReturnProcess
      ? { ...operationBase(name), kind: Kind.InvokeProcess, input: place(`${name}_Input`),
        calledEntry: place(`${name}_Entry`), calledProcessId, calledRootScopeId: scopeId,
        returnOperationId: `operation:Return_${name}` }
      : bounded
        ? { ...operationBase(name), kind: Kind.EnterBoundedScope, input: place(`${name}_Input`),
          childEntry: place(`${name}_Entry`), childScopeId: scopeId,
          boundaryTimer: { elementId: `${name}_Deadline`, durationMs: 1000,
            output: place(`${name}_Alternate`), origin: controlPlace(`${name}_Alternate`).origin } }
        : { ...operationBase(name), kind: Kind.EnterScope, input: place(`${name}_Input`),
          childEntry: place(`${name}_Entry`), childScopeId: scopeId });
    const completion: InternalRegionalOperation = kind === Kind.ReturnProcess
      ? { ...operationBase(`Return_${name}`), origin: entry.origin, kind,
        calledProcessId, calledRootScopeId: scopeId, callerOutput: completionOutput }
      : { ...operationBase(`Complete_${name}`), origin: entry.origin, kind: Kind.CompleteScope,
        scopeId, parentOutput: completionOutput };
    addOperation(completion, scopeId);
    let selected: InternalRegionalOperation = completion;
    if (destructive) {
      addPlaces([`${name}_Trigger`, `${name}_Sibling`, `${name}_Sibling_End`], scopeId);
      addOperation({ ...operationBase(`${name}_Fork`), kind: Kind.Duplicate, input: place(`${name}_Entry`),
        outputs: [place(`${name}_Sibling`), place(`${name}_Trigger`)].sort(compareCanonicalStrings) }, scopeId);
      addOperation(task(`${name}_Task`, place(`${name}_Trigger`), place(`${name}_End`)), scopeId);
      addOperation(task(`${name}_Sibling_Task`, place(`${name}_Sibling`), place(`${name}_Sibling_End`)), scopeId);
      addOperation({ ...operationBase(`${name}_Sibling_End`), kind: Kind.ReachNoneEnd,
        input: place(`${name}_Sibling_End`) }, scopeId);
      selected = kind === Kind.TerminateScope
        ? { ...operationBase(`${name}_End`), kind, input: place(`${name}_End`), scopeId }
        : { ...operationBase(`${name}_End`), kind, input: place(`${name}_End`),
          error: { errorDefinitionId: `${name}_Thrown`, errorElementId: `${name}_Error`, code: `${name}_Code` },
          handler: { attachedScopeId: scopeId, code: `${name}_Code`, output: place(`${name}_Alternate`),
            origin: { kind: SemanticOriginKind.BpmnElement, boundaryEventId: `${name}_Boundary`,
              errorDefinitionId: `${name}_Caught`, errorElementId: `${name}_Error`, sequenceFlowId: `${name}_Alternate` } } };
      addOperation(selected, scopeId);
    } else {
      addOperation(task(`${name}_Task`, place(`${name}_Entry`), place(`${name}_End`)), scopeId);
      addOperation({ ...operationBase(`${name}_End`), kind: Kind.ReachNoneEnd, input: place(`${name}_End`) }, scopeId);
    }
    return { name, kind, scopeId, entry, selected, destructive, bounded };
  });
  addPlaces(["Start", "End", "Side_Input", "Side_Output"]);
  addOperation({ ...operationBase("Start"), kind: Kind.Initiate, output: place("Start") });
  addOperation({ ...operationBase("Outer_Fork"), kind: Kind.Duplicate, input: place("Start"),
    outputs: [...branches.map(({ name }) => place(`${name}_Input`)), place("Side_Input")].sort(compareCanonicalStrings) });
  const side = addOperation(task("Side_Task", place("Side_Input"), place("Side_Output")));
  addOperation({ ...operationBase("Outer_Join"), kind: Kind.Synchronize,
    inputs: [...branches.map(({ name }) => place(`${name}_Output`)), place("Side_Output")].sort(compareCanonicalStrings),
    output: place("End") });
  addOperation({ ...operationBase("End"), kind: Kind.ReachNoneEnd, input: place("End") });
  addOperation({ ...operationBase("Complete_Root"), origin: operationBase(baseProgram.processId).origin,
    kind: Kind.CompleteScope, scopeId: root.id, parentOutput: null });
  const program: SemanticProcessProgram = { ...baseProgram,
    definitionScopes: definitionScopes.sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operations: operations.sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: operationScopes.sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: controlPlaceScopes.map(({ controlPlaceId }) => controlPlace(controlPlaceId.slice(6)))
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: controlPlaceScopes.sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  const start = startStimulus();
  const initial = admittedInternalPrefix(baseProgram, initialState, start,
    ["operation:StartEvent_Outer"], ["operation:SubProcess_Work"]);
  let state: RuntimeState = { ...initial, logicalTimeMs: 491, endOccurrences: 18,
    controlTokens: [{ placeId: place("Start"), owner: initial.scopeOccurrences[0]!.id, multiplicity: 1 }] };
  const fire = (id: string) => {
    const operation = program.operations.find((candidate) => candidate.id === id);
    assert.ok(operation !== undefined);
    const step = applyInternalOperationStep(program, operation, state);
    assert.ok(step !== null, `fixture operation ${id} must execute`);
    state = step.successor;
  };
  fire("operation:Outer_Fork");
  for (const branch of branches) {
    fire(branch.entry.id);
    if (branch.destructive) {
      fire(`operation:${branch.name}_Fork`);
      fire(`operation:${branch.name}_Sibling_Task`);
    }
    fire(`operation:${branch.name}_Task`);
    const wait = state.userTaskWaits.find(({ id }) => id.elementId === `${branch.name}_Task`);
    assert.ok(wait !== undefined);
    const next = completeOrdinaryUserTask(program, state, { kind: StimulusKind.CompleteUserTaskInstance,
      commandId: `complete:${branch.name}`, taskId: wait.id, submittedValues: [] });
    assert.ok(next !== null);
    state = next;
    if (!branch.destructive) fire(`operation:${branch.name}_End`);
  }
  const counterKeys = ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
    "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const;
  for (const [index, counterKey] of counterKeys.entries()) {
    state = { ...state, [counterKey]: [...state[counterKey], { elementId: "Unrelated:é😀", count: 50 + index }]
      .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)) };
  }
  return { program, state, start, branches, side };
}
