import type { PublicIncident } from "@bpmn-lean/platform-contracts";

export function incidentKey(incident: PublicIncident): string {
  const { effectId } = incident.incident.id;
  return JSON.stringify([
    incident.hostingInstance.processInstanceId,
    effectId.processInstanceId,
    effectId.elementId,
    effectId.activation,
    incident.incident.id.generation,
  ]);
}
