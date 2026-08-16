import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { DefinitionApiClient } from "./definitions-api.ts";
import { WorkInboxPanel } from "./work-inbox-panel.tsx";
import { WorkApiClient } from "./work-tasks-api.ts";

export type WorkWorkspaceProps = Readonly<{ origin: string }>;

export function WorkWorkspace({ origin }: WorkWorkspaceProps) {
  const [queryClient] = useState(() => new QueryClient());
  const definitionApi = useMemo(() => new DefinitionApiClient(origin), [origin]);
  const workApi = useMemo(() => new WorkApiClient(origin), [origin]);
  return (
    <QueryClientProvider client={queryClient}>
      <WorkInboxPanel api={workApi} definitionApi={definitionApi} />
    </QueryClientProvider>
  );
}
