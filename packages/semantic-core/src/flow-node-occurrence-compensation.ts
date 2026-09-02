import { EffectExecutionResultKind, type CompleteEffectStimulus, type OccurrenceId } from "./contract.js";
import { compensationExecutionStateDefects } from "./compensation-trigger-handler-runtime-state-validation.js";
import type { TriggerCompensationOperation } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { sameOccurrence, type RuntimeState, type ScopeOccurrenceId } from "./semantic-process-state.js";
import type {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchor,
  SemanticFlowNodeOccurrenceAnchorKind,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";

// This leaf is imported by flow-node-occurrence-lifecycle.ts; type-only imports avoid an ESM initialization cycle.
const WaitAnchorKind = "wait" as SemanticFlowNodeOccurrenceAnchorKind.Wait;
const TriggerAnchorKind = "compensationTrigger" as SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger;
const HandlerAnchorKind = "compensationHandler" as SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler;
const CompletedTerminalKind = "completed" as FlowNodeOccurrenceTerminalKind.Completed;
const CancelledTerminalKind = "cancelled" as FlowNodeOccurrenceTerminalKind.Cancelled;

type TerminalSpec = Readonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

export type CompensationLifecyclePieces = Readonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: TerminalSpec[];
  instantaneous: Array<{
    processId: string;
    elementId: string;
    owner: ScopeOccurrenceId;
  }>;
}>;

/** Projects the exact open trigger, handler, and distinct handler-body occurrences. */
export function projectOpenCompensationOccurrences(
  program: SemanticProcessProgram,
  state: RuntimeState,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  if (compensationExecutionStateDefects(program, state).length > 0) return null;
  if (state.control.kind !== "running") return [];
  const declaration = program.compensationExecution;
  if (declaration === undefined) return [];
  const operation = program.operations.find(({ id }) => id === declaration.triggerOperationId);
  if (operation?.kind !== "triggerCompensation") return null;
  const starts: UnnumberedFlowNodeOccurrenceStart[] = [];
  for (const trigger of state.compensationTriggers ?? []) {
    if (trigger.lifecycle !== "active") continue;
    starts.push(triggerStart(program, operation, trigger.id, trigger.owner));
    for (const handler of trigger.handlers) {
      if (handler.lifecycle !== "compensating") continue;
      starts.push(handlerStart(program, handler.id, handler.handlerElementId, trigger.owner));
      if (handler.effectId.elementId !== handler.handlerElementId) {
        starts.push(waitStart(program, handler.effectId, trigger.owner));
      }
    }
  }
  return starts;
}

/** Projects trigger/frontier creation without routing compensation waits through ordinary awaitEffect. */
export function projectCompensationTriggerLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  operation: TriggerCompensationOperation,
  owner: ScopeOccurrenceId,
): CompensationLifecyclePieces | null {
  const created = (after.compensationTriggers ?? []).filter((trigger) =>
    trigger.id.elementId === operation.id &&
    sameOwner(trigger.owner, owner) &&
    !(before.compensationTriggers ?? []).some(({ id }) => sameOccurrence(id, trigger.id))
  );
  const trigger = created[0];
  if (created.length === 0) {
    return {
      started: [],
      ended: [],
      instantaneous: [{ processId: program.processId, elementId: operation.origin.elementId, owner }],
    };
  }
  if (created.length !== 1 || trigger?.lifecycle !== "active") return null;
  return {
    started: [
      triggerStart(program, operation, trigger.id, owner),
      ...trigger.handlers.flatMap((handler) => {
        if (handler.lifecycle !== "compensating") return [];
        return [
          handlerStart(program, handler.id, handler.handlerElementId, owner),
          ...(handler.effectId.elementId === handler.handlerElementId
            ? []
            : [waitStart(program, handler.effectId, owner)]),
        ];
      }),
    ],
    ended: [],
    instantaneous: [],
  };
}

/** Projects one compensation completion, including newly unlocked handlers or fail-fast cancellation. */
export function projectCompensationCompletionLifecycle(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  stimulus: CompleteEffectStimulus,
): CompensationLifecyclePieces | null {
  const waits = (before.compensationHandlerEffectWaits ?? []).filter(({ id }) =>
    sameOccurrence(id, stimulus.effectId)
  );
  const wait = waits[0];
  if (waits.length !== 1 || wait === undefined) return null;
  const trigger = (before.compensationTriggers ?? []).find(({ id }) =>
    sameOccurrence(id, wait.triggerId)
  );
  const handler = trigger?.handlers.find(({ id }) => sameOccurrence(id, wait.handlerId));
  if (trigger?.lifecycle !== "active" || handler?.lifecycle !== "compensating") return null;
  const afterTrigger = (after.compensationTriggers ?? []).find(({ id }) =>
    sameOccurrence(id, trigger.id)
  );
  if (afterTrigger === undefined) return null;
  const success = stimulus.result.kind === EffectExecutionResultKind.Success;
  const terminal = success ? CompletedTerminalKind : CancelledTerminalKind;
  const ended = success
    ? handlerTerminals(handler, terminal)
    : [
        triggerTerminal(trigger.id, CancelledTerminalKind),
        ...trigger.handlers.flatMap((candidate) =>
          candidate.lifecycle === "compensating"
            ? handlerTerminals(candidate, CancelledTerminalKind)
            : []
        ),
      ];
  if (success && afterTrigger.lifecycle === "succeeded") {
    ended.push(triggerTerminal(trigger.id, CompletedTerminalKind));
  }
  const started = success && afterTrigger.lifecycle === "active"
    ? afterTrigger.handlers.flatMap((candidate) => {
        const previous = trigger.handlers.find(({ id }) => sameOccurrence(id, candidate.id));
        return previous?.lifecycle === "pending" && candidate.lifecycle === "compensating"
          ? [
              handlerStart(program, candidate.id, candidate.handlerElementId, trigger.owner),
              ...(candidate.effectId.elementId === candidate.handlerElementId
                ? []
                : [waitStart(program, candidate.effectId, trigger.owner)]),
            ]
          : [];
      })
    : [];
  return { started, ended, instantaneous: [] };
}

function triggerStart(
  program: SemanticProcessProgram,
  operation: TriggerCompensationOperation,
  id: OccurrenceId,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart {
  return {
    anchor: { kind: TriggerAnchorKind, id },
    processId: program.processId,
    elementId: operation.origin.elementId,
    owner,
  };
}

function handlerStart(
  program: SemanticProcessProgram,
  id: OccurrenceId,
  elementId: string,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart {
  return {
    anchor: { kind: HandlerAnchorKind, id },
    processId: program.processId,
    elementId,
    owner,
  };
}

function waitStart(
  program: SemanticProcessProgram,
  id: OccurrenceId,
  owner: ScopeOccurrenceId,
): UnnumberedFlowNodeOccurrenceStart {
  return {
    anchor: { kind: WaitAnchorKind, id },
    processId: program.processId,
    elementId: id.elementId,
    owner,
  };
}

function handlerTerminals(
  handler: Extract<
    NonNullable<RuntimeState["compensationTriggers"]>[number]["handlers"][number],
    { readonly lifecycle: "compensating" }
  >,
  terminal: FlowNodeOccurrenceTerminalKind,
): TerminalSpec[] {
  return [
    { anchor: { kind: HandlerAnchorKind, id: handler.id }, terminal },
    ...(handler.effectId.elementId === handler.handlerElementId
      ? []
      : [{ anchor: { kind: WaitAnchorKind, id: handler.effectId } as const, terminal }]),
  ];
}

function triggerTerminal(
  id: OccurrenceId,
  terminal: FlowNodeOccurrenceTerminalKind,
): TerminalSpec {
  return { anchor: { kind: TriggerAnchorKind, id }, terminal };
}

function sameOwner(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}
