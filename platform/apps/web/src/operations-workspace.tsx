import { useEffect, useState } from "react";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import { WorkspaceTabs } from "@bpmn-lean/platform-ui-kit";

import { IncidentAuditPanel } from "./incident-audit-panel.tsx";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import { IncidentsPanel } from "./incidents-panel.tsx";
import type { DefinitionApiClient } from "./definitions-api.ts";
import type { ProcessInstanceSearchApi } from "./process-instance-search-api.ts";
import type { ProcessExecutionApi } from "./process-execution-api.ts";
import type { OperatorAuditApi } from "./operator-audit-api.ts";
import { ProcessInstanceSearchPanel } from "./process-instance-search-panel.tsx";
import type { OperationsSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import styles from "./operations-workspace.module.css";

export type OperationsWorkspaceProps = Readonly<{
  definitionApi: Pick<DefinitionApiClient, "getPresentation">;
  incidentApi: IncidentOperationsApi;
  operatorAuditApi: OperatorAuditApi;
  processExecutionApi: ProcessExecutionApi;
  processInstanceSearchApi: ProcessInstanceSearchApi;
  initialInstance?: PublicProcessInstanceIdentity;
  navigation?: WorkspaceNavigation<OperationsSearch>;
}>;

/** Full-width operational workspace grouped by instances, current incidents, and action audit. */
export function OperationsWorkspace({
  definitionApi,
  incidentApi,
  operatorAuditApi,
  processExecutionApi,
  processInstanceSearchApi,
  initialInstance,
  navigation,
}: OperationsWorkspaceProps) {
  const [localTab, setTab] = useState("process-instances");
  const tab = navigation?.search.tab ?? (navigation === undefined ? localTab : "process-instances");
  useEffect(() => {
    if (initialInstance !== undefined) setTab("process-instances");
  }, [initialInstance]);
  return (
    <div className={styles.workspace} data-ui="operations-workspace">
      <WorkspaceTabs
        aria-label="Operations"
        selectedKey={tab}
        onSelectionChange={(next) => {
          if (navigation === undefined) setTab(next);
          else if (next === "process-instances" || next === "incidents" || next === "audit") {
            navigation.navigate({ ...navigation.search, tab: next });
          }
        }}
        tabs={[{
          id: "process-instances",
          label: "Process instances",
          keepMounted: true,
          content: (
            <ProcessInstanceSearchPanel
              api={processInstanceSearchApi}
              definitionApi={definitionApi}
              executionApi={processExecutionApi}
              operatorAuditApi={operatorAuditApi}
              isActive={tab === "process-instances"}
              {...(navigation === undefined ? {} : { navigation })}
              {...(initialInstance === undefined ? {} : { initialInstance })}
            />
          ),
        }, {
          id: "incidents",
          label: "Incidents",
          keepMounted: true,
          content: (
            <IncidentsPanel
              api={incidentApi}
              definitionApi={definitionApi}
              isActive={tab === "incidents"}
              {...(navigation === undefined ? {} : { navigation })}
            />
          ),
        }, {
          id: "audit",
          label: "Audit",
          content: <IncidentAuditPanel api={incidentApi} isActive={tab === "audit"} />,
        }]}
      />
    </div>
  );
}
