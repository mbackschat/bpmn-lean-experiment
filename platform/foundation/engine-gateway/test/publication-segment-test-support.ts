import assert from "node:assert/strict";

const selectionQuery = "bpmn-workflow-publication-segment-selection";
const segmentQuery = "bpmn-workflow-publication-segment";
const descriptorFormat = "bpmn-lean.workflow-publication-segment.v1";
const directoryFormat = "bpmn-lean.workflow-publication-segment-directory.v1";

export function publicationSegmentResponse(
  name: string,
  request: unknown,
  snapshot: Readonly<Record<string, unknown>>,
  execution: unknown,
  flowNodeOccurrences: unknown,
): unknown {
  const exact = requireRecord(request);
  if (name === selectionQuery) {
    const descriptor = {
      format: descriptorFormat,
      runId: "private-run-1",
      runOrdinal: 1,
      fromRevision: 0,
      throughRevision: snapshot.headRevision,
      sha256: "a".repeat(64),
    };
    return {
      ...exact,
      kind: "available",
      directory: { format: directoryFormat, segments: [] },
      selected: descriptor,
      currentRun: descriptor,
      snapshot,
    };
  }
  assert.equal(name, segmentQuery);
  return {
    ...exact,
    kind: "available",
    execution,
    flowNodeOccurrences,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}
