import type {
  DefinitionScope,
} from "@bpmn-lean/semantic-core";
import {
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type {
  ElementRecord,
} from "./moddle-graph.js";

export type ScopedSourceElement = Readonly<{
  element: ElementRecord;
  scopeId: string;
}>;

export type ScopedFlowElements = Readonly<{
  definitionScopes: ReadonlyArray<DefinitionScope>;
  elements: ReadonlyArray<ScopedSourceElement>;
}>;

/**
 * Flattens FlowElementsContainer containment while preserving definition scope.
 *
 * This boundary accepts ordinary embedded SubProcesses only. Profile admission
 * separately limits the permitted scope count and node-kind multiset.
 */
export function collectScopedFlowElements(
  process: ElementRecord,
  processId: string,
  subProcessType: string,
): ScopedFlowElements | undefined {
  const rootScopeId = definitionScopeId(processId);
  const flowElements = asElementArray(process.flowElements);
  if (flowElements === undefined) {
    return undefined;
  }
  const definitionScopes: DefinitionScope[] = [{
    id: rootScopeId,
    parentScopeId: null,
    originElementId: processId,
  }];
  const elements: ScopedSourceElement[] = [];
  if (
    !collectScope(
      flowElements,
      rootScopeId,
      subProcessType,
      definitionScopes,
      elements,
    )
  ) {
    return undefined;
  }
  return { definitionScopes, elements };
}

function collectScope(
  flowElements: ReadonlyArray<ElementRecord>,
  scopeId: string,
  subProcessType: string,
  definitionScopes: DefinitionScope[],
  elements: ScopedSourceElement[],
): boolean {
  for (const element of flowElements) {
    elements.push({ element, scopeId });
    if (element.$type !== subProcessType) {
      continue;
    }
    const id = readId(element);
    const childElements = asElementArray(element.flowElements);
    if (
      id === undefined ||
      childElements === undefined ||
      !isPlainEmbeddedSubProcess(element)
    ) {
      return false;
    }
    const childScopeId = definitionScopeId(id);
    definitionScopes.push({
      id: childScopeId,
      parentScopeId: scopeId,
      originElementId: id,
    });
    if (
      !collectScope(
        childElements,
        childScopeId,
        subProcessType,
        definitionScopes,
        elements,
      )
    ) {
      return false;
    }
  }
  return true;
}

function isPlainEmbeddedSubProcess(element: ElementRecord): boolean {
  return hasOnlyModelledKeys(element, [
    "$type",
    "id",
    "name",
    "triggeredByEvent",
    "flowElements",
  ]) &&
    (element.name === undefined || typeof element.name === "string") &&
    (element.triggeredByEvent === undefined ||
      element.triggeredByEvent === false);
}

export function definitionScopeId(originElementId: string): string {
  return `scope:${originElementId}`;
}
