import assert from "node:assert/strict";
import test from "node:test";

import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import { QueryNotRegisteredError } from "@temporalio/client";
import { bpmnWorkflowPublicationSegmentSelectionQueryName } from "@bpmn-lean/temporal-protocol";

import { observeTemporalExecutionPublication } from "../dist/execution-publication-client.js";
import { observeTemporalFlowNodeOccurrences } from "../dist/flow-node-occurrence-publication-client.js";

const expected = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "publication-deadline",
    sourceId: "publication-deadline",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_1",
  processInstanceId: "Instance_1",
} as const;

for (const [name, observe] of [
  ["execution", observeTemporalExecutionPublication],
  ["occurrence", observeTemporalFlowNodeOccurrences],
] as const) {
  for (const legacy of [false, true]) {
    test(`${name} ${legacy ? "legacy" : "segment"} timeout settles its RPC before returning unavailable`, async (context) => {
      context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
      let rpcDeadline: number | undefined;
      let pending = false;
      let settle: (() => void) | undefined;
      let started: (() => void) | undefined;
      const rpcStarted = new Promise<void>((resolve) => { started = resolve; });
      const deadlines: number[] = [];
      const client = {
        connection: {
          withDeadline: async <Value>(deadline: number, invoke: () => Promise<Value>) => {
            deadlines.push(deadline);
            rpcDeadline = deadline;
            try {
              return await invoke();
            } finally {
              rpcDeadline = undefined;
            }
          },
        },
        getHandle: () => ({
          query: async (queryName: string) => {
            if (legacy && queryName === bpmnWorkflowPublicationSegmentSelectionQueryName) {
              throw new QueryNotRegisteredError("legacy Workflow", 0 as never);
            }
            pending = true;
            return new Promise<never>((_resolve, reject) => {
              settle = () => {
                pending = false;
                reject(new Error("RPC deadline exceeded"));
              };
              if (rpcDeadline !== undefined) {
                setTimeout(settle, rpcDeadline - Date.now());
              }
              started?.();
            });
          },
        }),
      } as never;
      const observation = observe(client, "workflow-id", expected, { afterRevision: 0 });
      await rpcStarted;
      context.mock.timers.tick(5_000);
      try {
        assert.deepEqual(await observation, { kind: "unavailable" });
        assert.equal(pending, false, "returning unavailable must leave no running Query");
        assert.deepEqual(deadlines, legacy ? [6_000, 6_000] : [6_000]);
      } finally {
        settle?.();
        await observation;
      }
    });
  }
}
