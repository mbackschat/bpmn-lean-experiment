import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./app-shell.module.css";

export const AppWorkspace = {
  Work: "work",
  Definitions: "definitions",
  Operations: "operations",
  About: "about",
} as const;

export type AppWorkspace = typeof AppWorkspace[keyof typeof AppWorkspace];

export type AppShellProps = Readonly<{
  activeWorkspace: AppWorkspace;
  about: ReactNode;
  definitions: ReactNode;
  onNavigate: (workspace: AppWorkspace) => void;
  operations: ReactNode;
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
  id: AppWorkspace.Operations,
  label: "Operations",
  heading: "Operations",
  summary: "Search Process instances, resolve current incidents, and review platform actions.",
}, {
  id: AppWorkspace.About,
  label: "About",
  heading: "About",
  summary: "Check this build's version, executable BPMN surface, and exact evidence boundaries.",
}];

export function AppShell({
  activeWorkspace,
  about,
  definitions,
  onNavigate,
  operations,
  work,
}: AppShellProps) {
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const previousWorkspace = useRef(activeWorkspace);
  const active = workspaceDetails.find(({ id }) => id === activeWorkspace);
  if (active === undefined) throw new Error("Unknown application workspace.");
  useEffect(() => {
    if (previousWorkspace.current === activeWorkspace) return;
    previousWorkspace.current = activeWorkspace;
    requestAnimationFrame(() => { pageHeading.current?.focus(); });
  }, [activeWorkspace]);
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
              variant={ButtonVariant.Navigation}
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
          <h1 ref={pageHeading} tabIndex={-1}>{active.heading}</h1>
          <p>{active.summary}</p>
        </header>
        <div className={styles.workspace}>
          {workspaceContent(activeWorkspace, { about, definitions, operations, work })}
        </div>
      </main>
    </div>
  );
}

function workspaceContent(
  workspace: AppWorkspace,
  content: Readonly<{
    about: ReactNode;
    definitions: ReactNode;
    operations: ReactNode;
    work: ReactNode;
  }>,
): ReactNode {
  switch (workspace) {
    case AppWorkspace.Work:
      return content.work;
    case AppWorkspace.Definitions:
      return content.definitions;
    case AppWorkspace.Operations:
      return content.operations;
    case AppWorkspace.About:
      return content.about;
  }
}
