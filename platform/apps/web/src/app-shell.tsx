import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";
import type { ReactNode } from "react";

import styles from "./app-shell.module.css";

export const AppWorkspace = {
  Work: "work",
  Definitions: "definitions",
  ProcessInstances: "processInstances",
} as const;

export type AppWorkspace = typeof AppWorkspace[keyof typeof AppWorkspace];

export type AppShellProps = Readonly<{
  activeWorkspace: AppWorkspace;
  definitions: ReactNode;
  onNavigate: (workspace: AppWorkspace) => void;
  processInstances: ReactNode;
  work: ReactNode;
}>;

const workspaceDetails: ReadonlyArray<Readonly<{
  id: AppWorkspace;
  label: string;
  heading: string;
  summary: string;
}>> = [{
  id: AppWorkspace.Work,
  label: "Work",
  heading: "Work",
  summary: "Find, claim, and complete the work currently available to you.",
}, {
  id: AppWorkspace.Definitions,
  label: "Definitions",
  heading: "Definitions",
  summary: "Deploy BPMN, inspect retained versions, and operate one exact definition.",
}, {
  id: AppWorkspace.ProcessInstances,
  label: "Process instances",
  heading: "Process instances",
  summary: "Search the public identity of confirmed Product 2 starts.",
}];

export function AppShell({
  activeWorkspace,
  definitions,
  onNavigate,
  processInstances,
  work,
}: AppShellProps) {
  const active = workspaceDetails.find(({ id }) => id === activeWorkspace);
  if (active === undefined) throw new Error("Unknown application workspace.");
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">BL</span>
          <div>
            <strong>BPMN Lean</strong>
            <span>Platform</span>
          </div>
        </div>
        <nav className={styles.navigation} aria-label="Primary navigation">
          {workspaceDetails.map(({ id, label }) => (
            <Button
              key={id}
              className={styles.navigationItem!}
              variant={ButtonVariant.Plain}
              {...(id === activeWorkspace ? { "aria-current": "page" } : {})}
              onPress={() => { onNavigate(id); }}
            >
              {label}
            </Button>
          ))}
        </nav>
        <p className={styles.identity}>Signed in as <strong>demo-user</strong></p>
      </aside>
      <main className={styles.content}>
        <header className={styles.header}>
          <h1>{active.heading}</h1>
          <p>{active.summary}</p>
        </header>
        <div className={styles.workspace}>
          {workspaceContent(activeWorkspace, { definitions, processInstances, work })}
        </div>
      </main>
    </div>
  );
}

function workspaceContent(
  workspace: AppWorkspace,
  content: Readonly<{
    definitions: ReactNode;
    processInstances: ReactNode;
    work: ReactNode;
  }>,
): ReactNode {
  switch (workspace) {
    case AppWorkspace.Work:
      return content.work;
    case AppWorkspace.Definitions:
      return content.definitions;
    case AppWorkspace.ProcessInstances:
      return content.processInstances;
  }
}
