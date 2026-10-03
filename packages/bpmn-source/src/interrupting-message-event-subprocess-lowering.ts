import { SemanticOperationKind, SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type { CheckedProcess, DefinitionScope, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { controlPlaceId } from "./semantic-process-identifiers.js";

/** The declaration retains dormant ownership; BPMN 10.3.5 supplies no normal-flow entry operation. */
export function isDeclaredMessageEventSubProcess(source: CheckedProcess, elementId: string): boolean {
  return source.interruptingMessageEventSubProcesses?.some((declaration) => declaration.elementId === elementId) ?? false;
}

export function lowerInterruptingMessageEventSubProcessDeclarations(
  source: CheckedProcess,
): Pick<SemanticProcessProgram, "interruptingMessageEventSubProcesses"> {
  return source.interruptingMessageEventSubProcesses === undefined ? {} : {
    interruptingMessageEventSubProcesses: source.interruptingMessageEventSubProcesses.map((declaration) => ({
      parentScopeId: declaration.parentScopeId, handlerScopeId: declaration.handlerScopeId,
      elementId: declaration.elementId, startEventId: declaration.startEventId,
      channel: declaration.channel, childEntry: controlPlaceId(declaration.childEntryFlowId),
    })),
  };
}

/** Handler retirement has no parent continuation, unlike ordinary embedded Sub-Process completion. */
export function lowerMessageEventSubProcessCompletion(
  scope: DefinitionScope,
  source: CheckedProcess,
): Readonly<{ operation: SemanticOperation; scopeId: string }> | undefined {
  const declaration = source.interruptingMessageEventSubProcesses?.find(({ handlerScopeId }) => handlerScopeId === scope.id);
  return declaration === undefined ? undefined : {
    scopeId: scope.id,
    operation: {
      id: `operation:complete-event-subprocess:${scope.id}`,
      kind: SemanticOperationKind.CompleteEventSubProcess,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: declaration.elementId },
      scopeId: scope.id,
    },
  };
}
