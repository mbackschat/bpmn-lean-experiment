import {
  CheckedNodeKind,
  SemanticOperationKind,
  SemanticOriginKind,
} from "../src/index.js";
import type {
  CheckedNode,
  SemanticOperation,
} from "../src/index.js";

const terminateNode = {
  kind: CheckedNodeKind.TerminateEndEvent,
  id: "EndEvent_Terminate",
} as const satisfies Extract<
  CheckedNode,
  { kind: CheckedNodeKind.TerminateEndEvent }
>;

const terminateOperation = {
  kind: SemanticOperationKind.TerminateScope,
  id: "operation:EndEvent_Terminate",
  origin: {
    kind: SemanticOriginKind.BpmnElement,
    elementId: "EndEvent_Terminate",
  },
  input: "place:Flow_TriggerToTerminate",
  scopeId: "scope:SubProcess_Work",
} as const satisfies Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.TerminateScope }
>;

// @ts-expect-error checked node contracts are deeply immutable
terminateNode.id = "EndEvent_Other";
// @ts-expect-error operation contracts are deeply immutable at the top level
terminateOperation.scopeId = "scope:Other";
// @ts-expect-error nested operation origins are deeply immutable
terminateOperation.origin.elementId = "EndEvent_Other";
// @ts-expect-error TerminateScope has no direct continuation output
terminateOperation.output;
