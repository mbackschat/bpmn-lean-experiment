/**
 * The reusable value one direct BPMN Data Output Association contributes to an Activity.
 *
 * Task-neutral for the same reason as its input sibling: Clause 10.4.2's write-back is a property of
 * the association rather than of the Activity that owns it, so a later reviewed Task or Sub-Process
 * operation may carry this value without reusing the User Task transition that introduced it.
 *
 * The direction is the mirror of `DirectActivityDataInput`. Here the Activity-owned `DataOutput` is
 * the association's source and the Process `Property` is its target, so a reader that copied the
 * input shape and only renamed its fields would have the write running backwards.
 *
 * Every field is a source identity rather than a descriptive name. `sourceDataOutputId` is the exact
 * BPMN `id` the completion command must name, and `targetPropertyId` is the Process Property the
 * association writes. Resolving either end by `sourceDataOutputName` would let two identically
 * labelled outputs collide, and would also make the completion contract change whenever a model is
 * relabelled, so the name is carried for presentation and never for resolution.
 */
import type { DeepReadonly } from "./deep-readonly.js";

export type DirectActivityDataOutput = DeepReadonly<{
  associationId: string;
  sourceDataOutputId: string;
  sourceDataOutputName: string | null;
  targetPropertyId: string;
}>;
