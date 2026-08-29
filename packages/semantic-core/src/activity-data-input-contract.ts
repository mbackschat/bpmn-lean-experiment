/**
 * The reusable value one direct BPMN Data Input Association contributes to an Activity.
 *
 * Task-neutral on purpose: Clause 10.4.2's direct copy is a property of the association, not of the
 * Activity that owns it, so a later reviewed Task or Sub-Process operation may carry this same value
 * without reusing the User Task transition that introduced it.
 *
 * Every field is a source identity rather than a descriptive name. `sourcePropertyId` addresses the
 * Process Property by its exact BPMN `id`, and `targetDataInputId` names the Activity DataInput the
 * copied value is bound under, which is also the name the public observation publishes. Looking the
 * source up by `targetDataInputName` instead would make two differently named Properties collide
 * whenever a model reuses a label, so the name is carried for presentation and never for resolution.
 */
import type { DeepReadonly } from "./deep-readonly.js";

export type DirectActivityDataInput = DeepReadonly<{
  associationId: string;
  sourcePropertyId: string;
  targetDataInputId: string;
  targetDataInputName: string | null;
}>;
