import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceKey,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/platform-contracts";

declare const page: FlowNodeOccurrencePage;
declare const result: FlowNodeOccurrencePublicationResult;
declare const key: FlowNodeOccurrenceKey;

// @ts-expect-error occurrence batches are deeply immutable
page.batches[0]!.transitions[0]!.started.push({});
// @ts-expect-error an occurrence key is deeply immutable
page.batches[0]!.transitions[0]!.started[0]!.occurrence.activation = 2;
// @ts-expect-error a terminal fact is deeply immutable
page.batches[0]!.transitions[0]!.ended[0]!.terminal = "cancelled";

key.role satisfies "element" | "multiInstanceBody";
// @ts-expect-error an occurrence has no start-revision identity; the key is the identity
key.startRevision;
// @ts-expect-error a page lists no currently open occurrences
page.currentOpen;
// @ts-expect-error a batch carries no commit time
page.batches[0]!.committedAtEpochMs;

// An input that began and ended no occurrence still has its aligned batch.
const noOccurrences: FlowNodeOccurrenceBatch = { commandId: "c", fromRevision: 0, throughRevision: 1, transitions: [] };

if (result.kind === "gap") {
  // @ts-expect-error non-available arms carry no partial page
  result.page;
}
// @ts-expect-error the retired notReady kind is not a result kind
const notReady: FlowNodeOccurrencePublicationResult["kind"] = "notReady";
