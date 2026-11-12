import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { asyncContinuations } from "./build.js";
import { associationSourceId, associationSourceItem, associationTargetId, associationTargetItem, conditionExpression, valueExpression } from "./data.js";
import { ReadRefusal, ReadRefusalCode, itemName, list, optionalId, text } from "./model.js";
import { scan } from "./schema.js";
import type { XmlElement } from "./schema.js";
import type { ReadContext } from "./model.js";
import { ctor, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

const optionalItem = (element: ElementRecord | undefined): string | null =>
  element === undefined || optionalId(element) === null ? null : itemName(element);

export type MultiInstanceRead = Readonly<{
  multiInstance: KernelJson;
  /** Data Associations the loop owns, which are not also ordinary envelope mappings. */
  folded: ReadonlySet<ElementRecord>;
}>;

const noLoop: MultiInstanceRead = { multiInstance: null, folded: new Set() };

/**
 * The BPMN loop data are folded into the loop itself: the collection a `loopDataInputRef` reads, the Activity's
 * DataInput an `inputDataItem` feeds, its DataOutput an `outputDataItem` is fed from, and the collection a
 * `loopDataOutputRef` writes (BPMN 2.0.2 §10.2.8). A variable name is the id of the item-aware element holding it.
 * The loop also keeps the literal names CIB binds instead (CIB-INT-0014): the element `loopDataInputRef` names and the
 * `inputDataItem`'s `name`; and its own asynchronous continuations, which mark each instance (CIB-EXT-0027).
 */
export function readMultiInstance(ctx: ReadContext, activity: ElementRecord): MultiInstanceRead {
  const loop = asElement(activity.loopCharacteristics);
  if (loop === undefined) return noLoop;
  if (loop.$type !== "bpmn:MultiInstanceLoopCharacteristics") {
    throw new ReadRefusal(ReadRefusalCode.StandardLoop, optionalId(activity), String(loop.$type));
  }
  const inputs = list(activity, "dataInputAssociations");
  const outputs = list(activity, "dataOutputAssociations");
  const folded = new Set<ElementRecord>();

  const inputCollection = asElement(loop.loopDataInputRef);
  const collectionAssociation = inputs.find((association) => associationTargetId(association) === optionalId(inputCollection ?? {}));
  const itemAssociation = inputs.find((association) => associationSourceId(association) === optionalId(asElement(loop.inputDataItem) ?? {}));
  const outputCollection = asElement(loop.loopDataOutputRef);
  const collectionOutput = outputs.find((association) => associationSourceId(association) === optionalId(outputCollection ?? {}));
  const itemOutput = outputs.find((association) => associationTargetId(association) === optionalId(asElement(loop.outputDataItem) ?? {}));
  for (const association of [collectionAssociation, itemAssociation, collectionOutput, itemOutput]) {
    if (association !== undefined) folded.add(association);
  }

  const cibCollection = ctx.attribute(loop, "collection");
  const collectionVariable = collectionAssociation === undefined ? optionalItem(inputCollection) : associationSourceItem(collectionAssociation);
  const cardinality = asElement(loop.loopCardinality);
  const count = loopCount(ctx, activity, cibCollection, collectionVariable, cardinality);

  const completion = asElement(loop.completionCondition);
  const inputDataItem = asElement(loop.inputDataItem);
  const itemInputName = itemAssociation === undefined ? optionalId(inputDataItem ?? {}) : associationTargetId(itemAssociation);
  const itemOutputName = itemOutput === undefined ? optionalId(asElement(loop.outputDataItem) ?? {}) : associationSourceId(itemOutput);
  return {
    folded,
    multiInstance: {
      mode: loop.isSequential === true ? "sequential" : "parallel",
      count,
      elementVariable: ctx.attribute(loop, "elementVariable"),
      completionCondition: completion === undefined ? null : conditionExpression(ctx, completion),
      inputDataItem: itemInputName,
      outputDataItem: itemOutputName,
      outputCollection: collectionOutput === undefined ? optionalItem(outputCollection) : associationTargetItem(collectionOutput),
      ...asyncContinuations(ctx, loop),
      loopDataInputRef: optionalItem(inputCollection),
      inputDataItemName: inputDataItem === undefined ? null : text(inputDataItem, "name"),
    },
  };
}

/**
 * The loop's count. CIB reads `camunda:collection` as an expression when it contains `{` (`BpmnParse.java:1841-1848`);
 * a loop with both a cardinality and a collection keeps both, which CIB reads together. A cardinality is read like a
 * condition, with its declared language; an empty one is a deployment error in CIB (`:1827-1829`).
 */
function loopCount(ctx: ReadContext, activity: ElementRecord, cibCollection: string | null, collectionVariable: string | null,
  cardinality: ElementRecord | undefined): KernelJson {
  const items = cibCollection !== null
    ? (cibCollection.includes("{") ? valueExpression(cibCollection) : variable(cibCollection))
    : collectionVariable === null ? null : variable(collectionVariable);
  if (cardinality === undefined) {
    if (items === null) {
      throw new ReadRefusal(ReadRefusalCode.MultiInstanceWithoutCount, optionalId(activity), "neither a collection nor a cardinality");
    }
    return ctor("collection", { items });
  }
  if ((text(cardinality, "body") ?? "") === "") throw new ReadRefusal(ReadRefusalCode.EmptyLoopCardinality, optionalId(activity), optionalId(activity) ?? "");
  const count = conditionExpression(ctx, cardinality);
  return items === null ? ctor("cardinality", { count }) : ctor("countAndCollection", { count, items });
}

const loopBodies = new Set(["loopCardinality", "completionCondition", "loopDataInputRef"]);
const bpmnNamespace = "http://www.omg.org/spec/BPMN/20100524/MODEL";

/**
 * The first Multi-Instance loop body with a whitespace-only text node, which `moddle-xml` drops
 * (`dist/index.js:839-847`) while CIB keeps it (`util/xml/Element.java:192-196`), read from the exact source bytes:
 * the IL would hold a text CIB never evaluates. Evidence names the body and the nearest enclosing identifier.
 */
export function droppedLoopWhitespace(xml: string): Readonly<{ element: string | null; evidence: string }> | undefined {
  const walk = (element: XmlElement, nearest: string | null): Readonly<{ element: string | null; evidence: string }> | undefined => {
    if (element.namespace === bpmnNamespace && loopBodies.has(element.local) && element.droppedText) {
      return { element: nearest, evidence: `${element.local} of ${nearest ?? "the model"} has a whitespace-only text node` };
    }
    const id = element.attributes.find((attribute) => attribute.prefix === null && attribute.local === "id")?.value ?? nearest;
    for (const child of element.children) {
      const found = walk(child, id);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const root = scan(xml);
  return root === undefined ? undefined : walk(root, null);
}
