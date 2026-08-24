import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle

/-! # Committed semantic transition traces

This module owns the revision-free trace produced at the external evaluator boundary. It records the exact admitted stimulus and the metadata of each operation selected by bounded internal closure. The trace never changes `RuntimeState`, and strict replay resolves and checks an operation before firing it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Closed public discriminator for the existing Semantic Process operation variants. -/
inductive SemanticOperationKind where
  | initiate
  | initiateMessage
  | initiateTimer
  | enterScope
  | enterBoundedScope
  | invokeProcess
  | returnProcess
  | awaitUserTask
  | awaitSequentialMultiInstanceUserTask
  | awaitTimer
  | awaitMessage
  | awaitEventRace
  | awaitBoundedUserTask
  | awaitMonitoredUserTask
  | awaitEffect
  | duplicate
  | synchronize
  | mergeExclusive
  | choose
  | selectMany
  | synchronizeSelected
  | throwError
  | reachNoneEnd
  | terminateScope
  | completeScope
  deriving Repr, DecidableEq

def SemanticOperation.kind : SemanticOperation → SemanticOperationKind
  | .initiate .. => .initiate
  | .initiateMessage .. => .initiateMessage
  | .initiateTimer .. => .initiateTimer
  | .enterScope .. => .enterScope
  | .enterBoundedScope .. => .enterBoundedScope
  | .invokeProcess .. => .invokeProcess
  | .returnProcess .. => .returnProcess
  | .awaitUserTask .. => .awaitUserTask
  | .awaitSequentialMultiInstanceUserTask .. => .awaitSequentialMultiInstanceUserTask
  | .awaitTimer .. => .awaitTimer
  | .awaitMessage .. => .awaitMessage
  | .awaitEventRace .. => .awaitEventRace
  | .awaitBoundedUserTask .. => .awaitBoundedUserTask
  | .awaitMonitoredUserTask .. => .awaitMonitoredUserTask
  | .awaitEffect .. => .awaitEffect
  | .duplicate .. => .duplicate
  | .synchronize .. => .synchronize
  | .mergeExclusive .. => .mergeExclusive
  | .choose .. => .choose
  | .selectMany .. => .selectMany
  | .synchronizeSelected .. => .synchronizeSelected
  | .throwError .. => .throwError
  | .reachNoneEnd .. => .reachNoneEnd
  | .terminateScope .. => .terminateScope
  | .completeScope .. => .completeScope

def SemanticOperation.origin : SemanticOperation → BpmnElementOrigin
  | .initiate _ origin _
  | .initiateMessage _ origin _ _
  | .initiateTimer _ origin _ _
  | .enterScope _ origin _ _ _
  | .enterBoundedScope _ origin _ _ _ _
  | .invokeProcess _ origin _ _ _ _ _
  | .returnProcess _ origin _ _ _
  | .awaitUserTask _ origin _ _ _
  | .awaitSequentialMultiInstanceUserTask _ origin _ _ _ _ _ _
  | .awaitTimer _ origin _ _ _
  | .awaitMessage _ origin _ _ _
  | .awaitEventRace _ origin _ _ _
  | .awaitBoundedUserTask _ origin _ _ _
  | .awaitMonitoredUserTask _ origin _ _ _
  | .awaitEffect _ origin _ _ _ _
  | .duplicate _ origin _ _
  | .synchronize _ origin _ _
  | .mergeExclusive _ origin _ _
  | .choose _ origin _ _ _ _
  | .selectMany _ origin _ _ _ _
  | .synchronizeSelected _ origin _ _ _
  | .throwError _ origin _ _ _
  | .reachNoneEnd _ origin _
  | .terminateScope _ origin _ _
  | .completeScope _ origin _ _ => origin

/-- Public metadata of one actually selected internal operation. -/
structure InternalTransitionRecord where
  operationId : OperationId
  operationKind : SemanticOperationKind
  origin : BpmnElementOrigin
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

/-- One revision-free committed semantic transition. -/
inductive CommittedTransition where
  | externalStimulus (stimulus : Stimulus)
  | internalOperation (record : InternalTransitionRecord)
  deriving Repr, DecidableEq

/-- Resolve the runtime occurrence selected by the same state and operation that `fire?` consumes. -/
def selectedOperationOwner? (state : RuntimeState) :
    SemanticOperation → Option ScopeOccurrenceId :=
  flowNodeSelectedOperationOwner? state

private def uniqueOperation? (program : Program) (id : OperationId) : Option SemanticOperation :=
  match program.operations.filter fun operation => decide (operation.id = id) with
  | [operation] => some operation
  | _ => none

/-- Construct one record only when the selected operation is unique in the exact Program. -/
def internalTransitionRecord? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalTransitionRecord := do
  let selected ← uniqueOperation? program operation.id
  if selected ≠ operation then none
  else
    let owner ← selectedOperationOwner? state selected
    pure
      { operationId := selected.id
        operationKind := selected.kind
        origin := selected.origin
        owner }

/-- Replay one internal record after checking all metadata against one unique Program operation. -/
def replayInternalTransition? (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) : Option RuntimeState := do
  let operation ← uniqueOperation? program record.operationId
  if operation.kind ≠ record.operationKind || operation.origin ≠ record.origin then none
  else
    let owner ← selectedOperationOwner? state operation
    if owner ≠ record.owner then none
    else fire? program operation state

private theorem uniqueOperation_mem_and_matches (program : Program) (id : OperationId)
    (operation : SemanticOperation)
    (selected : uniqueOperation? program id = some operation) :
    operation ∈ program.operations ∧ operation.id = id := by
  unfold uniqueOperation? at selected
  generalize matchesEq : program.operations.filter
    (fun candidate => decide (candidate.id = id)) = filtered at selected
  cases filtered with
  | nil => simp at selected
  | cons head tail =>
      cases tail with
      | nil =>
          simp at selected
          subst head
          have member : operation ∈ program.operations.filter
              (fun candidate => decide (candidate.id = id)) := by
            rw [matchesEq]
            simp
          exact ⟨(List.mem_filter.mp member).1,
            of_decide_eq_true (List.mem_filter.mp member).2⟩
      | cons next rest => simp at selected

/-- Successful strict replay is one exact `ProgramStep` with all record metadata prevalidated. -/
theorem replayInternalTransition_sound (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (replayed : replayInternalTransition? program before record = some after) :
    ProgramStep program before record.operationId after ∧
      ∃ operation,
        uniqueOperation? program record.operationId = some operation ∧
          operation.kind = record.operationKind ∧
          operation.origin = record.origin ∧
          selectedOperationOwner? before operation = some record.owner := by
  unfold replayInternalTransition? at replayed
  generalize selectedEq : uniqueOperation? program record.operationId = selected at replayed
  cases selected with
  | none => simp at replayed
  | some operation =>
      by_cases kindMatches : operation.kind = record.operationKind
      · by_cases originMatches : operation.origin = record.origin
        · simp [kindMatches, originMatches] at replayed
          generalize ownerEq : selectedOperationOwner? before operation = selectedOwner at replayed
          cases selectedOwner with
          | none => simp at replayed
          | some selectedOwner =>
              by_cases ownerMatches : selectedOwner = record.owner
              · simp [ownerMatches] at replayed
                have membership := uniqueOperation_mem_and_matches program record.operationId
                  operation selectedEq
                exact
                  ⟨⟨operation, membership.1, membership.2,
                      fire_sound program operation before after replayed⟩,
                    operation, (by simp), kindMatches, originMatches,
                    ownerEq.trans (congrArg some ownerMatches)⟩
              · simp [ownerMatches] at replayed
        · simp [kindMatches, originMatches] at replayed
      · simp [kindMatches] at replayed

def replayInternalTransitions (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← replayInternalTransition? program state record
      replayInternalTransitions program successor rest
  | _, .externalStimulus _ :: _ => none

/-- Strict replay requires exactly one leading external stimulus and only internal records afterward. -/
def replayCommittedTransitions (program : Program) (initial : RuntimeState) :
    List CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus :: rest =>
      let admission := admitStimulus program initial stimulus
      if admission.outcome = .committed then replayInternalTransitions program admission.state rest
      else none
  | [] | .internalOperation _ :: _ => none

private def enabledTransitions (program : Program) (state : RuntimeState) :
    List (SemanticOperation × RuntimeState) :=
  program.operations.filterMap fun operation =>
    match fire? program operation state with
    | none => none
    | some successor => some (operation, successor)

/-- Number of enabled internal operations, exposed for targeted admission-preservation checks. -/
def enabledInternalOperationCount (program : Program) (state : RuntimeState) : Nat :=
  (enabledTransitions program state).length

/-- A stable state is resumable exactly when it is complete or exposes a semantic wait. -/
def stableStateResumable (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted => false
  | .running _ =>
      eventRaceAssociationsValid state && calledProcessAssociationsValid state &&
        effectIncidentAssociationsValid state &&
        (!state.waits.isEmpty || !state.messageWaits.isEmpty ||
          !state.timerWaits.isEmpty || !state.effectWaits.isEmpty ||
          !state.effectIncidents.isEmpty)
  | .completed _ | .cancelled _ => true

private def independentParallelTaskChoices : List (SemanticOperation × RuntimeState) → Bool
  | [ (.awaitUserTask _ _ inputA outputA taskA, _)
    , (.awaitUserTask _ _ inputB outputB taskB, _) ] =>
      decide (inputA ≠ inputB ∧ outputA ≠ outputB ∧ taskA.id ≠ taskB.id)
  | _ => false

private structure ClosureTraceResult where
  state : RuntimeState
  hitBound : Bool
  ambiguousChoice : Bool
  records : Option (List InternalTransitionRecord)
  lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

private def prependRecord (head : Option InternalTransitionRecord)
    (tail : Option (List InternalTransitionRecord)) : Option (List InternalTransitionRecord) := do
  pure ((← head) :: (← tail))

private def prependLifecycle (head : Option UnnumberedFlowNodeOccurrenceDelta)
    (tail : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List UnnumberedFlowNodeOccurrenceDelta) := do
  pure ((← head) :: (← tail))

/-- Execute bounded closure while retaining the selected operation and dynamic owner at each step. -/
private def closeSupportedTraced :
    Nat → Program → SemanticId → Nat → RuntimeState → ClosureTraceResult
  | 0, program, _, _, state =>
      match enabledTransitions program state with
      | [] =>
          { state, hitBound := false, ambiguousChoice := false,
            records := some [], lifecycles := some [] }
      | [_] | _ :: _ :: _ =>
          { state, hitBound := true, ambiguousChoice := false,
            records := none, lifecycles := none }
  | fuel + 1, program, commandId, transitionIndex, state =>
      match enabledTransitions program state with
      | [] =>
          { state, hitBound := false, ambiguousChoice := false,
            records := some [], lifecycles := some [] }
      | [(operation, successor)] =>
          let closed := closeSupportedTraced fuel program commandId
            (transitionIndex + 1) successor
          { closed with
            records := prependRecord (internalTransitionRecord? program state operation)
              closed.records
            lifecycles := prependLifecycle
              (flowNodeOccurrenceDeltaForOperation? program state successor operation
                commandId transitionIndex) closed.lifecycles }
      | first :: second :: remaining =>
          let transitions := first :: second :: remaining
          if independentParallelTaskChoices transitions then
            let closed := closeSupportedTraced fuel program commandId
              (transitionIndex + 1) first.2
            { closed with
              records := prependRecord (internalTransitionRecord? program state first.1)
                closed.records
              lifecycles := prependLifecycle
                (flowNodeOccurrenceDeltaForOperation? program state first.2 first.1
                  commandId transitionIndex) closed.lifecycles }
          else
            { state, hitBound := false, ambiguousChoice := true,
              records := none, lifecycles := none }

/-- Semantic command outcome and candidate state, with closure failures kept separate. -/
structure StimulusResult where
  outcome : CommandOutcome
  state : RuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

/-- Result plus an unnumbered trace. Empty is the only representation of unpublishability. -/
structure TracedStimulusResult where
  result : StimulusResult
  committedTransitions : List CommittedTransition
  flowNodeOccurrenceLifecycles : List UnnumberedFlowNodeOccurrenceDelta
  deriving Repr, DecidableEq

private structure EvaluatedStimulus where
  result : StimulusResult
  candidateTransitions : Option (List CommittedTransition)
  candidateLifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

private def evaluateStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : EvaluatedStimulus :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let commandId := stimulusCommandId stimulus
      let externalLifecycle := flowNodeOccurrenceDeltaForStimulus? program state
        admission.state stimulus 0
      let closure := closeSupportedTraced closureLimit program commandId 1 admission.state
      let result : StimulusResult :=
        { outcome := .committed
          state := closure.state
          internalStepBoundExceeded := closure.hitBound
          ambiguousInternalChoice := closure.ambiguousChoice }
      if closure.hitBound || closure.ambiguousChoice then
        { result, candidateTransitions := none, candidateLifecycles := none }
      else
        { result
          candidateTransitions := do
            let records ← closure.records
            let _ ← externalLifecycle
            let _ ← closure.lifecycles
            pure (.externalStimulus stimulus :: records.map .internalOperation)
          candidateLifecycles := prependLifecycle externalLifecycle closure.lifecycles }
  | outcome =>
      { result :=
          { outcome
            state := admission.state
            internalStepBoundExceeded := false
            ambiguousInternalChoice := false }
        candidateTransitions := none
        candidateLifecycles := none }

private def replayCheckedTransitions (program : Program) (initial result : RuntimeState) :
    Option (List CommittedTransition) → List CommittedTransition
  | some candidate =>
      if replayCommittedTransitions program initial candidate = some result then candidate else []
  | none => []

private theorem replayCheckedTransitions_sound (program : Program)
    (initial result : RuntimeState) (candidate : Option (List CommittedTransition))
    (published : replayCheckedTransitions program initial result candidate ≠ []) :
    replayCommittedTransitions program initial
        (replayCheckedTransitions program initial result candidate) = some result := by
  cases candidate with
  | none => simp [replayCheckedTransitions] at published
  | some transitions =>
      by_cases replays :
          replayCommittedTransitions program initial transitions = some result
      · simp [replayCheckedTransitions, replays]
      · simp [replayCheckedTransitions, replays] at published

private def publishEvaluatedTransitions (program : Program) (initial : RuntimeState)
    (evaluated : EvaluatedStimulus) : List CommittedTransition :=
  match evaluated.result.outcome with
  | .committed => replayCheckedTransitions program initial evaluated.result.state
      evaluated.candidateTransitions
  | .rolledBack | .rejected | .semanticFailure | .unsupported => []

private def publishEvaluatedLifecycles (program : Program) (initial : RuntimeState)
    (evaluated : EvaluatedStimulus) : List UnnumberedFlowNodeOccurrenceDelta :=
  let transitions := publishEvaluatedTransitions program initial evaluated
  match evaluated.candidateLifecycles with
  | some lifecycles =>
      if transitions.length = lifecycles.length then lifecycles else []
  | none => []

/-- Pure external-command boundary with exact committed transition capture. -/
def applyStimulusTraced (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : TracedStimulusResult :=
  let evaluated := evaluateStimulus closureLimit program state stimulus
  { result := evaluated.result
    committedTransitions := publishEvaluatedTransitions program state evaluated
    flowNodeOccurrenceLifecycles := publishEvaluatedLifecycles program state evaluated }

/-- Existing result-only API, defined as exact erasure of the traced evaluator. -/
def applyStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupportedTraced closureLimit program (stimulusCommandId stimulus) 1
        admission.state
      { outcome := .committed
        state := closure.state
        internalStepBoundExceeded := closure.hitBound
        ambiguousInternalChoice := closure.ambiguousChoice }
  | outcome =>
      { outcome
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def scenarioClosureLimit : Nat := 8

private theorem evaluateStimulus_result_eq_applyStimulus
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    (evaluateStimulus closureLimit program state stimulus).result =
      applyStimulus closureLimit program state stimulus := by
  unfold evaluateStimulus applyStimulus
  generalize admissionEq : admitStimulus program state stimulus = admission
  cases outcomeEq : admission.outcome
  case committed =>
    simp only [outcomeEq]
    generalize closureEq : closeSupportedTraced closureLimit program
      (stimulusCommandId stimulus) 1 admission.state = closure
    cases closure with
    | mk successor hitBound ambiguous records lifecycles =>
        cases hitBound <;> cases ambiguous <;> rfl
  all_goals simp [outcomeEq]

/-- Erasing the trace is definitionally the existing evaluator result. -/
theorem applyStimulusTraced_erases_to_applyStimulus
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    (applyStimulusTraced closureLimit program state stimulus).result =
      applyStimulus closureLimit program state stimulus := by
  unfold applyStimulusTraced
  dsimp only
  exact evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus

/-- Every nonempty evaluator-emitted publication replays to its exact committed result state. -/
theorem applyStimulusTraced_emitted_trace_replays
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (published :
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ []) :
    replayCommittedTransitions program state
        (applyStimulusTraced closureLimit program state stimulus).committedTransitions =
      some (applyStimulus closureLimit program state stimulus).state := by
  unfold applyStimulusTraced at *
  dsimp only at *
  unfold publishEvaluatedTransitions at published ⊢
  split at *
  · calc
      replayCommittedTransitions program state
          (replayCheckedTransitions program state
            (evaluateStimulus closureLimit program state stimulus).result.state
            (evaluateStimulus closureLimit program state stimulus).candidateTransitions) =
          some (evaluateStimulus closureLimit program state stimulus).result.state :=
        replayCheckedTransitions_sound program state
          (evaluateStimulus closureLimit program state stimulus).result.state
          (evaluateStimulus closureLimit program state stimulus).candidateTransitions published
      _ = some (applyStimulus closureLimit program state stimulus).state :=
        congrArg (fun result : StimulusResult => some result.state)
          (evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus)
  all_goals simp at published

/-- Non-committed admission has no public trace. -/
theorem applyStimulusTraced_noncommitted_has_no_trace
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (notCommitted : (applyStimulus closureLimit program state stimulus).outcome ≠ .committed) :
    (applyStimulusTraced closureLimit program state stimulus).committedTransitions = [] := by
  rw [← evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus]
    at notCommitted
  unfold applyStimulusTraced
  dsimp only at *
  unfold publishEvaluatedTransitions
  split <;> simp_all

/-- Any trace-suppression condition also suppresses its aligned lifecycle publication. -/
theorem applyStimulusTraced_no_trace_has_no_lifecycle
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (noTrace :
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions = []) :
    (applyStimulusTraced closureLimit program state stimulus).flowNodeOccurrenceLifecycles = [] := by
  unfold applyStimulusTraced at noTrace ⊢
  dsimp only at noTrace ⊢
  unfold publishEvaluatedLifecycles
  simp only [noTrace, List.length_nil]
  generalize candidateEq :
    (evaluateStimulus closureLimit program state stimulus).candidateLifecycles = candidate
  cases candidate with
  | none => rfl
  | some lifecycles => cases lifecycles <;> simp

end BpmnSemantics.SemanticProcess
