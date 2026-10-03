/**
 * The reusable value one direct BPMN Data Input Association contributes to an Activity.
 *
 * Task-neutral on purpose: Clause 10.4.2's direct copy is a property of the association, not of the
 * Activity that owns it, so a later reviewed Task or Sub-Process operation may carry this same value
 * without reusing the User Task transition that introduced it.
 *
 * Clause 10.4.1 permits either a containing Process Property or a Process DataInput as the source.
 * Its typed endpoint resolves the exact BPMN identity under the Activity's complete runtime owner;
 * a called Process input never falls back to the hosting caller's Property frame (CDATA-OWNER-01).
 * `targetDataInputId` names the Activity's copied binding and published input. The optional
 * `targetDataInputName` is descriptive: changing a label cannot redirect the association.
 */
import type { ActivityDataInputSource } from "./activity-data-endpoint.js";
import type { DeepReadonly } from "./deep-readonly.js";

export type DirectActivityDataInput = DeepReadonly<{
  associationId: string;
  source: ActivityDataInputSource;
  targetDataInputId: string;
  targetDataInputName: string | null;
}>;
