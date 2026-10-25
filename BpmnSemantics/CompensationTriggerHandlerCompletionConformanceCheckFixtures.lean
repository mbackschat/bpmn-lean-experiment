module

public import BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotCommandAdmission
public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic

/-! Fixture definitions and executable checks of [`CompensationTriggerHandlerCompletionConformance`](CompensationTriggerHandlerCompletionConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.CompensationTriggerHandlerCompletionConformance


open BpmnSemantics
open BpmnSemantics.CompensationTriggerHandlerSemanticFixtures
open BpmnSemantics.SemanticProcess

def completing_b_starts_a_without_disturbing_independent_c : Bool := decide <|
    attemptCompensationHandlerEffectCompletion program triggeredState waitB.id (.success []) =
      .applied afterBState

def completing_independent_c_first_keeps_a_pending_until_b_finishes : Bool := decide <|
    attemptCompensationHandlerEffectCompletion program triggeredState waitC.id (.success []) =
      .applied afterCFirstState

def the_last_success_releases_exactly_one_continuation_and_retain_tombstones : Bool := decide <|
    attemptCompensationHandlerEffectCompletion program afterBState waitA.id (.success []) =
        .applied afterBThenAState ∧
      attemptCompensationHandlerEffectCompletion program afterBThenAState waitC.id (.success []) =
        .applied allSucceededState ∧
      allSucceededState.tokens = [{ placeId := ⟨"place:done"⟩, owner := rootOwner }] ∧
      allSucceededState.compensationHandlerEffectWaits = []

def inheritedListener : EventSubProcessMessageSubscription :=
  { id := occurrence "InheritedListener", owner := rootOwner,
    channel := .directMessage ⟨"InheritedMessage"⟩ }

def populatedFailureBefore : RuntimeState :=
  { triggeredState with
    eventSubProcessMessageSubscriptions := [inheritedListener]
    activityOccurrences :=
      [{ processInstanceId := instanceId, activityElementId := ⟨"A"⟩, activation := 1,
         owner := rootOwner, body := .userTask (occurrence "A"), attachedHandlers := [] }]
    sequentialScopeControllers :=
      [{ id := activityOccurrence "A", total := 2, completed := 0, currentItem := "first" }]
    parallelScopeControllers := [{ id := activityOccurrence "C", total := 2, completed := 0 }]
    variables :=
      { process := { bindings := [{ name := "retained", value := .integer 9 }] }
        scopes := [{ owner := rootOwner, bindings := [] }]
        processInterfaces := [{ owner := rootOwner, inputs := [], outputs := [] }]
        activities := [{ owner := .activityOccurrence (activityOccurrence "A"), bindings := [] }] }
    endOccurrences := 7
    logicalTimeMs := 13 }

def selectedC : SelectedCompensationHandler :=
  { wait := waitC, trigger := activeTrigger, handler := compensatingHandlerC }

def expectedPopulatedFailure : RuntimeState :=
  { failedState with
    eventSubProcessMessageSubscriptions := [inheritedListener]
    variables :=
      { process := { bindings := [{ name := "retained", value := .integer 9 }] }
        scopes := [], processInterfaces := [], activities := [] }
    endOccurrences := 7
    logicalTimeMs := 13 }

def delayed_event_subprocess_context_reaches_the_new_frontier_unchanged : Bool := decide <|
    attemptCompensationTrigger delayedProgram triggerOperation preTriggerState =
        .applied delayedTriggeredState ∧
      attemptCompensationHandlerEffectCompletion delayedProgram delayedTriggeredState
          delayedWaitC.id (.success []) = .applied delayedAfterCState ∧
      delayedAfterCWaitB.arguments =
        [{ name := "argument", value := .string "old" }]

def delayedSuccessorBytes : Nat :=
  canonicalCompensationExecutionStateUtf8Bytes delayedAfterCState.compensationTriggers
    delayedAfterCState.compensationHandlerEffectWaits

def delayedCurrentBytes : Nat :=
  canonicalCompensationExecutionStateUtf8Bytes delayedTriggeredState.compensationTriggers
    delayedTriggeredState.compensationHandlerEffectWaits

def delayedProgramBelowSuccessor : Program :=
  { delayedProgram with
    compensationExecution := some
      { delayedExecutionDeclaration with
        limits :=
          { delayedExecutionDeclaration.limits with
            maxCanonicalBytes := delayedSuccessorBytes - 1 } } }

def completeBStimulus : Stimulus :=
  .completeEffect ⟨"complete-b"⟩ waitB.id (.success [])

def failCStimulus : Stimulus :=
  .completeEffect ⟨"fail-c"⟩ waitC.id failureResult

def command_admission_dispatches_exact_compensation_success_and_failure : Bool := decide <|
    (admitStimulusWithCompensationSnapshots program triggeredState
        completeBStimulus).outcome = .committed ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        completeBStimulus).state = afterBState ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        failCStimulus).outcome = .committed ∧
      (admitStimulusWithCompensationSnapshots program triggeredState
        failCStimulus).state = failedState

def cross_family_effect_identity_collision_rejects_the_exact_submitted_state : Bool := decide <|
    (admitStimulusWithCompensationSnapshots program effectCollisionState
        completeBStimulus).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots program effectCollisionState
        completeBStimulus).state = effectCollisionState

def occurrenceStart (anchor : SemanticFlowNodeOccurrenceAnchor)
    (elementId : String) : UnnumberedFlowNodeOccurrenceStart :=
  { anchor
    processId := program.processId
    elementId := ⟨elementId⟩
    owner := rootOwner }

def expectedTriggerLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [occurrenceStart (.wait waitB.id) "EB",
       occurrenceStart (.compensationTrigger activeTrigger.id) "throw",
       occurrenceStart (.compensationHandler compensatingHandlerB.identity.id) "HB",
       occurrenceStart (.compensationHandler compensatingHandlerC.identity.id) "HC"]
    ended := [] }

def expectedBSuccessLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started :=
      [occurrenceStart (.compensationHandler compensatingHandlerA.identity.id) "HA"]
    ended :=
      [{ anchor := .wait waitB.id, terminal := .completed },
       { anchor := .compensationHandler compensatingHandlerB.identity.id,
         terminal := .completed }] }

def expectedCFailureLifecycle : UnnumberedFlowNodeOccurrenceDelta :=
  { started := []
    ended :=
      [{ anchor := .wait waitB.id, terminal := .cancelled },
       { anchor := .compensationTrigger activeTrigger.id, terminal := .cancelled },
       { anchor := .compensationHandler compensatingHandlerB.identity.id,
         terminal := .cancelled },
       { anchor := .compensationHandler compensatingHandlerC.identity.id,
         terminal := .cancelled }] }

def trigger_and_completion_lifecycles_preserve_private_pairing_and_public_terminals : Bool := decide <|
    flowNodeOccurrenceDeltaForOperationWithCompensation? program preTriggerState triggeredState
        triggerOperation ⟨"trigger-command"⟩ 1 = some expectedTriggerLifecycle ∧
      flowNodeOccurrenceDeltaForStimulusWithCompensation? program triggeredState afterBState
        completeBStimulus 0 = some expectedBSuccessLifecycle ∧
      flowNodeOccurrenceDeltaForStimulusWithCompensation? program triggeredState failedState
        failCStimulus 0 = some expectedCFailureLifecycle

def completeBTrace :=
  applyStimulusTracedWithCompensationSnapshots 1 program triggeredState completeBStimulus

def failCTrace :=
  applyStimulusTracedWithCompensationSnapshots 1 program triggeredState failCStimulus

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("completing_b_starts_a_without_disturbing_independent_c", completing_b_starts_a_without_disturbing_independent_c),
  ("completing_independent_c_first_keeps_a_pending_until_b_finishes", completing_independent_c_first_keeps_a_pending_until_b_finishes),
  ("the_last_success_releases_exactly_one_continuation_and_retain_tombstones", the_last_success_releases_exactly_one_continuation_and_retain_tombstones),
  ("delayed_event_subprocess_context_reaches_the_new_frontier_unchanged", delayed_event_subprocess_context_reaches_the_new_frontier_unchanged),
  ("command_admission_dispatches_exact_compensation_success_and_failure", command_admission_dispatches_exact_compensation_success_and_failure),
  ("cross_family_effect_identity_collision_rejects_the_exact_submitted_state", cross_family_effect_identity_collision_rejects_the_exact_submitted_state),
  ("trigger_and_completion_lifecycles_preserve_private_pairing_and_public_terminals", trigger_and_completion_lifecycles_preserve_private_pairing_and_public_terminals)
]

end BpmnSemantics.CompensationTriggerHandlerCompletionConformance
