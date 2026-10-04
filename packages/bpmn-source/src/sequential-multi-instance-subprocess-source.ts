import { compareCanonicalStrings, isSerialBusinessIdentifier, MappingExpressionKind } from "@bpmn-lean/semantic-core";
import type { VariableMapping } from "@bpmn-lean/semantic-core";
import { locateContainedElements } from "./admission-diagnostics.js";
import { readSubProcessInputMappings } from "./business-task-mapping-source.js";
import { asElement, hasOnlyModelledKeys, readForeignAttributes, readId } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import { exactForeignAttributeRejections } from "./preserved-element-classification.js";

const namespace = "http://camunda.org/schema/1.0/bpmn";

export type SequentialSubProcessDeclaration = Readonly<{
  collectionName: string;
  itemName: string;
  completionBooleanName: string | null;
  bodyInputs: readonly VariableMapping[];
  requiredInitializationInputs: readonly string[];
}>;

/** SMIS-ADMIT-01 selects declaration syntax; complete graph, Start-data and operation-bound admission are separate. */
export function readSequentialSubProcessDeclaration(element: ElementRecord, definitions: ElementRecord,
  handlerNames: ReadonlySet<string>): SequentialSubProcessDeclaration | undefined {
  if (element.$type !== "bpmn:SubProcess" || readId(element) === undefined ||
      !hasOnlyModelledKeys(element, ["$type", "id", "name", "incoming", "outgoing", "flowElements", "loopCharacteristics", "extensionElements"])) return undefined;
  const loop = asElement(element.loopCharacteristics);
  if (loop?.$type !== "bpmn:MultiInstanceLoopCharacteristics" || loop.isSequential !== true ||
      !hasOnlyModelledKeys(loop, ["$type", "id", "isSequential", "completionCondition"])) return undefined;
  const attributes = readForeignAttributes(loop, definitions);
  if (attributes === undefined) return undefined;
  const collection = attributes.get(`${namespace}#collection`);
  const collectionName = isSerialBusinessIdentifier(collection) ? collection : reference(collection);
  const itemName = attributes.get(`${namespace}#elementVariable`);
  if (collectionName === undefined || !isSerialBusinessIdentifier(itemName)) return undefined;
  let completionBooleanName: string | null = null;
  if (loop.completionCondition !== undefined) {
    const condition = asElement(loop.completionCondition);
    if ((condition?.$type !== "bpmn:Expression" && condition?.$type !== "bpmn:FormalExpression") ||
        !hasOnlyModelledKeys(condition, ["$type", "id", "body"])) return undefined;
    const name = reference(condition.body);
    if (name === undefined) return undefined;
    completionBooleanName = name;
  }
  const owned = new Set([element, ...locateContainedElements(loop).keys()]);
  const extension = asElement(element.extensionElements);
  if (extension !== undefined) {
    for (const child of locateContainedElements(extension).keys()) owned.add(child);
  }
  const located = new Map([...locateContainedElements(definitions)].filter(([node]) => owned.has(node)));
  if (exactForeignAttributeRejections(definitions, located, (type, uri, name) =>
    type === "bpmn:MultiInstanceLoopCharacteristics" && uri === namespace &&
      (name === "collection" || name === "elementVariable")).length !== 0) return undefined;
  const names = [collectionName, itemName, ...(completionBooleanName === null ? [] : [completionBooleanName])];
  if (new Set(names).size !== names.length || names.some(name => handlerNames.has(name))) return undefined;
  const bodyInputs = readSubProcessInputMappings(element.extensionElements);
  if (bodyInputs === undefined || bodyInputs.some(mapping => names.includes(mapping.target) || handlerNames.has(mapping.target) ||
      (mapping.expression.kind === MappingExpressionKind.EnclosingVariable && handlerNames.has(mapping.expression.name)))) return undefined;
  // SMIS-DATA-01 evaluates every declaration in the same Process context, before any body local exists.
  const requiredInitializationInputs = [...new Set(bodyInputs.flatMap(mapping =>
    mapping.expression.kind === MappingExpressionKind.EnclosingVariable ? [mapping.expression.name] : []))].sort(compareCanonicalStrings);
  return { collectionName, itemName, completionBooleanName, bodyInputs, requiredInitializationInputs };
}

function reference(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(value)?.[1];
  return isSerialBusinessIdentifier(name) ? name : undefined;
}
