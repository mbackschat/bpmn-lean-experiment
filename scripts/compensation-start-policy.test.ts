import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { compensationStarts } from "./compensation-start-policy.ts";
import { workingTreeFiles } from "./test-selection-coverage.ts";

const model = (startAttributes: string, subProcessAttributes = 'triggeredByEvent="true"'): string => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:subProcess id="Esp_1" ${subProcessAttributes}>
      <bpmn:startEvent id="Start_1" ${startAttributes}>
        <bpmn:compensateEventDefinition id="Definition_1" />
      </bpmn:startEvent>
    </bpmn:subProcess>
  </bpmn:process>
</bpmn:definitions>`;

test("a Compensation start that declares isInterrupting is reported, whatever its value", () => {
  for (const value of ["false", "true"]) {
    assert.deepEqual(compensationStarts(model(`isInterrupting="${value}"`)), [{ id: "Start_1", declaresInterruption: true }]);
  }
});

test("a Compensation start without isInterrupting is accepted", () => {
  assert.deepEqual(compensationStarts(model("")), [{ id: "Start_1", declaresInterruption: false }]);
});

test("a start Event that is not a Compensation start of an Event Sub-Process is not examined", () => {
  const errorStart = model('isInterrupting="false"').replace("compensateEventDefinition", "errorEventDefinition");
  assert.deepEqual(compensationStarts(errorStart), []);
  assert.deepEqual(compensationStarts(model('isInterrupting="false"', "")), []);
});

test("no repository model gives a Compensation Event Sub-Process start an isInterrupting attribute", () => {
  const starts = workingTreeFiles()
    .filter((file) => file.endsWith(".bpmn"))
    .flatMap((file) => compensationStarts(readFileSync(file, "utf8")).map((start) => ({ file, ...start })));
  assert.ok(starts.length > 0, "the scan must find the repository's Compensation Event Sub-Process starts");
  assert.deepEqual(
    starts.filter(({ declaresInterruption }) => declaresInterruption).map(({ file, id }) => `${file}: startEvent ${id}`),
    [],
    "isInterrupting does not apply to a Compensation start (BPMN 2.0.2 Table 10.87) and CIB Seven 2.2.0 fails such a model (CIB-LIM-0045)",
  );
});
