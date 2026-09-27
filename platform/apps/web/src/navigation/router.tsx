import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { App } from "../app.tsx";
import { validateDefinitionSearch, validateOperationsSearch, validateWorkSearch } from "./route-search.ts";

export type AppContext = Readonly<{ origin: string; productVersion: string; queryClient: QueryClient }>;

const rootRoute = createRootRouteWithContext<AppContext>()({ component: RoutedApp });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", beforeLoad: () => { throw redirect({ to: "/work", replace: true }); } });
const workRoute = createRoute({ getParentRoute: () => rootRoute, path: "/work", validateSearch: validateWorkSearch });
const definitionsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/definitions", validateSearch: validateDefinitionSearch });
const operationsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/operations", validateSearch: validateOperationsSearch });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/about" });

function RoutedApp() {
  const context = rootRoute.useRouteContext();
  return <App origin={context.origin} productVersion={context.productVersion} />;
}

export function createAppRouter(context: AppContext, history: RouterHistory = createHashHistory()) {
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, workRoute, definitionsRoute, operationsRoute, aboutRoute]),
    context,
    history,
    defaultPreload: false,
    defaultNotFoundComponent: () => <p role="alert">This page is unavailable. Choose a workspace from the navigation.</p>,
  });
}

declare module "@tanstack/react-router" {
  interface Register { router: ReturnType<typeof createAppRouter> }
}
