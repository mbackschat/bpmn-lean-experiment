import { useMemo } from "react";

import { DefinitionScheduleApiClient } from "./definition-schedule-api.ts";
import {
  DefinitionWorkspace,
} from "./definition-workspace.tsx";
import type { DefinitionWorkspaceProps } from "./definition-workspace.tsx";
import { FlowNodeMetricsApiClient } from "./flow-node-metrics-api.ts";
import { MessageStartPublicationApiClient } from "./message-start-publication-api.ts";

export type DeferredDefinitionWorkspaceProps = Readonly<
  Omit<
    DefinitionWorkspaceProps,
    "messageStartPublicationApi" | "metricsApi" | "scheduleApi"
  > & { origin: string }
>;

export function DeferredDefinitionWorkspace({
  origin,
  ...props
}: DeferredDefinitionWorkspaceProps) {
  const messageStartPublicationApi = useMemo(
    () => new MessageStartPublicationApiClient(origin),
    [origin],
  );
  const metricsApi = useMemo(() => new FlowNodeMetricsApiClient(origin), [origin]);
  const scheduleApi = useMemo(() => new DefinitionScheduleApiClient(origin), [origin]);
  return (
    <DefinitionWorkspace
      {...props}
      messageStartPublicationApi={messageStartPublicationApi}
      metricsApi={metricsApi}
      scheduleApi={scheduleApi}
    />
  );
}
