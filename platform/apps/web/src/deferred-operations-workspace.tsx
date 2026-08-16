import { useMemo } from "react";

import { DefinitionApiClient } from "./definitions-api.ts";
import { IncidentOperationsApiClient } from "./incident-operations-api.ts";
import { OperatorAuditApiClient } from "./operator-audit-api.ts";
import {
  OperationsWorkspace,
} from "./operations-workspace.tsx";
import type { OperationsWorkspaceProps } from "./operations-workspace.tsx";
import { ProcessExecutionApiClient } from "./process-execution-api.ts";
import { ProcessInstanceSearchApiClient } from "./process-instance-search-api.ts";

export type DeferredOperationsWorkspaceProps = Readonly<
  Omit<
    OperationsWorkspaceProps,
    "definitionApi" | "incidentApi" | "operatorAuditApi" | "processExecutionApi" | "processInstanceSearchApi"
  > & { origin: string }
>;

export function DeferredOperationsWorkspace({
  origin,
  ...props
}: DeferredOperationsWorkspaceProps) {
  const definitionApi = useMemo(() => new DefinitionApiClient(origin), [origin]);
  const incidentApi = useMemo(() => new IncidentOperationsApiClient(origin), [origin]);
  const operatorAuditApi = useMemo(() => new OperatorAuditApiClient(origin), [origin]);
  const processExecutionApi = useMemo(() => new ProcessExecutionApiClient(origin), [origin]);
  const processInstanceSearchApi = useMemo(
    () => new ProcessInstanceSearchApiClient(origin),
    [origin],
  );
  return (
    <OperationsWorkspace
      {...props}
      definitionApi={definitionApi}
      incidentApi={incidentApi}
      operatorAuditApi={operatorAuditApi}
      processExecutionApi={processExecutionApi}
      processInstanceSearchApi={processInstanceSearchApi}
    />
  );
}
