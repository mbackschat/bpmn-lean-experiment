import { asElement } from "../moddle-graph.js";
import type { ElementRecord } from "../moddle-graph.js";
import { asyncContinuations } from "./build.js";
import { associationSourceId, associationTargetId, conditionExpression, valueExpression } from "./data.js";
import { ReadRefusal, ReadRefusalCode, list, optionalId, text } from "./model.js";
import type { ReadContext } from "./model.js";
import { ctor, variable } from "./wire.js";
import type { KernelJson } from "./wire.js";

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
  const collectionVariable = collectionAssociation === undefined ? optionalId(inputCollection ?? {}) : associationSourceId(collectionAssociation);
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
      outputCollection: collectionOutput === undefined ? optionalId(outputCollection ?? {}) : associationTargetId(collectionOutput),
      // No source attribute selects a sequential re-read (PC-MI-08); the reader carries the entry snapshot.
      mutableCollection: "entrySnapshot",
      ...asyncContinuations(ctx, loop),
      loopDataInputRef: optionalId(inputCollection ?? {}),
      inputDataItemName: inputDataItem === undefined ? null : text(inputDataItem, "name"),
    },
  };
}

function loopCount(ctx: ReadContext, activity: ElementRecord, cibCollection: string | null, collectionVariable: string | null,
  cardinality: ElementRecord | undefined): KernelJson {
  if (cibCollection !== null) {
    return ctor("collection", { items: /[#$]\{/u.test(cibCollection) ? valueExpression(cibCollection) : variable(cibCollection) });
  }
  if (collectionVariable !== null) return ctor("collection", { items: variable(collectionVariable) });
  if (cardinality === undefined) {
    throw new ReadRefusal(ReadRefusalCode.MultiInstanceWithoutCount, optionalId(activity), "neither a collection nor a cardinality");
  }
  return ctor("cardinality", { count: cardinalityExpression(ctx, cardinality) });
}

function cardinalityExpression(ctx: ReadContext, cardinality: ElementRecord): KernelJson {
  const body = text(cardinality, "body") ?? "";
  return /[#$]\{/u.test(body) ? valueExpression(body) : conditionExpression(ctx, cardinality);
}
