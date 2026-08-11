/** Guards singleton containment cardinality that `bpmn-moddle` otherwise overwrites silently. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

async function compile(
  source: string,
  semanticProfile: string,
) {
  return await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(source),
    sourceId: "singleton-containment-test",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

const timerCases = [
  [
    "Timer Start",
    new URL("./fixtures/timer-start-event.bpmn", import.meta.url),
    SemanticProfileId.TimerStart,
  ],
  [
    "Intermediate Catch Timer",
    new URL("../../../scenarios/intermediate-catch-timer/process.bpmn", import.meta.url),
    SemanticProfileId.IntermediateCatchTimer,
  ],
  [
    "Activity Boundary Timer",
    new URL("../../../scenarios/activity-boundary-timer/process.bpmn", import.meta.url),
    SemanticProfileId.ActivityBoundaryTimer,
  ],
  [
    "Sub-Process Boundary Timer",
    new URL("../../../scenarios/subprocess-boundary-timer/process.bpmn", import.meta.url),
    SemanticProfileId.SubProcessBoundaryTimer,
  ],
] as const;

for (const [name, sourceUrl, semanticProfile] of timerCases) {
  test(`rejects repeated timeDuration before ${name} projection can lose it`, async () => {
    const source = await readFile(sourceUrl, "utf8");
    const repeated = source.replace(
      ">PT1S</bpmn:timeDuration>",
      '>PT1S</bpmn:timeDuration>\n        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT1S</bpmn:timeDuration>',
    );
    assert.notEqual(repeated, source);

    const result = await compile(repeated, semanticProfile);

    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  });
}

test("rejects repeated conditionExpression before branch projection can lose it", async () => {
  const source = await readFile(
    new URL(
      "../../../scenarios/exclusive-gateway-simple-boolean/process.bpmn",
      import.meta.url,
    ),
    "utf8",
  );
  const expression = '<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true</bpmn:conditionExpression>';
  const repeated = source.replace(expression, `${expression}\n      ${expression}`);
  assert.notEqual(repeated, source);

  const result = await compile(
    repeated,
    SemanticProfileId.ExclusiveGatewaySimpleBoolean,
  );

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("ignores element-like text inside XML comments", async () => {
  const source = await readFile(timerCases[0][1], "utf8");
  const commented = source.replace(
    "  <bpmn:process",
    "  <!-- <bpmn:timeDuration>not an element</bpmn:timeDuration> -->\n  <bpmn:process",
  );
  assert.notEqual(commented, source);

  const result = await compile(commented, SemanticProfileId.TimerStart);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
});
