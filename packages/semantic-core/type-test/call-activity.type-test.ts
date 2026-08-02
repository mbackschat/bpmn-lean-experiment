import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "../src/semantic-process-contract.js";
import type {
  CheckedNode,
  InvokeProcessOperation,
  ReturnProcessOperation,
} from "../src/semantic-process-contract.js";

const checkedCall = {
  kind: CheckedNodeKind.CallActivity,
  id: "Call_CalledProcess",
  calledProcessId: "CalledProcess",
} as const satisfies CheckedNode;

const invoke = {
  id: "operation:Call_CalledProcess",
  kind: SemanticOperationKind.InvokeProcess,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Call_CalledProcess" },
  input: "place:Flow_Caller_Start_Call",
  calledProcessId: "CalledProcess",
  calledRootScopeId: "scope:CalledProcess",
  calledEntry: "place:Flow_Called_Start_Task",
  returnOperationId: "operation:return-process:Call_CalledProcess",
} as const satisfies InvokeProcessOperation;

const returned = {
  id: "operation:return-process:Call_CalledProcess",
  kind: SemanticOperationKind.ReturnProcess,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Call_CalledProcess" },
  calledProcessId: "CalledProcess",
  calledRootScopeId: "scope:CalledProcess",
  callerOutput: "place:Flow_Caller_Call_Task",
} as const satisfies ReturnProcessOperation;

declare let checkedCallContract: Extract<
  CheckedNode,
  { kind: CheckedNodeKind.CallActivity }
>;
declare let invokeContract: InvokeProcessOperation;
declare let returnContract: ReturnProcessOperation;

// @ts-expect-error checked Call Activity identity is deeply immutable
checkedCallContract.calledProcessId = "OtherProcess";
// @ts-expect-error invocation pairing is deeply immutable
invokeContract.origin.elementId = "OtherCall";
// @ts-expect-error return ownership is deeply immutable
returnContract.calledRootScopeId = "scope:Other";
