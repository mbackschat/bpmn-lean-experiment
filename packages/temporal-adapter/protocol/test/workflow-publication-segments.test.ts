import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowChainBudgetKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentDescriptorV1,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  bpmnWorkflowPublicationSegmentsV1,
  requireWorkflowPublicationSegmentDirectoryV1,
  requireWorkflowPublicationSegmentSelectionRequestV1,
  requireWorkflowPublicationSegmentSelectionResultV1,
  selectWorkflowPublicationSegment,
  workflowChainProductionLimit,
  workflowChainCanonicalUtf8ByteLength,
  workflowPublicationSegmentDirectorySha256,
  workflowPublicationSegmentSha256,
} from "../dist/index.js";
import type {
  WorkflowPublicationSegmentDescriptorV1,
  WorkflowPublicationSegmentDirectoryV1,
} from "../dist/index.js";
import { publicationPage } from "./semantic-publication-fixture.ts";

test("binds paired batches and validates a contiguous directory with empty Runs", () => {
  const pairedSha = workflowPublicationSegmentSha256([], []);
  assert.match(pairedSha, /^[0-9a-f]{64}$/u);
  assert.equal(pairedSha, workflowPublicationSegmentSha256([], []));
  const directory = directoryOf([
    descriptor("run-1", 1, 0, 2, "1"),
    descriptor("run-2", 2, 2, 2, "2"),
    descriptor("run-3", 3, 2, 5, "3"),
  ]);

  assert.equal(
    requireWorkflowPublicationSegmentDirectoryV1(directory, {
      firstExecutionRunId: "run-1",
      successorRunOrdinal: 4,
      headRevision: 5,
    }),
    directory,
  );
  assert.match(workflowPublicationSegmentDirectorySha256(directory), /^[0-9a-f]{64}$/u);
  assert.equal(
    selectWorkflowPublicationSegment(
      directoryOf(directory.segments.slice(0, 2)),
      directory.segments[2]!,
      2,
      5,
    )?.runId,
    "run-3",
  );
});

test("rejects noncontiguous, duplicate, over-count, and over-byte directories", () => {
  const valid = directoryOf([descriptor("run-1", 1, 0, 1, "1")]);
  for (const malformed of [
    directoryOf([{ ...valid.segments[0]!, fromRevision: 1 }]),
    directoryOf([
      valid.segments[0]!,
      descriptor("run-1", 2, 1, 2, "2"),
    ]),
    directoryOf([
      valid.segments[0]!,
      descriptor("run-2", 3, 1, 2, "2"),
    ]),
  ]) {
    assert.throws(
      () => requireWorkflowPublicationSegmentDirectoryV1(malformed),
      /segment directory/u,
    );
  }

  const overCount = directoryOf(Array.from(
    { length: workflowChainProductionLimit(
      WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryEntries,
    ) + 1 },
    (_, index) => descriptor(`run-${index + 1}`, index + 1, index, index + 1, "a"),
  ));
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(overCount),
    /segment directory/u,
  );
  const atCount = directoryOf(overCount.segments.slice(0, -1));
  assert.equal(requireWorkflowPublicationSegmentDirectoryV1(atCount), atCount);

  const byteLimit = workflowChainProductionLimit(
    WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
  );
  const minimal = directoryOf([descriptor("x", 1, 0, 1, "a")]);
  const exactBytes = directoryOf([
    descriptor(
      "x".repeat(byteLimit - workflowChainCanonicalUtf8ByteLength(minimal) + 1),
      1,
      0,
      1,
      "a",
    ),
  ]);
  assert.equal(workflowChainCanonicalUtf8ByteLength(exactBytes), byteLimit);
  assert.equal(requireWorkflowPublicationSegmentDirectoryV1(exactBytes), exactBytes);
  const overBytes = directoryOf([
    descriptor(`${exactBytes.segments[0]!.runId}x`, 1, 0, 1, "a"),
  ]);
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(overBytes),
    /publicationContinuationAndSegmentDirectoryBytes/u,
  );
});

test("rejects a directory head mismatch and selects the first Run from an empty directory", () => {
  const first = descriptor("run-1", 1, 0, 3, "1");
  const empty = directoryOf([]);
  assert.equal(
    selectWorkflowPublicationSegment(empty, first, 0, 3),
    first,
  );
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(directoryOf([first]), {
      firstExecutionRunId: "run-1",
      successorRunOrdinal: 2,
      headRevision: 4,
    }),
    /identity mismatch/u,
  );
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(directoryOf([first]), {
      firstExecutionRunId: "substituted-first-run",
      successorRunOrdinal: 2,
      headRevision: 3,
    }),
    /identity mismatch/u,
  );
});

test("rejects surplus, cyclic, and accessor-bearing directory data without invoking getters", () => {
  const segment = descriptor("run-1", 1, 0, 1, "1");
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1({
      ...directoryOf([segment]),
      surplus: true,
    }),
    /segment directory/u,
  );
  const cyclic: Record<string, unknown> = {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
  };
  cyclic.segments = [cyclic];
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(cyclic),
    /acyclic plain-data tree/u,
  );
  let executed = false;
  const accessor: Record<string, unknown> = {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
  };
  Object.defineProperty(accessor, "segments", {
    enumerable: true,
    get: () => {
      executed = true;
      return [segment];
    },
  });
  assert.throws(
    () => requireWorkflowPublicationSegmentDirectoryV1(accessor),
    /executable property/u,
  );
  assert.equal(executed, false);
});

test("selection validators bind the exact request and skip an empty boundary segment", () => {
  const page = publicationPage();
  const request = requireWorkflowPublicationSegmentSelectionRequestV1({
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId: page.processInstanceId,
    afterRevision: 2,
    limit: 4,
  });
  const closed = descriptor("run-1", 1, 0, 2, "1");
  const empty = descriptor("run-2", 2, 2, 2, "2");
  const current = descriptor("run-3", 3, 2, 5, "3");
  const directory = directoryOf([closed, empty]);
  const result = {
    ...request,
    kind: WorkflowPublicationSegmentSelectionResultKind.Available,
    directory,
    selected: current,
    currentRun: current,
    snapshot: {
      definition: page.definition,
      processId: page.processId,
      processInstanceId: page.processInstanceId,
      headRevision: 5,
      current: { ...page.current, revision: 5 },
      currentOpen: [],
    },
  };
  assert.equal(
    requireWorkflowPublicationSegmentSelectionResultV1(result, request),
    result,
  );
  assert.throws(
    () => requireWorkflowPublicationSegmentSelectionResultV1(
      { ...result, processInstanceId: "substituted" },
      request,
    ),
    /identity mismatch/u,
  );
});

test("rejects a private Query response beyond the 192 KiB response budget", () => {
  const request = requireWorkflowPublicationSegmentSelectionRequestV1({
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId: "x".repeat(193 * 1_024),
    afterRevision: 0,
  });
  assert.throws(
    () => requireWorkflowPublicationSegmentSelectionResultV1({
      ...request,
      kind: WorkflowPublicationSegmentSelectionResultKind.NotReady,
    }, request),
    /queryResponseBytes/u,
  );
});

function descriptor(
  runId: string,
  runOrdinal: number,
  fromRevision: number,
  throughRevision: number,
  digestSeed: string,
): WorkflowPublicationSegmentDescriptorV1 {
  return {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId,
    runOrdinal,
    fromRevision,
    throughRevision,
    sha256: digestSeed.repeat(64).slice(0, 64),
  };
}

function directoryOf(
  segments: ReadonlyArray<WorkflowPublicationSegmentDescriptorV1>,
): WorkflowPublicationSegmentDirectoryV1 {
  return {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
    segments: [...segments],
  };
}
