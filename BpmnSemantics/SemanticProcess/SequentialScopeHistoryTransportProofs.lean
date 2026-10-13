import BpmnSemantics.SemanticProcess.SequentialScopeCertificatePreservationProofs
import BpmnSemantics.SemanticProcess.Execution

/-! SMIS-ADMIT-01 owns actual command and internal-prefix reachability with one invariant transport through the shared scheduler cursor induction. Individual certificate preservation remains below this owner. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics InternalCommutation

inductive SequentialScopeHistoryPhase where
  | boundary | internal

/-- Actual committed Start fixes provenance; subsequent command and internal states come from the maintained evaluators. -/
inductive SequentialScopeActualHistory (program : Program) :
    SequentialScopeHistoryPhase → RuntimeState → Prop where
  | start (fuel : Nat) (commandId processId instanceId : SemanticId)
      (values : List VariableBinding)
      (committed : (applyStimulus fuel program initialState
        (.startProcess commandId processId instanceId values)).outcome = .committed) :
      SequentialScopeActualHistory program .boundary (applyStimulus fuel program initialState
        (.startProcess commandId processId instanceId values)).state
  | command (before : RuntimeState) (fuel : Nat) (stimulus : Stimulus)
      (reachable : SequentialScopeActualHistory program .boundary before) :
      SequentialScopeActualHistory program .boundary (applyStimulus fuel program before stimulus).state
  | admitted (before : RuntimeState) (stimulus : Stimulus)
      (reachable : SequentialScopeActualHistory program .boundary before)
      (committed : (admitStimulus program before stimulus).outcome = .committed) :
      SequentialScopeActualHistory program .internal (admitStimulus program before stimulus).state
  | prefix (before after : RuntimeState) (commandId : SemanticId)
      (fuel index ordinal nextFuel nextIndex nextOrdinal : Nat)
      (schedule remaining : InternalChoiceSchedule)
      (reachable : SequentialScopeActualHistory program .internal before)
      (actual : ScheduledClosurePrefix program commandId fuel index ordinal schedule before
        nextFuel nextIndex nextOrdinal remaining after) :
      SequentialScopeActualHistory program .internal after

section

variable (program : Program) (P : RuntimeState → Prop)
variable (advance : ∀ (commandId : SemanticId) (index ordinal : Nat)
    (schedule : InternalChoiceSchedule) (state : RuntimeState)
    (first : InternalExecutionOffer) (rest : List InternalExecutionOffer)
    (remaining : InternalChoiceSchedule) (consumed : Bool) (step : InternalClosureStep),
    P state →
    selectInternalExecutionFrontier program.internalSchedulingMode ordinal schedule
      (deriveInternalExecutionFrontier program state) = .execute (first :: rest) remaining consumed →
    executeSelectedFrontier? program commandId index state
      (deriveInternalExecutionFrontier program state) (first :: rest) = some step → P step.state)

include advance

private theorem smis_closure_invariant (commandId : SemanticId) (fuel index ordinal : Nat)
    (schedule : InternalChoiceSchedule) (state : RuntimeState) (initial : P state) :
    P (closeScheduledTraced fuel program commandId index ordinal schedule state).state := by
  obtain ⟨_, _, _, _, _, preserved⟩ := closeScheduledTraced_cursor_induction program commandId
    (fun _ _ _ _ current => P current) (by
      intro _ nextIndex nextOrdinal nextSchedule before first rest remaining consumed step
        prior _ selected _ executed
      exact advance commandId nextIndex nextOrdinal nextSchedule before first rest remaining consumed step
        prior selected executed) fuel index ordinal schedule state initial
  exact preserved

private theorem smis_prefix_invariant (commandId : SemanticId)
    (fuel index ordinal nextFuel nextIndex nextOrdinal : Nat)
    (schedule remaining : InternalChoiceSchedule) (before after : RuntimeState)
    (path : ScheduledClosurePrefix program commandId fuel index ordinal schedule before
      nextFuel nextIndex nextOrdinal remaining after) (initial : P before) : P after := by
  induction path with
  | initial => exact initial
  | @step fuel index ordinal schedule remaining state first rest consumed next
      earlier unstable selected enough executed ih =>
      exact advance commandId index ordinal schedule state first rest remaining consumed next
        ih selected executed

omit advance in
private theorem smis_committed_result_state (before : RuntimeState) (closed : ScheduledClosureResult)
    (committed : (StimulusResult.ofScheduledClosure before closed).outcome = .committed) :
    (StimulusResult.ofScheduledClosure before closed).state = closed.state := by
  unfold StimulusResult.ofScheduledClosure at committed ⊢
  split at committed <;> try contradiction
  unfold StimulusResult.ofClosure at committed ⊢
  split at committed <;> simp_all

private theorem smis_command_invariant
    (ingress : ∀ before stimulus, P before → P (admitStimulus program before stimulus).state)
    (fuel : Nat) (before : RuntimeState) (stimulus : Stimulus) (prior : P before) :
    P (applyStimulus fuel program before stimulus).state := by
  have admitted := ingress before stimulus prior
  cases outcome : (admitStimulus program before stimulus).outcome <;>
    simp only [applyStimulus, outcome]
  all_goals try exact admitted
  have closed := smis_closure_invariant program P advance (stimulusCommandId stimulus)
    fuel 1 0 [] (admitStimulus program before stimulus).state admitted
  unfold StimulusResult.ofScheduledClosure
  split
  · exact prior
  · unfold StimulusResult.ofClosure
    split
    · exact prior
    · exact closed

/-- A raw committed Start seed and actual admission/selection preservation establish the invariant for every history phase, including unpublished prefixes and command rollback. -/
theorem SequentialScopeActualHistory.invariant_transport
    (seed : ∀ (commandId processId instanceId : SemanticId) (values : List VariableBinding),
      (admitStimulus program initialState
        (.startProcess commandId processId instanceId values)).outcome = .committed →
      P (admitStimulus program initialState
        (.startProcess commandId processId instanceId values)).state)
    (ingress : ∀ before stimulus, P before → P (admitStimulus program before stimulus).state)
    (phase : SequentialScopeHistoryPhase) (state : RuntimeState)
    (history : SequentialScopeActualHistory program phase state) : P state := by
  induction history with
  | start fuel commandId processId instanceId values committed =>
      cases outcome : (admitStimulus program initialState
          (.startProcess commandId processId instanceId values)).outcome <;>
        simp only [applyStimulus, outcome] at committed ⊢ <;> try contradiction
      have admitted := seed commandId processId instanceId values outcome
      have closed := smis_closure_invariant program P advance commandId fuel 1 0 []
        (admitStimulus program initialState
          (.startProcess commandId processId instanceId values)).state admitted
      rw [smis_committed_result_state _ _ committed]
      exact closed
  | command before fuel stimulus reachable ih =>
      exact smis_command_invariant program P advance ingress fuel before stimulus ih
  | admitted before stimulus reachable committed ih => exact ingress before stimulus ih
  | «prefix» before after commandId fuel index ordinal nextFuel nextIndex nextOrdinal schedule remaining
      reachable actual ih =>
      exact smis_prefix_invariant program P advance commandId fuel index ordinal nextFuel nextIndex nextOrdinal
        schedule remaining before after actual ih

end

end BpmnSemantics.SemanticProcess
