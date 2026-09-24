import type {
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
  StateObservation,
} from "@bpmn-lean/platform-contracts";

declare const page: ExecutionPublicationPage;
declare const publication: ExecutionPublicationExport;
declare const result: ExecutionPublicationResult;
declare const state: StateObservation;

declare const failed: Extract<StateObservation, { status: "failed" }>;
failed.failure.code satisfies string;
failed.failure.message satisfies string | null;
// @ts-expect-error failure occurrence identities remain deeply immutable
failed.failure.triggerId.activation = 2;
const { failure: _failure, ...withoutFailure } = failed;
// @ts-expect-error terminal failure cannot omit its reason
const missingFailure: StateObservation = withoutFailure;
// @ts-expect-error ordinary states cannot acquire a failure payload
const misplacedFailure: StateObservation = { ...failed, status: "running" };

// @ts-expect-error publication pages are deeply immutable
page.batches[0]!.transitions[0]!.positionDelta.enteredScopes.push({});
// @ts-expect-error current semantic values are deeply immutable
page.current!.state.variables[0]!.value.kind = "null";
// @ts-expect-error export definition identity is immutable
publication.definition.sourceOverlay = null;
state.openMultiInstances![0]!.id.activityElementId satisfies string;
state.openMultiInstances![0]!.activeIterations[0]!.taskId.elementId satisfies string;
// @ts-expect-error Multi-Instance progress and nested identities are deeply immutable
state.openMultiInstances![0]!.activeIterations[0]!.taskId.activation = 2;

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
