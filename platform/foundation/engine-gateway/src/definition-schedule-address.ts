import {
  temporalDefinitionScheduleId,
  temporalDefinitionScheduleWorkflowIdBase,
} from "@bpmn-lean/temporal-client/definition-schedule";

export type DefinitionSchedulePublicReference = Readonly<{
  processId: string;
  version: number;
  scheduleId: string;
}>;

/** Derives a collision-resistant private Schedule address from the complete public tuple. */
export function definitionScheduleHostId(
  reference: DefinitionSchedulePublicReference,
): string {
  return temporalDefinitionScheduleId(reference);
}

/** Uses the Process host-address domain while keeping semantic identity opaque. */
export function definitionScheduleWorkflowIdBase(
  processInstanceId: string,
): string {
  return temporalDefinitionScheduleWorkflowIdBase(processInstanceId);
}
