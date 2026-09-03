import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";

import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessagePublication,
} from "@bpmn-lean/platform-contracts";

const dependencies = [
  "react/jsx-runtime",
  "react",
  "@bpmn-lean/platform-contracts",
  "@bpmn-lean/platform-ui-kit",
] as const;
const built = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    minify: false,
    ssr: fileURLToPath(new URL(
      "../src/correlated-message-panel.tsx",
      import.meta.url,
    )),
    target: "esnext",
    write: false,
    rollupOptions: {
      external: (id) => dependencies.includes(
        id as typeof dependencies[number],
      ),
    },
  },
});
if (Array.isArray(built) || !("output" in built)) {
  throw new Error("Unexpected correlated Message panel build result.");
}
const chunk = built.output.find((entry) => entry.type === "chunk" && entry.isEntry);
if (chunk === undefined || chunk.type !== "chunk") {
  throw new Error("Correlated Message panel test bundle is missing.");
}
let runnable = chunk.code;
for (const dependency of dependencies) {
  runnable = runnable.replaceAll(
    `'${dependency}'`,
    JSON.stringify(import.meta.resolve(dependency)),
  );
  runnable = runnable.replaceAll(
    `"${dependency}"`,
    JSON.stringify(import.meta.resolve(dependency)),
  );
}
const panelModule = await import(
  `data:text/javascript;base64,${Buffer.from(runnable).toString("base64")}`
) as Readonly<{
  CorrelatedMessagePublicationResult: ComponentType<Readonly<{
    publication: DefinitionCorrelatedMessagePublication;
  }>>;
}>;
const { CorrelatedMessagePublicationResult } = panelModule;

const base = {
  definition: {
    processId: "CorrelatedSettlement",
    version: 2,
    source: {
      kind: "bpmnSource",
      id: "correlated-settlement.bpmn",
      sha256: "a".repeat(64),
      byteLength: 4096,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "bpmn-2.0.2-bpmn-lean-message-key-correlation-v1",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
  correlatedMessage: {
    catchEventId: "Catch_Settlement",
    channel: {
      kind: "operationMessage",
      interfaceId: "SettlementInterface",
      interfaceOperationId: "receiveSettlement",
      messageId: "SettlementReceived",
    },
    correlationKeyId: "SettlementCorrelationKey",
  },
} as const;

test("renders unique, zero, and ambiguous outcomes as distinct user-visible states", () => {
  const cases = [
    {
      publication: semantic({
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
        target: { processInstanceId: "semantic-instance-42" },
      }),
      expected: /Delivered to one matching Process/u,
    },
    {
      publication: semantic({
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch,
      }),
      expected: /No matching subscription/u,
    },
    {
      publication: semantic({
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous,
      }),
      expected: /Multiple matching subscriptions/u,
    },
  ];

  for (const { publication, expected } of cases) {
    const html = renderToStaticMarkup(createElement(
      CorrelatedMessagePublicationResult,
      { publication },
    ));
    assert.match(html, expected);
    assert.match(html, /command\/42/u);
    assert.doesNotMatch(html, /subscriptionId|workflowId|runId/u);
  }
});

test("renders capacity and infrastructure uncertainty without claiming semantic rejection", () => {
  const capacity = {
    ...base,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.Capacity,
      commandId: "command/42",
      ingressOrdinal: null,
      failure: {
        kind: "publicationQueue",
        measure: "count",
        configuredBound: 32,
        observedValue: 33,
      },
    },
  } as const satisfies DefinitionCorrelatedMessagePublication;
  const uncertain = {
    ...base,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
      commandId: "command/42",
      ingressOrdinal: 7,
      phase: "resultRecovery",
      target: null,
      failure: { kind: "unconfirmed" },
    },
  } as const satisfies DefinitionCorrelatedMessagePublication;

  const capacityHtml = renderToStaticMarkup(createElement(
    CorrelatedMessagePublicationResult,
    { publication: capacity },
  ));
  const uncertainHtml = renderToStaticMarkup(createElement(
    CorrelatedMessagePublicationResult,
    { publication: uncertain },
  ));
  assert.match(capacityHtml, /Publication not accepted/u);
  assert.match(uncertainHtml, /Delivery indeterminate/u);
  assert.match(uncertainHtml, /Retry the same command/u);
  assert.doesNotMatch(`${capacityHtml}${uncertainHtml}`, /No matching subscription/u);
});

test("places correlated Message publication in the exact-definition Triggers workspace", async () => {
  const source = await readFile(
    new URL("../src/definition-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /label: "Triggers"[\s\S]*<CorrelatedMessagePanel/u);
  assert.match(source, /api=\{correlatedMessageApi\}/u);
});

function semantic(
  outcome: Extract<
    DefinitionCorrelatedMessagePublication["resolution"],
    { kind: "semantic" }
  >["outcome"],
): DefinitionCorrelatedMessagePublication {
  return {
    ...base,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
      commandId: "command/42",
      ingressOrdinal: 7,
      outcome,
    },
  };
}
