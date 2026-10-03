import { CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID, CallDataKind, SemanticOperationKind } from "@bpmn-lean/semantic-core";
import type { ScalarCallData, ScalarIoSpecification, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { callActivityProgram, callElementId, calledProcessId } from "./call-activity-fixture.ts";

const io = (ownerId: string): ScalarIoSpecification => ({
  ownerId, id: `${ownerId}_io`, input: { id: `${ownerId}_input`, name: null },
  output: { id: `${ownerId}_output`, name: null },
  inputSet: { id: `${ownerId}_inputs`, name: null, dataInputRefs: [`${ownerId}_input`] },
  outputSet: { id: `${ownerId}_outputs`, name: null, dataOutputRefs: [`${ownerId}_output`] },
});
export const data: ScalarCallData = {
  kind: CallDataKind.Scalar, callerProperties: ["Receipt", "Request", "Result", "Unused"],
  call: io(callElementId), called: io(calledProcessId),
  directInput: { associationId: "CallInput", source: { kind: "property", propertyId: "Request" },
    targetDataInputId: `${callElementId}_input`, targetDataInputName: null },
  directOutput: { associationId: "CallOutput", sourceDataOutputId: `${callElementId}_output`,
    sourceDataOutputName: null, target: { kind: "property", propertyId: "Result" } },
};
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
export const program: SemanticProcessProgram = {
  ...callActivityProgram,
  identity: { ...callActivityProgram.identity, semanticProfile: CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID },
  definitionScopes: [...callActivityProgram.definitionScopes].sort((a, b) => compare(a.id, b.id)),
  operationScopes: [...callActivityProgram.operationScopes].sort((a, b) => compare(a.operationId, b.operationId)),
  controlPlaceScopes: [...callActivityProgram.controlPlaceScopes].sort((a, b) => compare(a.controlPlaceId, b.controlPlaceId)),
  controlPlaces: [...callActivityProgram.controlPlaces].sort((a, b) => compare(a.id, b.id)),
  operations: callActivityProgram.operations.map((operation): SemanticOperation => {
    switch (operation.kind) {
      case SemanticOperationKind.InvokeProcess:
      case SemanticOperationKind.ReturnProcess: return { ...operation, data };
      case SemanticOperationKind.AwaitUserTask: {
        const called = operation.task.elementId === "Task_Called";
        return { ...operation, kind: SemanticOperationKind.AwaitDataInputOutputUserTask,
          directInput: { associationId: `${operation.task.elementId}_read`,
            source: called ? { kind: "processDataInput", dataInputId: data.called.input.id } : { kind: "property", propertyId: "Result" },
            targetDataInputId: `${operation.task.elementId}_input`, targetDataInputName: null },
          directOutput: { associationId: `${operation.task.elementId}_write`,
            sourceDataOutputId: `${operation.task.elementId}_output`, sourceDataOutputName: null,
            target: called ? { kind: "processDataOutput", dataOutputId: data.called.output.id } : { kind: "property", propertyId: "Receipt" } },
        };
      }
      default: return operation;
    }
  }).sort((a, b) => compare(a.id, b.id)),
};
