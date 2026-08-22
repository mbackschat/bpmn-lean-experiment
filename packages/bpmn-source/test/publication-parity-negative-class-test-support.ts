import assert from "node:assert/strict";

import type {
  RuntimeState,
  SemanticProcessProgram,
} from "../../semantic-core/src/index.ts";

/**
 * Malformed committed-execution states whose rejection the Lean reference interpreter and the
 * independently written semantic core must agree on, by case name rather than by shared code.
 *
 * This owner constructs the malformed states and reports which named class the core refuses; the
 * parity test owns the comparison against Lean's own refusals. Splitting them keeps a new negative
 * class a change to one construction site instead of to the assertion that consumes it.
 *
 * Every state here must be unreachable by construction. A class that an admitted transition can
 * actually produce is a semantic defect rather than a negative witness, and belongs in the
 * capsule that owns that transition.
 */
export type LeanProjectionRejections = Readonly<{
  unassociatedParentlessRoot: boolean;
  completedWithLivePositions: boolean;
  calledRootProcessDrift: boolean;
}>;

export type CalledAssociationRejections = Readonly<{
  duplicateCalledProcessRecords: boolean;
  nonDerivedCalledRootInstance: boolean;
}>;

export type ProjectionRejections = LeanProjectionRejections & CalledAssociationRejections;

/**
 * The exact core surface these constructions need. It is deliberately narrower than the parity
 * test's own API slice, so a future negative class cannot quietly reach a transition or replay
 * entry point from here.
 */
export type NegativeClassProjectionApi = Pick<
  typeof import("../../semantic-core/src/index.ts"),
  "ControlStateKind" | "deriveCalledProcessInstanceId" | "projectCurrentControlPositions"
>;

export function projectNegativePositionClasses(
  semanticCore: NegativeClassProjectionApi,
  program: SemanticProcessProgram,
  state: RuntimeState,
): ProjectionRejections {
  const hostingRoot = state.scopeOccurrences[0];
  const startFlowPlace = program.controlPlaces.find(
    ({ origin }) => origin.elementId === "Flow_StartToFork",
  );
  assert.ok(hostingRoot !== undefined);
  assert.ok(startFlowPlace !== undefined);

  const unassociatedRootState: RuntimeState = {
    ...state,
    scopeOccurrences: [
      ...state.scopeOccurrences,
      {
        id: {
          ...hostingRoot.id,
          processInstanceId: "Instance_Rogue",
        },
        parent: null,
      },
    ],
  };
  const completedWithLivePositionsState: RuntimeState = {
    ...state,
    control: {
      kind: semanticCore.ControlStateKind.Completed,
      instanceId: hostingRoot.id.processInstanceId,
    },
    controlTokens: [{
      placeId: startFlowPlace.id,
      owner: hostingRoot.id,
      multiplicity: 1,
    }],
  };

  const callActivityElementId = "CallActivity_Parity";
  const calledProcessId = "CalledProcess_Parity";
  const calledRoot = {
    id: {
      processInstanceId: semanticCore.deriveCalledProcessInstanceId(
        hostingRoot.id.processInstanceId,
        callActivityElementId,
        1,
      ),
      definitionScopeId: "scope:CalledProcess_Parity",
      activation: 1,
    },
    parent: null,
  } as const;
  const calledProgram: SemanticProcessProgram = {
    ...program,
    definitionScopes: [
      ...program.definitionScopes,
      {
        id: calledRoot.id.definitionScopeId,
        parentScopeId: null,
        originElementId: calledProcessId,
      },
    ],
  };
  const calledRecord = {
    id: {
      processInstanceId: hostingRoot.id.processInstanceId,
      elementId: callActivityElementId,
      activation: 1,
    },
    caller: hostingRoot.id,
    calledProcessId,
    calledRoot: calledRoot.id,
    returnOperationId: "operation:return-process:CallActivity_Parity",
  } as const;
  const calledTreeState: RuntimeState = {
    ...state,
    scopeOccurrences: [...state.scopeOccurrences, calledRoot],
    calledProcessOccurrences: [calledRecord],
  };
  assert.notEqual(
    semanticCore.projectCurrentControlPositions(calledProgram, calledTreeState),
    null,
    "an exactly associated called-Process root must remain projectable",
  );
  const calledRootProcessDriftState: RuntimeState = {
    ...calledTreeState,
    calledProcessOccurrences: calledTreeState.calledProcessOccurrences.map(
      (record) => ({ ...record, calledProcessId: "CalledProcess_Drift" }),
    ),
  };
  const nonDerivedRoot = {
    ...calledRoot,
    id: { ...calledRoot.id, processInstanceId: "call:not-derived" },
  } as const;

  return {
    unassociatedParentlessRoot:
      semanticCore.projectCurrentControlPositions(program, unassociatedRootState) === null,
    completedWithLivePositions:
      semanticCore.projectCurrentControlPositions(
        program,
        completedWithLivePositionsState,
      ) === null,
    calledRootProcessDrift:
      semanticCore.projectCurrentControlPositions(
        calledProgram,
        calledRootProcessDriftState,
      ) === null,
    duplicateCalledProcessRecords:
      semanticCore.projectCurrentControlPositions(calledProgram, {
        ...calledTreeState,
        calledProcessOccurrences: [calledRecord, calledRecord],
      }) === null,
    nonDerivedCalledRootInstance:
      semanticCore.projectCurrentControlPositions(calledProgram, {
        ...calledTreeState,
        scopeOccurrences: [...state.scopeOccurrences, nonDerivedRoot],
        calledProcessOccurrences: [{ ...calledRecord, calledRoot: nonDerivedRoot.id }],
      }) === null,
  };
}

/**
 * Which of the invariant's own malformed states this side refuses, by label.
 *
 * Labels are the shared contract with Lean, and nothing else is: the states are built here over the
 * core's own representation, in which every wait carries a composite occurrence identity, and the
 * verdict comes from the core's defect classes rather than from a translated conjunction. Agreement
 * therefore establishes that neither side transcribed the reviewed account wrongly, and cannot
 * establish that the account is right.
 */
export type LeanWellFormednessRejections = Readonly<{
  strandedWaitOwner: boolean;
  duplicateWaitIdentity: boolean;
  undeclaredWaitIdentity: boolean;
  unorderedCollection: boolean;
  notStartedWithWork: boolean;
}>;

/** The core surface the malformed-state constructions need, narrower than the parity test's own. */
export type WellFormednessProjectionApi = Pick<
  typeof import("../../semantic-core/src/index.ts"),
  "isWellFormedRuntimeState"
>;

/**
 * Refusal of each named malformed class, built by perturbing one field of a state the caller reached
 * by admitted execution.
 *
 * Perturbing a reachable state rather than constructing one from nothing is what makes each result
 * attributable: the unperturbed state is admitted, so a `true` here says the single named
 * perturbation is what the account refuses. The families differ from Lean's on purpose. Lean
 * perturbs a Timer wait and this side a User Task wait, because the classes are family-independent
 * and using the same family on both sides would let one family-specific mistake satisfy both.
 */
export function projectWellFormednessRejections(
  semanticCore: WellFormednessProjectionApi,
  program: SemanticProcessProgram,
  expectedInstanceId: string,
  reached: RuntimeState,
  emptyState: RuntimeState,
): LeanWellFormednessRejections {
  const [userTaskWait] = reached.userTaskWaits;
  assert.ok(userTaskWait !== undefined, "the reached state must hold one User Task wait");
  const refuses = (state: RuntimeState): boolean =>
    !semanticCore.isWellFormedRuntimeState(program, expectedInstanceId, state);

  assert.equal(
    refuses(reached),
    false,
    "the unperturbed state must be admitted, or every result below is unattributable",
  );

  return {
    strandedWaitOwner: refuses({
      ...reached,
      userTaskWaits: [{
        ...userTaskWait,
        owner: { ...userTaskWait.owner, activation: userTaskWait.owner.activation + 1 },
      }],
    }),
    duplicateWaitIdentity: refuses({
      ...reached,
      userTaskWaits: [userTaskWait, { ...userTaskWait, output: `${userTaskWait.output}:copy` }],
    }),
    undeclaredWaitIdentity: refuses({
      ...reached,
      userTaskWaits: [{
        ...userTaskWait,
        id: { ...userTaskWait.id, elementId: `${userTaskWait.id.elementId}_Injected` },
      }],
    }),
    unorderedCollection: refuses({
      ...reached,
      taskActivations: [
        { elementId: "Task_ZZZ", count: 1 },
        { elementId: "Task_AAA", count: 1 },
      ],
    }),
    notStartedWithWork: refuses({ ...emptyState, initiationPending: true }),
  };
}
