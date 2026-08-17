import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("registers the Query before commit and publishes before command-result resolution", async () => {
  const [source, integration, registrations] = await Promise.all([
    readFile(
      new URL("../src/workflow-implementation.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/command-publication-integration.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/workflow-publication-segments.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const registration = source.indexOf("registerWorkflowPublicationQueries(");
  const semanticLoop = source.indexOf("while (true)");
  const evaluation = source.indexOf("advanceScenario(", semanticLoop);
  const append = source.indexOf("integrateCommandPublication(", evaluation);
  const record = source.indexOf("recordCommandPublicationOutcome(", append);
  const capacityPreflight = source.indexOf(
    "preflightWorkflowSemanticCandidate(",
    record,
  );
  const capacityRetention = source.indexOf(
    "workflowChain.capacity.retainObservedCapacity(",
    capacityPreflight,
  );
  const capacityRefusal = source.indexOf("continue;", capacityRetention);
  const publicationAssignment = source.indexOf(
    "commandPublication = completePublicationCandidate",
    capacityRefusal,
  );
  const result = source.indexOf("commandOutcome(", publicationAssignment);
  assert.ok(registration >= 0 && registration < semanticLoop);
  const executionRegistration = registrations.indexOf(
    "registerExecutionPublicationQueryHandler(",
  );
  const occurrenceRegistration = registrations.indexOf(
    "registerFlowNodeOccurrenceQueryHandler(",
    executionRegistration,
  );
  const privateSelectionRegistration = registrations.indexOf(
    "bpmnWorkflowPublicationSegmentSelectionQuery,",
    occurrenceRegistration,
  );
  const privateSegmentRegistration = registrations.indexOf(
    "bpmnWorkflowPublicationSegmentQuery,",
    privateSelectionRegistration,
  );
  assert.ok(
    executionRegistration >= 0 &&
      occurrenceRegistration > executionRegistration &&
      privateSelectionRegistration > occurrenceRegistration &&
      privateSegmentRegistration > privateSelectionRegistration,
  );
  assert.ok(
    evaluation >= 0 &&
      append > evaluation &&
      record > append &&
      capacityPreflight > record &&
      capacityRetention > capacityPreflight &&
      capacityRefusal > capacityRetention &&
      publicationAssignment > capacityRefusal &&
      result > publicationAssignment,
  );
  assert.doesNotMatch(source.slice(evaluation, append), /\bawait\b/u);
  assert.doesNotMatch(source.slice(append, publicationAssignment), /\bawait\b/u);

  const sample = integration.indexOf("const committedAtEpochMs = committedClock()");
  const e1 = integration.indexOf("accumulateExecutionPublication(", sample);
  const occurrences = integration.indexOf(
    "accumulateFlowNodeOccurrencePublication(",
    e1,
  );
  const candidateReturn = integration.indexOf("execution: executionCandidate", occurrences);
  assert.ok(sample >= 0 && e1 > sample && occurrences > e1 && candidateReturn > occurrences);
  assert.doesNotMatch(integration.slice(sample, candidateReturn), /\bawait\b/u);
});
