import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.InternalCommutation

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
  | awaitDataInputUserTask
  | awaitDataOutputUserTask
  | awaitSequentialMultiInstanceUserTask
  | awaitParallelMultiInstanceUserTask
  | completeParallelMultiInstanceUserTask
  | awaitTimer
  | awaitMessage
  | awaitPayloadMessage
  | awaitCorrelatedPayloadMessage
  | awaitEventRace
  | awaitBoundedUserTask
  | awaitMessageBoundedUserTask
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
  | .awaitDataInputUserTask .. => .awaitDataInputUserTask
  | .awaitDataOutputUserTask .. => .awaitDataOutputUserTask
  | .awaitSequentialMultiInstanceUserTask .. => .awaitSequentialMultiInstanceUserTask
  | .awaitParallelMultiInstanceUserTask .. => .awaitParallelMultiInstanceUserTask
  | .completeParallelMultiInstanceUserTask .. => .completeParallelMultiInstanceUserTask
  | .awaitTimer .. => .awaitTimer
  | .awaitMessage .. => .awaitMessage
  | .awaitPayloadMessage .. => .awaitPayloadMessage
  | .awaitCorrelatedPayloadMessage .. => .awaitCorrelatedPayloadMessage
  | .awaitEventRace .. => .awaitEventRace
  | .awaitBoundedUserTask .. => .awaitBoundedUserTask
  | .awaitMessageBoundedUserTask .. => .awaitMessageBoundedUserTask
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
  | .awaitDataInputUserTask _ origin _ _ _ _ _
  | .awaitDataOutputUserTask _ origin _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ origin _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ origin _ _ _ _ _ _ _ _
  | .completeParallelMultiInstanceUserTask _ origin _ _ _
  | .awaitTimer _ origin _ _ _
  | .awaitMessage _ origin _ _ _
  | .awaitPayloadMessage _ origin _ _ _ _
  | .awaitCorrelatedPayloadMessage _ origin _ _ _ _ _ _ _
  | .awaitEventRace _ origin _ _ _
  | .awaitBoundedUserTask _ origin _ _ _
  | .awaitMessageBoundedUserTask _ origin _ _ _
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

/-- Reconstruct the record without exposing the private exact-ID selector. -/
theorem internalTransitionRecord_of_selection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (selected : program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) = [operation])
    (ownerSelected : selectedOperationOwner? state operation = some owner) :
    internalTransitionRecord? program state operation = some
      { operationId := operation.id, operationKind := operation.kind,
        origin := operation.origin, owner } := by
  unfold internalTransitionRecord? uniqueOperation?
  rw [selected]
  simp [ownerSelected]

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

private def replayInternalTransitionsWithoutCompensationSnapshots (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← replayInternalTransition? program state record
      replayInternalTransitionsWithoutCompensationSnapshots program successor rest
  | _, .externalStimulus _ :: _ => none

/-- Legacy internal replay is mechanically restricted to declaration-free Programs. -/
def replayInternalTransitions (program : Program) (state : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      replayInternalTransitionsWithoutCompensationSnapshots program state transitions
  | some _ => none

/-- Declaration-free strict replay requires one leading external stimulus and only internal records afterward. -/
private def replayCommittedTransitionsWithoutCompensationSnapshots
    (program : Program) (initial : RuntimeState) :
    List CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus :: rest =>
      let admission := admitStimulus program initial stimulus
      if admission.outcome = .committed then replayInternalTransitions program admission.state rest
      else none
  | [] | .internalOperation _ :: _ => none

/-- Legacy committed replay is mechanically restricted to declaration-free Programs. -/
def replayCommittedTransitions (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      replayCommittedTransitionsWithoutCompensationSnapshots program initial transitions
  | some _ => none

theorem replayCommittedTransitions_withSnapshotDeclaration_is_disabled
    (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    replayCommittedTransitions program initial transitions = none := by
  simp [replayCommittedTransitions, declared]

private def enabledTransitions (program : Program) (state : RuntimeState) :
    List (SemanticOperation × RuntimeState) :=
  canonicalEnabledInternalTransitions <|
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

structure InternalPublicationPair where
  footprint : InternalTransitionFootprint
  record : InternalTransitionRecord
  lifecycle : UnnumberedFlowNodeOccurrenceDelta

def publicationPairBefore (left right : InternalPublicationPair) : Bool :=
  if left.footprint.operationId ≠ right.footprint.operationId then
    left.footprint.operationId.value < right.footprint.operationId.value
  else if left.footprint.kind ≠ right.footprint.kind then
    match left.footprint.kind, right.footprint.kind with
    | .userTask, _ => true
    | .message, .timer | .message, .effect => true
    | .timer, .effect => true
    | _, _ => false
  else
    let leftOccurrence := left.footprint.occurrence
    let rightOccurrence := right.footprint.occurrence
    if leftOccurrence.processInstanceId ≠ rightOccurrence.processInstanceId then
      leftOccurrence.processInstanceId.value < rightOccurrence.processInstanceId.value
    else if leftOccurrence.elementId ≠ rightOccurrence.elementId then
      leftOccurrence.elementId.value < rightOccurrence.elementId.value
    else
      leftOccurrence.activation < rightOccurrence.activation

private def canonicalPublicationPair :
    InternalPublicationPair → List InternalPublicationPair → List InternalPublicationPair
  | pair, [] => [pair]
  | pair, current :: rest =>
      if publicationPairBefore pair current then pair :: current :: rest
      else current :: canonicalPublicationPair pair rest

def canonicalPublicationPairs :
    List InternalPublicationPair → List InternalPublicationPair
  | [] => []
  | pair :: rest => canonicalPublicationPair pair (canonicalPublicationPairs rest)

def internalPublicationPair? (program : Program) (footprintState before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) : Option InternalPublicationPair := do
  let footprint ← internalTransitionFootprint? program footprintState operation
  let record ← internalTransitionRecord? program before operation
  -- Supported arming lifecycles carry occurrence anchors, not transition-index anchors. Index zero
  -- therefore keeps the pair unnumbered until its canonical batch position is assigned.
  let lifecycle ← flowNodeOccurrenceDeltaForOperation? program before after operation commandId 0
  pure { footprint, record, lifecycle }

private structure InternalBatchResult where
  state : RuntimeState
  publications : List InternalPublicationPair

private def fireInternalBatch? (program : Program) (footprintState : RuntimeState)
    (commandId : SemanticId) :
    RuntimeState → List SemanticOperation → Option InternalBatchResult
  | state, [] => some { state, publications := [] }
  | state, operation :: rest => do
      let successor ← fire? program operation state
      let publication ← internalPublicationPair? program footprintState state successor
        operation commandId
      let tail ← fireInternalBatch? program footprintState commandId successor rest
      pure { state := tail.state, publications := publication :: tail.publications }

/-- A returned pair is the actual accepted record and lifecycle for the same operation step. -/
theorem internalPublicationPair_defined (program : Program)
    (footprintState before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (pair : InternalPublicationPair)
    (defined : internalPublicationPair? program footprintState before after operation commandId =
      some pair) :
    internalTransitionFootprint? program footprintState operation = some pair.footprint ∧
      internalTransitionRecord? program before operation = some pair.record ∧
      flowNodeOccurrenceDeltaForOperation? program before after operation commandId 0 =
        some pair.lifecycle := by
  simp only [internalPublicationPair?] at defined
  obtain ⟨footprint, footprintEq, defined⟩ := Option.bind_eq_some_iff.mp defined
  obtain ⟨record, recordEq, defined⟩ := Option.bind_eq_some_iff.mp defined
  obtain ⟨lifecycle, lifecycleEq, resultEq⟩ := Option.bind_eq_some_iff.mp defined
  cases resultEq
  exact ⟨footprintEq, recordEq, lifecycleEq⟩

private def prependPublicationPairs (heads : Option (List InternalPublicationPair))
    (records : Option (List InternalTransitionRecord))
    (lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List InternalTransitionRecord) ×
      Option (List UnnumberedFlowNodeOccurrenceDelta) :=
  match heads, records, lifecycles with
  | some pairs, some records, some lifecycles =>
      let ordered := canonicalPublicationPairs pairs
      (some (ordered.map (·.record) ++ records),
        some (ordered.map (·.lifecycle) ++ lifecycles))
  | _, _, _ => (none, none)

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
          let operations := transitions.map (·.1)
          if internalOperationFrontierPairwiseIndependent? program state operations then
            if operations.length > fuel + 1 then
              { state, hitBound := true, ambiguousChoice := false,
                records := none, lifecycles := none }
            else
              match fireInternalBatch? program state commandId state operations with
              | none =>
                  { state, hitBound := false, ambiguousChoice := true,
                    records := none, lifecycles := none }
              | some batch =>
                  let closed := closeSupportedTraced (fuel - (remaining.length + 1))
                    program commandId (transitionIndex + operations.length) batch.state
                  let paired := prependPublicationPairs (some batch.publications)
                    closed.records closed.lifecycles
                  { closed with records := paired.1, lifecycles := paired.2 }
          else
            { state, hitBound := false, ambiguousChoice := true,
              records := none, lifecycles := none }
termination_by fuel => fuel
decreasing_by
  all_goals apply Nat.lt_succ_of_le
  all_goals first | exact Nat.le_refl _ | exact Nat.sub_le _ _

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

theorem applyStimulus_withSnapshotDeclaration_rejects
    (closureLimit : Nat) (program : Program) (state : RuntimeState)
    (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    applyStimulus closureLimit program state stimulus =
      { outcome := .rejected
        state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  simp [applyStimulus, admitStimulus, declared]

theorem applyStimulusTraced_withSnapshotDeclaration_rejects
    (closureLimit : Nat) (program : Program) (state : RuntimeState)
    (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    (applyStimulusTraced closureLimit program state stimulus).result =
        { outcome := .rejected
          state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions = [] ∧
      (applyStimulusTraced closureLimit program state stimulus).flowNodeOccurrenceLifecycles =
        [] := by
  simp [applyStimulusTraced, evaluateStimulus, admitStimulus, declared,
    publishEvaluatedTransitions, publishEvaluatedLifecycles]

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
