import { useMemo } from "react";

import { DefinitionApiClient } from "./definitions-api.ts";
import { WorkInboxPanel } from "./work-inbox-panel.tsx";
import { WorkApiClient } from "./work-tasks-api.ts";
import type { WorkSearch, WorkspaceNavigation } from "./navigation/route-search.ts";

export type WorkWorkspaceProps = Readonly<{
  origin: string;
  navigation?: WorkspaceNavigation<WorkSearch>;
}>;

export function WorkWorkspace({ origin, navigation }: WorkWorkspaceProps) {
  const definitionApi = useMemo(() => new DefinitionApiClient(origin), [origin]);
  const workApi = useMemo(() => new WorkApiClient(origin), [origin]);
  return (
    <WorkInboxPanel api={workApi} definitionApi={definitionApi}
      {...(navigation === undefined ? {} : { navigation })} />
  );
}
