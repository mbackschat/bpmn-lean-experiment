/** The private host addresses of a platform Schedule, derived inside Product 1 from its public tuple. */
import { engineDefinitionMessageStartWorkflowId, engineDefinitionScheduleId } from "@bpmn-lean/engine-api";

export type DefinitionSchedulePublicReference = Readonly<{
  processId: string;
  version: number;
  scheduleId: string;
}>;

/** A collision-resistant Schedule address from the complete public tuple. */
export function definitionScheduleHostId(reference: DefinitionSchedulePublicReference): string {
  return engineDefinitionScheduleId(reference);
}

/** The Workflow ID base of the Schedule's action, in the process host-address domain. */
export function definitionScheduleWorkflowIdBase(processInstanceId: string): string {
  return engineDefinitionMessageStartWorkflowId(processInstanceId);
}
