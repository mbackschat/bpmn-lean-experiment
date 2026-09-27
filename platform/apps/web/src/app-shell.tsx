import { Activity, useEffect, useRef, useState } from "react";
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
  navigationHref: (workspace: AppWorkspace) => string;
  homeHref: string;
  onHome: () => void;
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
  navigationHref,
  homeHref,
  onHome,
  operations,
  work,
}: AppShellProps) {
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const previousWorkspace = useRef(activeWorkspace);
  const [visited, setVisited] = useState<ReadonlySet<AppWorkspace>>(() => new Set([activeWorkspace]));
  const active = workspaceDetails.find(({ id }) => id === activeWorkspace);
  if (active === undefined) throw new Error("Unknown application workspace.");
  useEffect(() => {
    setVisited((current) => current.has(activeWorkspace) ? current : new Set([...current, activeWorkspace]));
    if (previousWorkspace.current === activeWorkspace) return;
    previousWorkspace.current = activeWorkspace;
    requestAnimationFrame(() => { pageHeading.current?.focus(); });
  }, [activeWorkspace]);
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href={homeHref} aria-label="BPMN Lean home"
          onClick={(event) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onHome();
          }}>
          <span className={styles.brandMark} aria-hidden="true">BL</span>
          <div>
            <strong>BPMN Lean</strong>
            <span>Platform</span>
          </div>
        </a>
        <nav className={styles.navigation} aria-label="Primary navigation">
          {workspaceDetails.map(({ id, label }) => (
            <a key={id} className={styles.navigationLink} href={navigationHref(id)}
              {...(id === activeWorkspace ? { "aria-current": "page" } : {})}
              onClick={(event) => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onNavigate(id);
              }}>{label}</a>
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
          {workspaceDetails.filter(({ id }) => visited.has(id) || id === activeWorkspace).map(({ id }) => (
            <Activity key={id} mode={id === activeWorkspace ? "visible" : "hidden"}>
              <div>{workspaceContent(id, { about, definitions, operations, work })}</div>
            </Activity>
          ))}
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
