/** Production publication accumulation used by the private SMI capacity fixture. */
import {
  ScenarioStepKind,
} from "@bpmn-lean/semantic-core";
import type {
  ScenarioStep,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrencePublicationResultKind,
  requireExecutionPublicationPage,
  requireFlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExecutionPublicationPage,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/temporal-protocol";
import {
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "@bpmn-lean/temporal-workflow";
import type {
  CommandPublicationState,
} from "@bpmn-lean/temporal-workflow";

export type CapacityPublicationState = CommandPublicationState;

export type CapacityCommandFacts = Extract<
  ScenarioStep,
  { kind: ScenarioStepKind.Committed | ScenarioStepKind.Terminal }
>;

export function emptyCapacityPublication(
  program: SemanticProcessProgram,
  processInstanceId: string,
): CapacityPublicationState {
  return createCommandPublicationState(program, processInstanceId);
}

export function appendCapacityPublication(
  program: SemanticProcessProgram,
  publication: CapacityPublicationState,
  stimulus: Stimulus,
  facts: CapacityCommandFacts,
  committedAtEpochMs: number,
): CapacityPublicationState {
  const integrated = integrateCommandPublication(
    program,
    publication,
    stimulus,
    facts,
    () => committedAtEpochMs,
  );
  return recordCommandPublicationOutcome(
    integrated,
    stimulus,
    facts.observations,
  );
}

export function publicationPages(
  program: SemanticProcessProgram,
  processInstanceId: string,
  publication: CapacityPublicationState,
): Readonly<{
  execution: ExecutionPublicationPage;
  occurrences: FlowNodeOccurrencePage;
}> {
  const execution: ExecutionPublicationPage = {
    definition: publication.execution.definition,
    processId: publication.execution.processId,
    processInstanceId: publication.execution.processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: publication.execution.headRevision,
    headRevision: publication.execution.headRevision,
    batches: publication.execution.batches,
    current: publication.execution.current,
  };
  requireExecutionPublicationPage(execution, {
    program,
    processInstanceId,
    afterRevision: 0,
  });
  const occurrences: FlowNodeOccurrencePage = {
    definition: publication.flowNodeOccurrences.definition,
    processId: publication.flowNodeOccurrences.processId,
    processInstanceId: publication.flowNodeOccurrences.processInstanceId,
    requestedAfterRevision: 0,
    pageThroughRevision: publication.flowNodeOccurrences.headRevision,
    headRevision: publication.flowNodeOccurrences.headRevision,
    batches: publication.flowNodeOccurrences.batches,
    currentOpen: publication.flowNodeOccurrences.currentOpen,
  };
  requireFlowNodeOccurrencePublicationResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page: occurrences,
  }, {
    program,
    processInstanceId,
    executionPublication: execution,
    afterRevision: 0,
  });
  return { execution, occurrences };
}
