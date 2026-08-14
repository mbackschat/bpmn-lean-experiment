import type {
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/platform-contracts";

declare const page: FlowNodeOccurrencePage;
declare const result: FlowNodeOccurrencePublicationResult;

// @ts-expect-error occurrence batches are deeply immutable
page.batches[0]!.transitions[0]!.lifecycle.started.push({});
// @ts-expect-error public occurrence identity is deeply immutable
page.currentOpen![0]!.id.startIndex = 2;

if (result.kind === "gap") {
  // @ts-expect-error non-available arms carry no partial page
  result.page;
}
