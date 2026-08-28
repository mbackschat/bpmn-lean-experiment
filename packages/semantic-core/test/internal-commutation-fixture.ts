import {
  ControlStateKind,
  MappingExpressionKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  SemanticTransitionKind,
  applyInternalOperationStep,
  compareCanonicalStrings,
  initialState,
  projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type {
  AppliedInternalOperationStep,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
  UnnumberedCommittedTransitionRecord,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type ClosureModule = typeof import("../src/semantic-process-closure.ts");
export type InternalTransitionFootprint = import("../src/internal-transition-footprint.ts")
  .InternalTransitionFootprint;
export type InternalOccurrenceKind = import("../src/internal-transition-footprint.ts")
  .InternalOccurrenceKind;

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const closureModule = await import(
  new URL("../dist/semantic-process-closure.js", import.meta.url).href
) as ClosureModule;

export const {
  InternalOccurrenceKind,
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
  compareInternalTransitionPublicationSortKeys,
  deriveInternalTransitionFootprint,
  internalOperationFrontierIsPairwiseIndependent,
  internalOperationPairIsIndependent,
  internalTransitionFootprintsAreIndependent,
} = footprintModule;
export const { closeSupportedInternalOperations } = closureModule;

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

export const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "internal-commutation-test",
    sourceId: "internal-commutation-test",
    sourceOverlay: null,
    sourceSha256: "7".repeat(64),
  },
  processId: "Process_InternalCommutation",
  controlPlaces: [
    controlPlace("Flow_TaskInput"),
    controlPlace("Flow_TaskOutput"),
    controlPlace("Flow_TimerInput"),
    controlPlace("Flow_TimerOutput"),
  ],
  operations: [
    {
      ...operationBase("Task"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_TaskInput",
      output: "place:Flow_TaskOutput",
      task: { elementId: "Task", name: "Task" },
    },
    {
      ...operationBase("Timer"),
      kind: SemanticOperationKind.AwaitTimer,
      input: "place:Flow_TimerInput",
      output: "place:Flow_TimerOutput",
      timer: { elementId: "Timer", durationMs: 1000 },
    },
  ],
});

const owner = rootScopeOccurrence(
  program.processId,
  "Instance_InternalCommutation",
);

export const frontier: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: owner.processInstanceId,
  },
  scopeOccurrences: [{ id: owner, parent: null }],
  controlTokens: [
    { placeId: "place:Flow_TaskInput", owner, multiplicity: 1 },
    { placeId: "place:Flow_TimerInput", owner, multiplicity: 1 },
  ],
};

export const effectProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    ...program.identity,
    sourceId: "shared-effect-internal-commutation-test",
  },
  processId: "Process_SharedEffectCommutation",
  controlPlaces: [
    controlPlace("Flow_EffectLeftInput"),
    controlPlace("Flow_EffectLeftOutput"),
    controlPlace("Flow_EffectRightInput"),
    controlPlace("Flow_EffectRightOutput"),
  ],
  operations: [
    effectOperation(
      "operation:EffectLeft",
      "place:Flow_EffectLeftInput",
      "place:Flow_EffectLeftOutput",
    ),
    effectOperation(
      "operation:EffectRight",
      "place:Flow_EffectRightInput",
      "place:Flow_EffectRightOutput",
    ),
  ],
});

const effectOwner = rootScopeOccurrence(
  effectProgram.processId,
  "Instance_SharedEffectCommutation",
);

export const effectFrontier: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: effectOwner.processInstanceId,
  },
  scopeOccurrences: [{ id: effectOwner, parent: null }],
  controlTokens: [
    {
      placeId: "place:Flow_EffectLeftInput",
      owner: effectOwner,
      multiplicity: 1,
    },
    {
      placeId: "place:Flow_EffectRightInput",
      owner: effectOwner,
      multiplicity: 1,
    },
  ],
};

export const unsupportedProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    ...program.identity,
    sourceId: "unsupported-internal-commutation-test",
  },
  processId: "Process_UnsupportedCommutation",
  controlPlaces: [
    controlPlace("Flow_DuplicateInput"),
    controlPlace("Flow_DuplicateLeft"),
    controlPlace("Flow_DuplicateRight"),
    controlPlace("Flow_UnsupportedTaskInput"),
    controlPlace("Flow_UnsupportedTaskOutput"),
  ],
  operations: [
    {
      ...operationBase("Duplicate"),
      kind: SemanticOperationKind.Duplicate,
      input: "place:Flow_DuplicateInput",
      outputs: ["place:Flow_DuplicateLeft", "place:Flow_DuplicateRight"],
    },
    {
      ...operationBase("UnsupportedTask"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_UnsupportedTaskInput",
      output: "place:Flow_UnsupportedTaskOutput",
      task: { elementId: "UnsupportedTask", name: null },
    },
  ],
});

const unsupportedOwner = rootScopeOccurrence(
  unsupportedProgram.processId,
  "Instance_UnsupportedCommutation",
);

export const unsupportedFrontier: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: unsupportedOwner.processInstanceId,
  },
  scopeOccurrences: [{ id: unsupportedOwner, parent: null }],
  controlTokens: [
    {
      placeId: "place:Flow_DuplicateInput",
      owner: unsupportedOwner,
      multiplicity: 1,
    },
    {
      placeId: "place:Flow_UnsupportedTaskInput",
      owner: unsupportedOwner,
      multiplicity: 1,
    },
  ],
};

export function closeFrontier(
  selectedProgram: SemanticProcessProgram,
  state: RuntimeState,
  limit: number,
) {
  return closeSupportedInternalOperations(
    state,
    limit,
    (current) => enabledOperations(selectedProgram, current),
    (current, enabled) =>
      internalOperationFrontierIsPairwiseIndependent(
        selectedProgram,
        current,
        enabled,
      ),
  );
}

export function enabledOperations(
  selectedProgram: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<AppliedInternalOperationStep> {
  return selectedProgram.operations
    .map((operation) =>
      applyInternalOperationStep(selectedProgram, operation, state)
    )
    .filter(
      (
        candidate,
      ): candidate is AppliedInternalOperationStep => candidate !== null,
    )
    .sort(({ operation: left }, { operation: right }) =>
      compareCanonicalStrings(left.id, right.id)
    );
}

export function runExplicitOrder(
  selectedProgram: SemanticProcessProgram,
  state: RuntimeState,
  firstCandidate: AppliedInternalOperationStep,
  secondCandidate: AppliedInternalOperationStep,
): Readonly<{
  state: RuntimeState;
  transitions: ReadonlyArray<UnnumberedCommittedTransitionRecord>;
  lifecycles: ReadonlyArray<UnnumberedFlowNodeOccurrenceDelta>;
}> {
  const first = requireStep(
    applyInternalOperationStep(
      selectedProgram,
      firstCandidate.operation,
      state,
    ),
  );
  const second = requireStep(
    applyInternalOperationStep(
      selectedProgram,
      secondCandidate.operation,
      first.successor,
    ),
  );
  const firstFootprint = requireFootprint(
    selectedProgram,
    state,
    firstCandidate,
  );
  const secondFootprint = requireFootprint(
    selectedProgram,
    state,
    secondCandidate,
  );
  const units = [
    {
      step: first,
      before: state,
      sortKey: firstFootprint.publicationSortKey,
    },
    {
      step: second,
      before: first.successor,
      sortKey: secondFootprint.publicationSortKey,
    },
  ].sort((left, right) =>
    compareInternalTransitionPublicationSortKeys(left.sortKey, right.sortKey)
  );
  const transitions: UnnumberedCommittedTransitionRecord[] = [];
  const lifecycles: UnnumberedFlowNodeOccurrenceDelta[] = [];
  units.forEach(({ step, before }, transitionIndex) => {
    if (step.owner === null) {
      throw new TypeError("Internal commutation fixture requires an owner");
    }
    const positionDelta = projectControlPositionDelta(
      selectedProgram,
      before,
      step.successor,
    );
    if (positionDelta === null) {
      throw new TypeError("Internal commutation fixture requires a position delta");
    }
    transitions.push({
      logicalTimeMs: step.successor.logicalTimeMs,
      transition: {
        kind: SemanticTransitionKind.InternalOperation,
        operationId: step.operation.id,
        operationKind: step.operation.kind,
        origin: step.operation.origin,
        owner: step.owner,
      },
      positionDelta,
    });
    const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(
      selectedProgram,
      before,
      step.successor,
      {
        kind: "internal",
        operation: step.operation,
        owner: step.owner,
      },
      "internal-commutation-oracle",
      transitionIndex,
    );
    if (lifecycle === null) {
      throw new TypeError("Internal commutation fixture requires a lifecycle delta");
    }
    lifecycles.push(lifecycle);
  });
  return { state: second.successor, transitions, lifecycles };
}

export function requireFootprint(
  selectedProgram: SemanticProcessProgram,
  state: RuntimeState,
  candidate: AppliedInternalOperationStep,
): InternalTransitionFootprint {
  const footprint = deriveInternalTransitionFootprint(
    selectedProgram,
    state,
    candidate,
  );
  if (footprint === null) {
    throw new TypeError("Internal commutation fixture requires a footprint");
  }
  return footprint;
}

function requireStep(
  step: AppliedInternalOperationStep | null,
): AppliedInternalOperationStep {
  if (step === null || step.owner === null) {
    throw new TypeError("Internal commutation fixture requires an enabled owned step");
  }
  return step;
}

export function requireTwo<Value>(
  values: ReadonlyArray<Value>,
): readonly [Value, Value] {
  if (values.length !== 2) {
    throw new TypeError(`Expected two values, received ${values.length}`);
  }
  return [values[0]!, values[1]!];
}

function effectOperation(
  id: string,
  input: string,
  output: string,
): SemanticOperation {
  return {
    ...operationBase("SharedEffect"),
    id,
    kind: SemanticOperationKind.AwaitEffect,
    input,
    output,
    effect: {
      elementId: "SharedEffect",
      descriptor: {
        protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
        operation: "urn:bpmn-lean:effect-operation:probe-v1",
      },
      inputMappings: [{
        target: "request",
        expression: {
          kind: MappingExpressionKind.StringLiteral,
          value: "shared",
        },
      }],
      outputMappings: [],
    },
    bpmnErrorRoute: null,
  };
}
