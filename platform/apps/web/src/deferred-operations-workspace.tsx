import { useMemo } from "react";

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
    "incidentApi" | "operatorAuditApi" | "processExecutionApi" | "processInstanceSearchApi"
  > & { origin: string }
>;

export function DeferredOperationsWorkspace({
  origin,
  ...props
}: DeferredOperationsWorkspaceProps) {
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
      incidentApi={incidentApi}
      operatorAuditApi={operatorAuditApi}
      processExecutionApi={processExecutionApi}
      processInstanceSearchApi={processInstanceSearchApi}
    />
  );
}
