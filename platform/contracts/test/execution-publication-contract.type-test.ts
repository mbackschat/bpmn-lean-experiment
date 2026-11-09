import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionInputKind,
  ExecutionPublicationExport,
  ExecutionPublicationPage,
  ExecutionPublicationResult,
  ExecutionRole,
  ExecutionState,
  PublicJsonObject,
} from "@bpmn-lean/platform-contracts";

declare const page: ExecutionPublicationPage;
declare const publication: ExecutionPublicationExport;
declare const result: ExecutionPublicationResult;
declare const state: ExecutionState;
declare const role: ExecutionRole;

// @ts-expect-error publication pages are deeply immutable
page.batches[0]!.transitions[0]!.owner = 1;
// @ts-expect-error a step's role is deeply immutable
page.batches[0]!.transitions[0]!.role.kind = "idle";
// @ts-expect-error the current state is deeply immutable
page.current!.state.variables[0]!.name = "changed";
// @ts-expect-error export definition identity is immutable
publication.definition.sourceOverlay = null;
// @ts-expect-error export definition reference is immutable
publication.definition.ref.version = 2;

// The page's current state is absent until the head is reached; an export always has one.
page.current satisfies CurrentCommittedExecution | null;
publication.current.state.status satisfies ExecutionState["status"];
publication.batches[0].transitions[0].revision satisfies number;
state.openWaits[0]!.id.activation satisfies number;
state.openWaits[0]!.detail.kind satisfies string;
state.failure satisfies PublicJsonObject | undefined;
// @ts-expect-error a failure is a public JSON object, never null
const nullFailure: ExecutionState = { ...state, failure: null };

// @ts-expect-error a batch carries at least one micro-step
const emptyBatch: CommittedTransitionBatch = { commandId: "c", fromRevision: 0, throughRevision: 1, transitions: [] };
// @ts-expect-error an export carries at least one batch
const emptyExport: ExecutionPublicationExport = { ...publication, batches: [] };

switch (role.kind) {
  case "input":
    role.input satisfies ExecutionInputKind;
    // @ts-expect-error only the arrive arm names a flow
    role.flow;
    break;
  case "signal":
    role.signal satisfies string;
    break;
  case "arrive":
    role.flow satisfies string;
    break;
  case "idle":
    role.scope satisfies number;
    break;
}

switch (result.kind) {
  case "available":
    result.page.headRevision satisfies number;
    break;
  case "notFound":
  case "unavailable":
  case "gap":
  case "integrityFailure":
    // @ts-expect-error non-available arms carry no partial page
    result.page;
    break;
}

// @ts-expect-error the retired notReady kind is not a result kind
const notReady: ExecutionPublicationResult["kind"] = "notReady";
