/**
 * The value one direct catch-Event Data Output Association contributes to a Message occurrence.
 *
 * Deliberately not the Activity write-back type. The four fields coincide, but the contracts differ
 * where it matters: on an Activity the `DataOutput` id is the name a completion command must submit
 * under, while here nothing outside the engine ever names it, because Clause 10.5.1 has the trigger
 * fill the output. Requiredness is also established differently, so a later capsule admitting
 * `optionalOutputRefs` changes what a missing value means for exactly one of the two.
 *
 * `associationId` and `sourceDataOutputName` are carried for evidence and presentation. Only
 * `targetPropertyId` decides where the delivered payload lands: resolving that by the output's name
 * would let two identically labelled outputs collide, and resolving it by the output's id would make
 * a routed implementation and a name-merged one agree whenever a model happens to spell them alike.
 */
import type { DeepReadonly } from "./deep-readonly.js";

export type DirectCatchEventPayloadOutput = DeepReadonly<{
  associationId: string;
  sourceDataOutputId: string;
  sourceDataOutputName: string | null;
  targetPropertyId: string;
}>;
