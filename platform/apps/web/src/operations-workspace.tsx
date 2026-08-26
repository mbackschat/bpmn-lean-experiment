import { useEffect, useState } from "react";

import { WorkspaceTabs } from "@bpmn-lean/platform-ui-kit";

import { IncidentAuditPanel } from "./incident-audit-panel.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import { IncidentsPanel } from "./incidents-panel.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import type { ProcessInstanceSearchApi } from "./process-instance-search-api.ts";
import type { ProcessExecutionApi } from "./process-execution-api.ts";
import type { OperatorAuditApi } from "./operator-audit-api.ts";
import { OperationsTab, operationsTabFromKey } from "./operations-navigation.ts";
import { ProcessInstanceSearchPanel } from "./process-instance-search-panel.tsx";
import styles from "./operations-workspace.module.css";

export type OperationsWorkspaceProps = Readonly<{
  audienceMode?: boolean;
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  incidentApi: IncidentOperationsApi;
  operatorAuditApi: OperatorAuditApi;
  processExecutionApi: ProcessExecutionApi;
  processInstanceSearchApi: ProcessInstanceSearchApi;
  requestedTab?: OperationsTab;
}>;

/** Full-width operational workspace grouped by instances, current incidents, and action audit. */
export function OperationsWorkspace({
  audienceMode = false,
  definitionApi,
  incidentApi,
  operatorAuditApi,
  processExecutionApi,
  processInstanceSearchApi,
  requestedTab = OperationsTab.ProcessInstances,
}: OperationsWorkspaceProps) {
  const [tab, setTab] = useState<OperationsTab>(requestedTab);
  useEffect(() => { setTab(requestedTab); }, [requestedTab]);
  return (
    <div className={styles.workspace} data-ui="operations-workspace">
      <WorkspaceTabs
        aria-label="Operations"
        selectedKey={tab}
        onSelectionChange={(key) => { setTab(operationsTabFromKey(key)); }}
        tabs={[{
          id: OperationsTab.ProcessInstances,
          label: "Process instances",
          content: (
            <ProcessInstanceSearchPanel
              api={processInstanceSearchApi}
              audienceMode={audienceMode}
              definitionApi={definitionApi}
              executionApi={processExecutionApi}
              operatorAuditApi={operatorAuditApi}
              isActive={tab === OperationsTab.ProcessInstances}
            />
          ),
        }, {
          id: OperationsTab.Incidents,
          label: "Incidents",
          content: (
            <IncidentsPanel
              api={incidentApi}
              definitionApi={definitionApi}
              isActive={tab === OperationsTab.Incidents}
            />
          ),
        }, {
          id: OperationsTab.Audit,
          label: "Audit",
          content: <IncidentAuditPanel api={incidentApi} isActive={tab === OperationsTab.Audit} />,
        }]}
      />
    </div>
  );
}
