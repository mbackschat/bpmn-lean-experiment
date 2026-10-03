import { InternalSchedulingMode, INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, MessageChannelKind,
  SemanticOperationKind, SemanticOriginKind, SemanticProcessCompilerId, SemanticProcessKind } from "@bpmn-lean/semantic-core";
import type { MessageChannel, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

export const channel: MessageChannel = { kind: MessageChannelKind.OperationMessage, messageId: "Message", interfaceId: "Interface", interfaceOperationId: "Operation" };
export const rootScopeId = "scope:Application";
export const handlerScopeId = "scope:Withdrawal";
const origin = (elementId: string) => ({ kind: SemanticOriginKind.BpmnElement as const, elementId });
const operations = ([
  { id: "op:start", kind: SemanticOperationKind.Initiate, origin: origin("Start"), output: "p:fork" },
  { id: "op:fork", kind: SemanticOperationKind.Duplicate, origin: origin("Fork"), input: "p:fork", outputs: ["p:a", "p:b"] },
  { id: "op:a", kind: SemanticOperationKind.AwaitUserTask, origin: origin("A"), input: "p:a", output: "p:end-a", task: { elementId: "A", name: "Eligibility" } },
  { id: "op:b", kind: SemanticOperationKind.AwaitUserTask, origin: origin("B"), input: "p:b", output: "p:end-b", task: { elementId: "B", name: "Documents" } },
  { id: "op:end-a", kind: SemanticOperationKind.ReachNoneEnd, origin: origin("EndA"), input: "p:end-a" },
  { id: "op:end-b", kind: SemanticOperationKind.ReachNoneEnd, origin: origin("EndB"), input: "p:end-b" },
  { id: "op:done", kind: SemanticOperationKind.CompleteScope, origin: origin("Application"), scopeId: rootScopeId, parentOutput: null },
  { id: "op:handler", kind: SemanticOperationKind.AwaitUserTask, origin: origin("WithdrawalTask"), input: "p:handler", output: "p:handler-end", task: { elementId: "WithdrawalTask", name: null } },
  { id: "op:handler-end", kind: SemanticOperationKind.ReachNoneEnd, origin: origin("WithdrawalEnd"), input: "p:handler-end" },
  { id: "op:handler-done", kind: SemanticOperationKind.CompleteEventSubProcess, origin: origin("Withdrawal"), scopeId: handlerScopeId },
] satisfies SemanticOperation[]).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const program: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess, internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess, semanticProfile: INTERRUPTING_MESSAGE_EVENT_SUBPROCESS_CHECKPOINT_PROFILE_ID, sourceId: "independent-program", sourceSha256: "e".repeat(64), sourceOverlay: null },
  processId: "Application",
  definitionScopes: [{ id: rootScopeId, parentScopeId: null, originElementId: "Application" }, { id: handlerScopeId, parentScopeId: rootScopeId, originElementId: "Withdrawal" }],
  operationScopes: operations.map(({ id }) => ({ operationId: id, scopeId: id.startsWith("op:handler") ? handlerScopeId : rootScopeId })),
  controlPlaceScopes: ["p:a", "p:b", "p:end-a", "p:end-b", "p:fork", "p:handler", "p:handler-end"].map((id) => ({ controlPlaceId: id, scopeId: id.startsWith("p:handler") ? handlerScopeId : rootScopeId })),
  controlPlaces: ["p:a", "p:b", "p:end-a", "p:end-b", "p:fork", "p:handler", "p:handler-end"].map((id) => ({ id, origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: `Flow-${id}` } })),
  operations,
  interruptingMessageEventSubProcesses: [{ parentScopeId: rootScopeId, handlerScopeId: handlerScopeId, elementId: "Withdrawal", startEventId: "MessageStart", channel, childEntry: "p:handler" }],
};
