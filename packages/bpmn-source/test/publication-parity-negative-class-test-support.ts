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
