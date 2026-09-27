import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import { AppShell, AppWorkspace } from "./app-shell";
import { WorkWorkspace } from "./work-workspace";
import { validateDefinitionSearch, validateOperationsSearch, validateWorkSearch } from "./navigation/route-search.ts";
import type { DefinitionSearch, OperationsSearch, WorkSearch, WorkspaceNavigation } from "./navigation/route-search.ts";

const DefinitionWorkspace = lazy(async () => ({ default: (await import("./deferred-definition-workspace")).DeferredDefinitionWorkspace }));
const OperationsWorkspace = lazy(async () => ({ default: (await import("./deferred-operations-workspace")).DeferredOperationsWorkspace }));
const CapabilitiesPanel = lazy(async () => ({ default: (await import("./capabilities-panel")).CapabilitiesPanel }));

export type AppProps = Readonly<{ origin: string; productVersion: string }>;

export function App({ origin, productVersion }: AppProps) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const workspace = workspaceAt(location.pathname);
  const [initialInstance, setInitialInstance] = useState<PublicProcessInstanceIdentity>();
  const [retained, setRetained] = useState<Partial<Record<AppWorkspace, string>>>({});
  const retainedRef = useRef(retained);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ work: WorkSearch; definitions: DefinitionSearch; operations: OperationsSearch }>({ work: {}, definitions: {}, operations: {} });
  const routeSearch = useMemo(() => ({
    work: validateWorkSearch(location.search),
    definitions: validateDefinitionSearch(location.search),
    operations: validateOperationsSearch(location.search),
  }), [location.search]);
  const workSearch = workspace === AppWorkspace.Work ? routeSearch.work : saved.work;
  const definitionSearch = workspace === AppWorkspace.Definitions ? routeSearch.definitions : saved.definitions;
  const operationsSearch = workspace === AppWorkspace.Operations ? routeSearch.operations : saved.operations;
  useEffect(() => {
    if (workspace !== null && workspace !== AppWorkspace.About) {
      setSaved((current) => current[workspace] === routeSearch[workspace]
        ? current : { ...current, [workspace]: routeSearch[workspace] });
    }
    setNotice(null);
  }, [workspace, routeSearch]);

  const retain = useCallback((scope: AppWorkspace, key: string | null) => {
    const current = retainedRef.current;
    if (current[scope] === (key ?? undefined)) return;
    const next = { ...current };
    if (key === null) delete next[scope];
    else next[scope] = key;
    retainedRef.current = next;
    setRetained(next);
  }, []);
  useBlocker({
    enableBeforeUnload: Object.keys(retained).length > 0,
    shouldBlockFn: ({ next }) => {
      const retained = retainedRef.current;
      let blocked = false;
      switch (next.pathname) {
        case "/work": blocked = retained.work !== undefined && validateWorkSearch(next.search).task !== retained.work; break;
        case "/operations": blocked = retained.operations !== undefined && validateOperationsSearch(next.search).incident !== retained.operations; break;
        case "/definitions": blocked = retained.definitions !== undefined && validateDefinitionSearch(next.search).model !== retained.definitions; break;
        case "/about": break;
        default: blocked = Object.keys(retained).length > 0;
      }
      if (blocked) setNotice("Resolve the pending or uncertain action before leaving its selected item.");
      return blocked;
    },
  });
  const workNavigation = useMemo<WorkspaceNavigation<WorkSearch>>(() => ({
    search: workSearch,
    navigate: (search, replace = false) => {
      if (router.state.location.pathname === "/work") void router.navigate({ to: "/work", search, replace });
      else setSaved((current) => ({ ...current, work: search }));
    },
    retainSelection: (key) => retain(AppWorkspace.Work, key),
  }), [router, workSearch, retain]);
  const definitionNavigation = useMemo<WorkspaceNavigation<DefinitionSearch>>(() => ({
    search: definitionSearch,
    navigate: (search, replace = false) => {
      if (router.state.location.pathname === "/definitions") void router.navigate({ to: "/definitions", search, replace });
      else setSaved((current) => ({ ...current, definitions: search }));
    },
    retainSelection: (key) => retain(AppWorkspace.Definitions, key),
  }), [router, definitionSearch, retain]);
  const operationsNavigation = useMemo<WorkspaceNavigation<OperationsSearch>>(() => ({
    search: operationsSearch,
    navigate: (search, replace = false) => {
      if (router.state.location.pathname === "/operations") void router.navigate({ to: "/operations", search, replace });
      else setSaved((current) => ({ ...current, operations: search }));
    },
    retainSelection: (key) => retain(AppWorkspace.Operations, key),
  }), [router, operationsSearch, retain]);

  function destination(next: AppWorkspace) {
    switch (next) {
      case AppWorkspace.Work: return { to: "/work", search: workSearch } as const;
      case AppWorkspace.Definitions: return { to: "/definitions", search: definitionSearch } as const;
      case AppWorkspace.Operations: return { to: "/operations", search: operationsSearch } as const;
      case AppWorkspace.About: return { to: "/about" } as const;
    }
  }
  if (workspace === null) return <main><h1>Page unavailable</h1><p>This link does not identify an application page.</p><a href="#/work">Go to Work</a></main>;
  return (
    <>
      {notice === null ? null : <p role="alert">{notice}</p>}
      <AppShell
        activeWorkspace={workspace}
        homeHref={router.history.createHref(router.buildLocation({ to: "/work", search: {} }).href)}
        onHome={() => { void router.navigate({ to: "/work", search: {} }); }}
        navigationHref={(next) => router.history.createHref(router.buildLocation(destination(next)).href)}
        onNavigate={(next) => { void router.navigate(destination(next)); }}
        about={<Suspense fallback={<WorkspaceLoadingStatus />}><CapabilitiesPanel productVersion={productVersion} /></Suspense>}
        work={<WorkWorkspace origin={origin} navigation={workNavigation} />}
        operations={<Suspense fallback={<WorkspaceLoadingStatus />}><OperationsWorkspace origin={origin} navigation={operationsNavigation} {...(initialInstance === undefined ? {} : { initialInstance })} /></Suspense>}
        definitions={<Suspense fallback={<WorkspaceLoadingStatus />}><DefinitionWorkspace origin={origin} navigation={definitionNavigation} onOpenInstance={(instance) => {
          setInitialInstance(instance);
          void router.navigate({ to: "/operations", search: { instance: instance.processInstanceId } });
        }} /></Suspense>}
      />
    </>
  );
}

function workspaceAt(path: string): AppWorkspace | null {
  switch (path) {
    case "/work": return AppWorkspace.Work;
    case "/definitions": return AppWorkspace.Definitions;
    case "/operations": return AppWorkspace.Operations;
    case "/about": return AppWorkspace.About;
    default: return null;
  }
}
function WorkspaceLoadingStatus() { return <p role="status">Loading workspace…</p>; }
