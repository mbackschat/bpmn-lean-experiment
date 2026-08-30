/**
 * Admission of an external stimulus against committed runtime state.
 *
 * This owner decides one question: does the submitted command commit, and to
 * which successor state. It never runs the internal closure that follows a
 * committed command; `applyStimulus` in the runtime composes the two. Keeping
 * them apart is what lets a rejection be observed as a state-preserving
 * outcome rather than as a closure that produced no step.
 */
import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type { Stimulus } from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  interruptBoundedScope,
  isBoundedScopeDeadlineDefinition,
} from "./semantic-process-bounded-scope-runtime.js";
import {
  completeBoundedUserTask,
  interruptBoundedUserTask,
  isBoundaryTimerDefinition,
  isBoundedTaskDefinition,
} from "./semantic-process-bounded-task-runtime.js";
import {
  completeDataInputUserTask,
  isDataInputTaskDefinition,
} from "./semantic-process-activity-data-input-runtime.js";
import {
  completeDataOutputUserTask,
  isDataOutputTaskDefinition,
} from "./semantic-process-activity-data-output-runtime.js";
import {
  completeActivityVariableScope,
} from "./semantic-process-data.js";
import {
  isEventRaceMessageDefinition,
  isEventRaceTimerDefinition,
  winEventRaceWithMessage,
  winEventRaceWithTimer,
} from "./semantic-process-event-race-runtime.js";
import {
  reportEffectFailure,
  retryEffectIncident,
} from "./semantic-process-incident-runtime.js";
import {
  cancelIncidentProcess,
} from "./semantic-process-incident-cancellation.js";
import {
  incidentStateAllowsDispatch,
} from "./semantic-process-incident-validation.js";
import {
  deliverMessage,
  deliverPayloadMessage,
} from "./semantic-process-message.js";
import {
  admitMessageStart,
} from "./semantic-process-message-start.js";
import {
  admitProcessStart,
} from "./semantic-process-triggered-start.js";
import { admitTimerStart } from "./semantic-process-timer-start.js";
import {
  completeMonitoredUserTask,
  isMonitoredBoundaryTimerDefinition,
  isMonitoredTaskDefinition,
  spawnFromMonitoredUserTask,
} from "./semantic-process-monitored-task-runtime.js";
import {
  completeParallelMultiInstanceChild,
  interruptParallelMultiInstance,
  isParallelMultiInstanceBoundaryDefinition,
  isParallelMultiInstanceTaskDefinition,
} from "./semantic-process-parallel-multi-instance-runtime.js";
import {
  completeSequentialMultiInstanceIteration,
  interruptSequentialMultiInstance,
  isSequentialMultiInstanceBoundaryDefinition,
  isSequentialMultiInstanceTaskDefinition,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import {
  completeOrdinaryUserTask,
} from "./semantic-process-user-task-runtime.js";
import {
  profileAllowsStimulusValueDomain,
} from "./semantic-profile-value-domain.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import {
  parallelMultiInstanceStimulusDataAdmitted,
} from "./parallel-multi-instance-command-data-admission.js";
import {
  sequentialMultiInstanceStimulusDataAdmitted,
} from "./sequential-multi-instance-command-data-admission.js";
import {
  addToken,
  ControlStateKind,
  sameOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { isGateAdmissibleRuntimeState } from "./runtime-state-well-formedness.js";

export type SemanticCommandOutcome =
  | CommandOutcome.Committed
  | CommandOutcome.Rejected;

export type CommandAdmission = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
}>;

/**
 * Whether this committed state is one the account represents at all.
 *
 * The expectation available at this boundary is the program, not an instance identity: a caller
 * supplies both, and there is no third party whose instance the state should match. Passing the
 * state's own running identity therefore makes the instance conjunct inert here, which weakens
 * nothing that was previously checked but must not be read as an instance check: nothing at this
 * site refuses a state belonging to another instance of the same program.
 *
 * Ordering matters more than the check: enforcement follows preservation, so a state this refuses
 * should be unreachable. The core's own preservation evidence is owed rather than held, which the
 * validator's owner records, so a newly refused state is a defect here until shown unreachable.
 * Installing the gate the other way round would turn accepted transitions into refusals and change
 * admitted models.
 */
function admissibleCommittedState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): boolean {
  const gateState =
    program.identity.semanticProfile ===
        SemanticProfileId.SequentialMultiInstanceUserTask &&
      state.control.kind === ControlStateKind.NotStarted &&
      state.sequentialMultiInstanceControllers === undefined
      ? { ...state, sequentialMultiInstanceControllers: [] }
      : program.identity.semanticProfile ===
          SemanticProfileId.ParallelMultiInstanceUserTask &&
          state.control.kind === ControlStateKind.NotStarted &&
          state.parallelMultiInstanceControllers === undefined
      ? { ...state, parallelMultiInstanceControllers: [] }
      : state;
  return gateState.control.kind === ControlStateKind.NotStarted
    ? isGateAdmissibleRuntimeState(program, "", gateState)
    : isGateAdmissibleRuntimeState(
      program,
      gateState.control.instanceId,
      gateState,
    );
}

export function admit(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
): CommandAdmission {
  if (
    !incidentStateAllowsDispatch(program, state) ||
    !admissibleCommittedState(program, state) ||
    !sequentialMultiInstanceStimulusDataAdmitted(program, stimulus) ||
    !parallelMultiInstanceStimulusDataAdmitted(program, stimulus) ||
    !profileAllowsStimulusValueDomain(
      program.identity.semanticProfile,
      stimulus,
    )
  ) {
    return { outcome: CommandOutcome.Rejected, state };
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const next = admitProcessStart(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.TriggerMessageStart: {
      const next = admitMessageStart(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.TriggerTimerStart: {
      const next = admitTimerStart(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.CompleteUserTaskInstance: {
      if (isBoundedTaskDefinition(program, stimulus.taskId)) {
        const next = completeBoundedUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isMonitoredTaskDefinition(program, stimulus.taskId)) {
        const next = completeMonitoredUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isSequentialMultiInstanceTaskDefinition(program, stimulus.taskId)) {
        const next = completeSequentialMultiInstanceIteration(
          program,
          state,
          stimulus,
        );
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isDataInputTaskDefinition(program, stimulus.taskId)) {
        const next = completeDataInputUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isDataOutputTaskDefinition(program, stimulus.taskId)) {
        const next = completeDataOutputUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isParallelMultiInstanceTaskDefinition(program, stimulus.taskId)) {
        const next = completeParallelMultiInstanceChild(
          program,
          state,
          stimulus,
        );
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      const next = completeOrdinaryUserTask(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.DeliverMessage: {
      const next = isEventRaceMessageDefinition(program, stimulus.subscriptionId)
        ? winEventRaceWithMessage(program, state, stimulus)
        : deliverMessage(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.DeliverPayloadMessage: {
      const next = deliverPayloadMessage(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.FireTimer: {
      if (isEventRaceTimerDefinition(program, stimulus.timerId)) {
        const next = winEventRaceWithTimer(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isBoundaryTimerDefinition(program, stimulus.timerId)) {
        const next = interruptBoundedUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isMonitoredBoundaryTimerDefinition(program, stimulus.timerId)) {
        const next = spawnFromMonitoredUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isSequentialMultiInstanceBoundaryDefinition(program, stimulus.timerId)) {
        const next = interruptSequentialMultiInstance(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isParallelMultiInstanceBoundaryDefinition(program, stimulus.timerId)) {
        const next = interruptParallelMultiInstance(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isBoundedScopeDeadlineDefinition(program, stimulus.timerId)) {
        const next = interruptBoundedScope(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      const wait = state.timerWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.timerId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined ||
        stimulus.logicalTimeMs !== wait.deadlineMs
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            wait.output,
            wait.owner,
          ),
          timerWaits: state.timerWaits.filter(
            (candidate) => candidate !== wait,
          ),
          logicalTimeMs: wait.deadlineMs,
        },
      };
    }
    case StimulusKind.CompleteEffect: {
      const wait = state.effectWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.effectId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const route =
        stimulus.result.kind === EffectExecutionResultKind.BpmnError
          ? wait.bpmnErrorRoute
          : null;
      if (
        stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
        (route === null || route.code !== stimulus.result.code)
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const variables = completeActivityVariableScope(
        state.variables,
        wait.id,
        wait.outputMappings,
        stimulus.result.localPatch,
        stimulus.result.kind === EffectExecutionResultKind.BpmnError,
      );
      if (variables === null) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            route?.output ?? wait.output,
            wait.owner,
          ),
          effectWaits: state.effectWaits.filter(
            (candidate) => candidate !== wait,
          ),
          variables,
        },
      };
    }
    case StimulusKind.ReportEffectFailure: {
      const next = reportEffectFailure(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.RetryIncident: {
      const next = retryEffectIncident(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.CancelIncidentProcess: {
      const next = cancelIncidentProcess(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
