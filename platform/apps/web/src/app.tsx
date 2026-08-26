import { lazy, Suspense, useState } from "react";

import { AppShell, AppWorkspace } from "./app-shell";
import { AudienceDemoPanel, AudienceDemoStep } from "./audience-demo-panel.tsx";
import { OperationsTab } from "./operations-navigation.ts";
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
  audienceMode?: boolean;
}>;

export function App({
  origin,
  productVersion,
  audienceMode = false,
}: AppProps) {
  const [workspace, setWorkspace] = useState<AppWorkspace>(AppWorkspace.Work);
  const [audienceVisible, setAudienceVisible] = useState(audienceMode);
  const [audienceStep, setAudienceStep] = useState<AudienceDemoStep>(AudienceDemoStep.Expense);
  const [operationsTab, setOperationsTab] = useState<OperationsTab>(OperationsTab.ProcessInstances);

  function selectAudienceStep(step: AudienceDemoStep): void {
    setAudienceStep(step);
    switch (step) {
      case AudienceDemoStep.Expense:
        setWorkspace(AppWorkspace.Work);
        return;
      case AudienceDemoStep.Deadline:
        setOperationsTab(OperationsTab.ProcessInstances);
        setWorkspace(AppWorkspace.Operations);
        return;
      case AudienceDemoStep.Incidents:
        setOperationsTab(OperationsTab.Incidents);
        setWorkspace(AppWorkspace.Operations);
        return;
      case AudienceDemoStep.Correctness:
        setWorkspace(AppWorkspace.About);
        return;
    }
  }

  return (
    <AppShell
      activeWorkspace={workspace}
      guide={audienceVisible ? (
        <AudienceDemoPanel
          activeStep={audienceStep}
          onExit={() => {
            setAudienceVisible(false);
            const url = new URL(window.location.href);
            url.searchParams.delete("audience");
            window.history.replaceState(null, "", url);
          }}
          onSelectStep={selectAudienceStep}
        />
      ) : null}
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
            audienceMode={audienceVisible}
            origin={origin}
            requestedTab={operationsTab}
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
