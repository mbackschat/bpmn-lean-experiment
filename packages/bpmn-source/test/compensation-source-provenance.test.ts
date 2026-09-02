import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  findModdleElement,
  importCompiledBpmnGraph,
  moddleElement,
  moddleElements,
} from "./compiled-moddle-graph.ts";

type ReadCompensationSourceProvenance = (
  process: Record<string, unknown>,
) => unknown;

const fixtureUrl = new URL(
  "./fixtures/compensation-source-provenance.bpmn",
  import.meta.url,
);
const baseline = await readFile(fixtureUrl, "utf8");

const expected = {
  processElementId: "Process_Compensation_Provenance",
  globalThrowElementId: "Trigger_Compensation",
  boundaryHandlers: [
    {
      activityElementId: "Activity_Beta",
      boundaryEventElementId: "Boundary_Beta",
      compensationActivityElementId: "Undo_Beta",
    },
    {
      activityElementId: "Activity_Zeta",
      boundaryEventElementId: "Boundary_Zeta",
      compensationActivityElementId: "Undo_Zeta",
    },
  ],
  eventSubProcessHandlers: [
    {
      parentElementId: "Activity_Alpha",
      handlerElementId: "Handler_Alpha",
    },
  ],
  dependencies: [
    {
      predecessorElementId: "Activity_Zeta",
      successorElementId: "Activity_Alpha",
    },
  ],
};

test("reads canonical Compensation structural provenance", async () => {
  const { process, read } = await parse(baseline);
  assert.deepEqual(read(process), expected);
});

test("does not derive boundary handler edges from Association direction", async () => {
  for (const direction of [undefined, "None", "One", "Both"]) {
    const { process, read } = await parse(baseline);
    const association = findModdleElement(
      moddleElements(process, "artifacts"),
      "id",
      "Association_Beta",
    );
    if (direction === undefined) {
      delete writable(association)["associationDirection"];
    } else {
      writable(association)["associationDirection"] = direction;
    }
    assert.deepEqual(read(process), expected);
  }
});

test("does not assign interruption meaning to a Compensation Start Event", async () => {
  for (const spelling of [undefined, "true", "false", "0"]) {
    const source = baseline.replace(
      '<bpmn:startEvent id="Compensation_Start_Alpha">',
      `<bpmn:startEvent id="Compensation_Start_Alpha"${
        spelling === undefined ? "" : ` isInterrupting="${spelling}"`
      }>`,
    );
    const { process, read } = await parse(source);
    assert.deepEqual(read(process), expected);
  }
});

test("accepts inline and referenced global definitions without exposing the representation", async () => {
  const referenced = baseline
    .replace(
      '  <bpmn:process id="Process_Compensation_Provenance" isExecutable="true">',
      '  <bpmn:compensateEventDefinition id="Compensate_Global" />\n  <bpmn:process id="Process_Compensation_Provenance" isExecutable="true">',
    )
    .replace(
      '      <bpmn:compensateEventDefinition id="Compensate_Global" />',
      "      <bpmn:eventDefinitionRef>Compensate_Global</bpmn:eventDefinitionRef>",
    );
  const { process, read } = await parse(referenced);
  assert.deepEqual(read(process), expected);
});

test("refuses asynchronous global Compensation spellings", async () => {
  for (const spelling of ["false", "0"]) {
    const source = baseline.replace(
      '<bpmn:compensateEventDefinition id="Compensate_Global" />',
      `<bpmn:compensateEventDefinition id="Compensate_Global" waitForCompletion="${spelling}" />`,
    );
    const { process, read } = await parse(source);
    assert.equal(read(process), undefined);
  }
});

test("refuses a targeted global Compensation throw", async () => {
  const source = baseline.replace(
    '<bpmn:compensateEventDefinition id="Compensate_Global" />',
    '<bpmn:compensateEventDefinition id="Compensate_Global" activityRef="Activity_Zeta" />',
  );
  const { process, read } = await parse(source);
  assert.equal(read(process), undefined);
});

test("follows attachment and Association targets by object identity", async () => {
  {
    const { process, read } = await parse(baseline);
    const boundary = flowElement(process, "Boundary_Zeta");
    writable(boundary)["attachedToRef"] = {
      $type: "bpmn:UserTask",
      id: "Activity_Zeta",
    };
    assert.equal(read(process), undefined);
  }

  {
    const { process, read } = await parse(baseline);
    const association = findModdleElement(
      moddleElements(process, "artifacts"),
      "id",
      "Association_Zeta",
    );
    writable(association)["targetRef"] = {
      $type: "bpmn:Task",
      id: "Undo_Zeta",
    };
    assert.equal(read(process), undefined);
  }
});

test("requires the associated handler to be marked for Compensation", async () => {
  const source = baseline.replace(' isForCompensation="true"', "");
  const { process, read } = await parse(source);
  assert.equal(read(process), undefined);
});

test("refuses a boundary handler participating in normal Sequence Flow", async () => {
  const { process, read } = await parse(baseline);
  const flow = flowElement(process, "Flow_Beta_Join");
  writable(flow)["targetRef"] = flowElement(process, "Undo_Beta");
  assert.equal(read(process), undefined);
});

test("derives direct dependency direction from references, not IDs or declaration order", async () => {
  const { process, read } = await parse(baseline);
  const elements = writable(process)["flowElements"];
  assert.ok(Array.isArray(elements));
  elements.reverse();

  const flow = flowElement(process, "Flow_Zeta_Alpha");
  writable(flow)["sourceRef"] = flowElement(process, "Activity_Alpha");
  writable(flow)["targetRef"] = flowElement(process, "Activity_Zeta");

  assert.deepEqual(read(process), {
    ...expected,
    dependencies: [{
      predecessorElementId: "Activity_Alpha",
      successorElementId: "Activity_Zeta",
    }],
  });
});

async function parse(source: string): Promise<{
  process: Record<string, unknown>;
  read: ReadCompensationSourceProvenance;
}> {
  const imported = await importCompiledBpmnGraph(source, 1_000);
  assert.deepEqual(imported.warnings, []);
  const definitions = moddleElement(imported.rootElement, "definitions");
  const process = findModdleElement(
    moddleElements(definitions, "rootElements"),
    "id",
    "Process_Compensation_Provenance",
  );
  return { process: writable(process), read: await loadReader() };
}

function flowElement(
  process: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return writable(findModdleElement(moddleElements(process, "flowElements"), "id", id));
}

function writable(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return value as Record<string, unknown>;
}

async function loadReader(): Promise<ReadCompensationSourceProvenance> {
  const specifier = new URL(
    "../dist/compensation-source-provenance.js",
    import.meta.url,
  ).href;
  const loaded: unknown = await import(specifier);
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    !("readCompensationSourceProvenance" in loaded) ||
    typeof loaded.readCompensationSourceProvenance !== "function"
  ) {
    throw new TypeError(
      "the compiled source module does not export readCompensationSourceProvenance",
    );
  }
  return loaded.readCompensationSourceProvenance as ReadCompensationSourceProvenance;
}
