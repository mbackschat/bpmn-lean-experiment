/**
 * Shared construction of the two derived Semantic Process program parts whose
 * identifier convention is fixed by lowering: a control place named after its
 * Sequence Flow and an operation named after its BPMN element.
 *
 * Every capsule fixture builds these identically, so the convention lives in
 * one place. Operation payloads stay with their owning capsule fixture.
 */
import { SemanticOriginKind } from "@bpmn-lean/semantic-core";
import type {
  BpmnElementOrigin,
  ControlPlace,
} from "@bpmn-lean/semantic-core";

/** The non-kind-specific head every `SemanticOperation` variant shares. */
export type SemanticOperationBase = Readonly<{
  id: string;
  origin: BpmnElementOrigin;
}>;

export function controlPlace(elementId: string): ControlPlace {
  return {
    id: `place:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnSequenceFlow,
      elementId,
    },
  };
}

export function operationBase(elementId: string): SemanticOperationBase {
  return {
    id: `operation:${elementId}`,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId,
    },
  };
}
