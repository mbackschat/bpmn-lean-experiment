import type {
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
} from "@bpmn-lean/platform-contracts";

declare const page: ExecutionPublicationPage;
declare const publication: ExecutionPublicationExport;
declare const result: ExecutionPublicationResult;

// @ts-expect-error publication pages are deeply immutable
page.batches[0]!.transitions[0]!.positionDelta.enteredScopes.push({});
// @ts-expect-error current semantic values are deeply immutable
page.current!.state.variables[0]!.value.kind = "null";
// @ts-expect-error export definition identity is immutable
publication.definition.sourceOverlay = null;

switch (result.kind) {
  case "available":
    result.page.headRevision satisfies number;
    break;
  case "notReady":
  case "notFound":
  case "unavailable":
  case "gap":
    // @ts-expect-error non-available arms carry no partial page
    result.page;
    break;
}
