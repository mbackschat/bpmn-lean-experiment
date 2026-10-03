/**
 * The reusable value one direct BPMN Data Output Association contributes to an Activity.
 *
 * Task-neutral for the same reason as its input sibling: Clause 10.4.2's write-back is a property of
 * the association rather than of the Activity that owns it, so a later reviewed Task or Sub-Process
 * operation may carry this value without reusing the User Task transition that introduced it.
 *
 * The Activity-owned DataOutput is the source; its typed target is either a containing Process
 * Property or Process DataOutput under Clause 10.4.1's direct association account. A called task's
 * Process output remains private until normal return and cannot write the caller's Property frame
 * (CDATA-OUTPUT-01).
 *
 * `sourceDataOutputId` is the exact BPMN identity the completion command must name; the target
 * endpoint determines the independently named destination. `sourceDataOutputName` is descriptive
 * and cannot redirect the association or change which completion field is required.
 */
import type { ActivityDataOutputTarget } from "./activity-data-endpoint.js";
import type { DeepReadonly } from "./deep-readonly.js";

export type DirectActivityDataOutput = DeepReadonly<{
  associationId: string;
  sourceDataOutputId: string;
  sourceDataOutputName: string | null;
  target: ActivityDataOutputTarget;
}>;
