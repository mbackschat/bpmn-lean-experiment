import type { PublicIncident } from "@bpmn-lean/platform-contracts";

export function incidentSelectionAfterTabChange(
  incidentsActive: boolean,
  selected: PublicIncident | null,
): PublicIncident | null {
  return incidentsActive ? selected : null;
}

export function incidentDetailPresentation(noLongerCurrent: boolean): Readonly<{
  backLabel: string;
  eyebrow: string;
  overviewLabel: string;
}> {
  return noLongerCurrent
    ? {
        backLabel: "Return to Incidents",
        eyebrow: "Retained action status, no longer current",
        overviewLabel: "Incident action status, no longer current",
      }
    : {
        backLabel: "Back to incidents",
        eyebrow: "Exact current incident",
        overviewLabel: "Incident overview",
      };
}
