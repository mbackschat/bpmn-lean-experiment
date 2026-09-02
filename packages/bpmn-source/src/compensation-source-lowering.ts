/** Deterministic checked-to-Program binding for the Compensation source checkpoint. */
import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "@bpmn-lean/semantic-core";
import type {
  CheckedCompensationBody,
  CheckedProcess,
  CompensationActivityRetentionDeclaration,
  CompensationEventSubProcessSnapshotDeclaration,
  CompensationExecutionDeclaration,
  SemanticProcessProgram,
  TriggerCompensationOperation,
} from "@bpmn-lean/semantic-core";

import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
} from "./compensation-source-profile.js";
import {
  controlPlaceId,
  operationId,
} from "./semantic-process-identifiers.js";

type CompensationProgramDeclarations = Readonly<{
  compensationActivityRetention?: CompensationActivityRetentionDeclaration;
  compensationEventSubProcessSnapshots?: CompensationEventSubProcessSnapshotDeclaration;
  compensationExecution?: CompensationExecutionDeclaration;
}>;

export function lowerCompensationSourceDeclarations(
  source: CheckedProcess,
): CompensationProgramDeclarations {
  const declaration = source.compensation;
  if (declaration === undefined) return {};
  const root = onlyRootScope(source);
  const boundarySubjects = declaration.subjects.flatMap((subject) =>
    subject.kind === "boundaryActivity" ? [subject] : []
  );
  const eventSubjects = declaration.subjects.flatMap((subject) =>
    subject.kind === "eventSubProcess" ? [subject] : []
  );
  return {
    compensationActivityRetention: {
      definitionScopeId: root.id,
      targets: boundarySubjects.map((subject) => ({
        activityElementId: subject.subjectElementId,
        boundaryEventElementId: subject.boundaryEventElementId,
        compensationActivityElementId: subject.body.handlerElementId,
      })),
      limits: declaration.retentionLimits,
    },
    compensationEventSubProcessSnapshots: {
      targets: eventSubjects.map(({ parentScopeId, handlerScopeId }) => ({
        parentScopeId,
        handlerScopeId,
      })),
      limits: declaration.snapshotLimits,
    },
    compensationExecution: {
      definitionScopeId: root.id,
      triggerOperationId: operationId(declaration.triggerElementId),
      subjects: declaration.subjects.map((subject) =>
        subject.kind === "boundaryActivity"
          ? {
              kind: "boundaryActivity",
              subjectElementId: subject.subjectElementId,
              body: lowerBody(subject.body),
            }
          : {
              kind: "eventSubProcess",
              parentScopeId: subject.parentScopeId,
              handlerScopeId: subject.handlerScopeId,
              body: lowerBody(subject.body),
            }
      ),
      dependencies: declaration.dependencies.map((dependency) => ({
        ...dependency,
      })),
      limits: declaration.executionLimits,
    },
  };
}

export function lowerGlobalCompensationThrow(
  node: Extract<
    CheckedProcess["nodes"][number],
    { kind: CheckedNodeKind.GlobalSynchronousCompensationThrowEvent }
  >,
  source: CheckedProcess,
): TriggerCompensationOperation {
  const incoming = source.sequenceFlows.filter(({ targetId }) => targetId === node.id);
  const outgoing = source.sequenceFlows.filter(({ sourceId }) => sourceId === node.id);
  const input = incoming[0];
  const output = outgoing[0];
  if (
    incoming.length !== 1 || input === undefined ||
    outgoing.length !== 1 || output === undefined
  ) {
    throw new TypeError(`Compensation throw ${node.id} must have one input and one output`);
  }
  return {
    id: operationId(node.id),
    kind: SemanticOperationKind.TriggerCompensation,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId: node.id },
    definitionScopeId: onlyRootScope(source).id,
    input: controlPlaceId(input.id),
    output: controlPlaceId(output.id),
  };
}

export function isDormantCompensationScope(
  source: CheckedProcess,
  scopeId: string,
): boolean {
  return source.compensation?.subjects.some(
    (subject) => subject.kind === "eventSubProcess" &&
      subject.handlerScopeId === scopeId,
  ) === true;
}

/** Refuses any checked-to-Program drift in the trigger or the three existing declarations. */
export function compensationSourceDefinitionBindingValid(
  source: CheckedProcess,
  program: SemanticProcessProgram,
): boolean {
  if (
    source.identity.semanticProfile !== COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID ||
    program.identity.semanticProfile !== COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID ||
    source.compensation === undefined ||
    JSON.stringify(program.definitionScopes) !== JSON.stringify(source.definitionScopes)
  ) {
    return false;
  }
  const expected = lowerCompensationSourceDeclarations(source);
  const trigger = source.nodes.find(
    (node): node is Extract<
      CheckedProcess["nodes"][number],
      { kind: CheckedNodeKind.GlobalSynchronousCompensationThrowEvent }
    > => node.kind === CheckedNodeKind.GlobalSynchronousCompensationThrowEvent,
  );
  const actualTrigger = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.TriggerCompensation,
  );
  if (trigger === undefined || actualTrigger === undefined) return false;
  return JSON.stringify(actualTrigger) ===
      JSON.stringify(lowerGlobalCompensationThrow(trigger, source)) &&
    JSON.stringify(program.compensationActivityRetention) ===
      JSON.stringify(expected.compensationActivityRetention) &&
    JSON.stringify(program.compensationEventSubProcessSnapshots) ===
      JSON.stringify(expected.compensationEventSubProcessSnapshots) &&
    JSON.stringify(program.compensationExecution) ===
      JSON.stringify(expected.compensationExecution);
}

function lowerBody(
  body: CheckedCompensationBody,
): CompensationExecutionDeclaration["subjects"][number]["body"] {
  return {
    kind: "singleEffect",
    handlerElementId: body.handlerElementId,
    effectElementId: body.effectElementId,
    descriptor: body.descriptor,
    input: body.input.kind === "empty"
      ? { kind: "empty" }
      : {
          kind: "restoredProcessBinding",
          sourceName: body.input.sourcePropertyId,
          argumentName: body.input.targetDataInputId,
        },
  };
}

function onlyRootScope(source: CheckedProcess) {
  const roots = source.definitionScopes.filter(
    ({ parentScopeId, originElementId }) =>
      parentScopeId === null && originElementId === source.processId,
  );
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) {
    throw new TypeError("Compensation source must have exactly one Process root scope");
  }
  return root;
}
