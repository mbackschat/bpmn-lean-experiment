/** The private host addresses of a platform Schedule, derived inside Product 1 from its public tuple. */
import { engineDefinitionScheduleId } from "@bpmn-lean/engine-api";

export type DefinitionSchedulePublicReference = Readonly<{
  processId: string;
  version: number;
  scheduleId: string;
}>;

/** A collision-resistant Schedule address from the complete public tuple. */
export function definitionScheduleHostId(reference: DefinitionSchedulePublicReference): string {
  return engineDefinitionScheduleId(reference);
}
