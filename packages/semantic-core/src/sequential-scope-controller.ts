import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { DeepReadonly } from "./deep-readonly.js";

/** SMIS-ENTER-01 fixes the total once; the outer Activity owns the sole current child identity. */
export type SequentialScopeController = DeepReadonly<{
  id: ActivityOccurrenceId;
  total: number;
  completed: number;
  currentItem: string;
}>;
