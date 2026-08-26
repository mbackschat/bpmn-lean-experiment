export const OperationsTab = {
  ProcessInstances: "process-instances",
  Incidents: "incidents",
  Audit: "audit",
} as const;

export type OperationsTab = typeof OperationsTab[keyof typeof OperationsTab];

export function operationsTabFromKey(key: string): OperationsTab {
  switch (key) {
    case OperationsTab.ProcessInstances:
      return OperationsTab.ProcessInstances;
    case OperationsTab.Incidents:
      return OperationsTab.Incidents;
    case OperationsTab.Audit:
      return OperationsTab.Audit;
    default:
      throw new Error("Unknown Operations tab.");
  }
}
