import { lazy, Suspense, useState } from "react";

import { AppShell, AppWorkspace } from "./app-shell";
import { WorkWorkspace } from "./work-workspace";

const DefinitionWorkspace = lazy(async () => ({
  default: (await import("./deferred-definition-workspace")).DeferredDefinitionWorkspace,
}));
const OperationsWorkspace = lazy(async () => ({
  default: (await import("./deferred-operations-workspace")).DeferredOperationsWorkspace,
}));
const CapabilitiesPanel = lazy(async () => ({
  default: (await import("./capabilities-panel")).CapabilitiesPanel,
}));

export type AppProps = Readonly<{
  origin: string;
  productVersion: string;
}>;

export function App({
  origin,
  productVersion,
}: AppProps) {
  const [workspace, setWorkspace] = useState<AppWorkspace>(AppWorkspace.Work);

  return (
    <AppShell
      activeWorkspace={workspace}
      about={(
        <Suspense fallback={<WorkspaceLoadingStatus />}>
          <CapabilitiesPanel productVersion={productVersion} />
        </Suspense>
      )}
      onNavigate={setWorkspace}
      work={<WorkWorkspace origin={origin} />}
      operations={(
        <Suspense fallback={<WorkspaceLoadingStatus />}>
          <OperationsWorkspace
            origin={origin}
          />
        </Suspense>
      )}
      definitions={(
        <Suspense fallback={<WorkspaceLoadingStatus />}>
          <DefinitionWorkspace
            origin={origin}
          />
        </Suspense>
      )}
    />
  );
}

function WorkspaceLoadingStatus() {
  return <p role="status">Loading workspace…</p>;
}
