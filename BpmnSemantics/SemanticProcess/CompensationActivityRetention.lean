import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Boundary Compensation Activity retention

This module owns the approved hidden register for successfully completed outer Activities that have
an explicitly declared boundary Compensation handler. It defines no throw, handler, snapshot,
ordering, cancellation, source, public-observation, or host behavior.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive CompensationMultiInstanceOutcome where
  | allSuccessfulCompletion
  | earlyCompletion
  | interrupted
  deriving Repr, DecidableEq

/-- Closed evaluator-derived facts for the three admitted completion families. -/
inductive CompensationCompletionFacts where
  | ordinaryUserTask (activity : ActivityOccurrenceId)
  | multiInstanceUserTask
      (activity : ActivityOccurrenceId)
      (plannedInstances successfullyCompletedInstances : Nat)
      (outcome : CompensationMultiInstanceOutcome)
  deriving Repr, DecidableEq

def CompensationCompletionFacts.activity : CompensationCompletionFacts → ActivityOccurrenceId
  | .ordinaryUserTask activity
  | .multiInstanceUserTask activity _ _ _ => activity

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

private def activityIdentityValid (id : ActivityOccurrenceId) : Bool :=
  !id.processInstanceId.value.isEmpty && !id.activityElementId.value.isEmpty &&
    id.activation > 0 && safeNat id.activation

private def declarationTargetsActivity
    (declaration : CompensationActivityRetentionDeclaration)
    (activity : ActivityOccurrenceId) : Bool :=
  declaration.targets.any fun target =>
    target.activityElementId.value == activity.activityElementId.value

/-- Exact canonical bytes of one Activity occurrence identity object.

The constant fragments spell the Unicode-scalar-sorted object keys. String values delegate to the
shared escape-aware measure; decimal naturals need no JSON escaping. -/
def canonicalActivityOccurrenceIdUtf8Bytes (id : ActivityOccurrenceId) : Nat :=
  "{\"activation\":".utf8ByteSize + (toString id.activation).utf8ByteSize +
    ",\"activityElementId\":".utf8ByteSize +
      canonicalJsonStringUtf8Bytes id.activityElementId.value +
    ",\"processInstanceId\":".utf8ByteSize +
      canonicalJsonStringUtf8Bytes id.processInstanceId.value +
    "}".utf8ByteSize

/-- Exact canonical bytes of one completed-record object. -/
def canonicalCompletedCompensableActivityUtf8Bytes
    (record : CompletedCompensableActivity) : Nat :=
  "{\"completionOrdinal\":".utf8ByteSize +
      (toString record.completionOrdinal).utf8ByteSize +
    ",\"id\":".utf8ByteSize + canonicalActivityOccurrenceIdUtf8Bytes record.id +
    "}".utf8ByteSize

/-- Exact canonical bytes of the retained `records` array. -/
def canonicalCompensationRecordsUtf8Bytes : List CompletedCompensableActivity → Nat
  | [] => 2
  | first :: rest =>
      rest.foldl (fun total record =>
        total + canonicalCompletedCompensableActivityUtf8Bytes record + 1)
        (canonicalCompletedCompensableActivityUtf8Bytes first) + 2

private def recordsHaveIncreasingOrdinals : List CompletedCompensableActivity → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      left.completionOrdinal < right.completionOrdinal &&
        recordsHaveIncreasingOrdinals (right :: rest)

private def recordIdentityUnique (records : List CompletedCompensableActivity)
    (record : CompletedCompensableActivity) : Bool :=
  (records.filter fun candidate => candidate.id == record.id).length = 1

private def retentionRegisterValid
    (declaration : CompensationActivityRetentionDeclaration)
    (instanceId : SemanticId) (state : RuntimeState)
    (retention : CompensationActivityRetention) : Bool :=
  retention.owner.processInstanceId == instanceId &&
    retention.owner.definitionScopeId == declaration.definitionScopeId &&
    retention.owner.activation == 1 &&
    (state.scopeOccurrences.filter fun occurrence =>
      occurrence.id == retention.owner) = [{ id := retention.owner, parent := none }] &&
    retention.nextCompletionOrdinal > 0 && safeNat retention.nextCompletionOrdinal &&
    recordsHaveIncreasingOrdinals retention.records &&
    retention.records.length ≤ declaration.maxRecords &&
    canonicalCompensationRecordsUtf8Bytes retention.records ≤
      declaration.maxCanonicalBytes &&
    retention.records.all fun record =>
      activityIdentityValid record.id &&
        record.id.processInstanceId == retention.owner.processInstanceId &&
        declarationTargetsActivity declaration record.id &&
        recordIdentityUnique retention.records record &&
        record.completionOrdinal > 0 &&
        record.completionOrdinal < retention.nextCompletionOrdinal &&
        safeNat record.completionOrdinal

/-- Program-aware state validity. Lean's list represents both physical omission and empty collection;
the Program declaration supplies the distinction at the strict wire boundary. -/
def compensationActivityRetentionStateValid (program : Program)
    (state : RuntimeState) : Bool :=
  compensationActivityRetentionDeclarationValid program &&
    match program.compensationActivityRetention with
    | none => state.compensationActivityRetentions.isEmpty
    | some declaration =>
        match state.control with
        | .notStarted | .completed _ | .cancelled _ | .failed .. =>
            state.compensationActivityRetentions.isEmpty
        | .running instanceId =>
            match state.compensationActivityRetentions with
            | [retention] => retentionRegisterValid declaration instanceId state retention
            | _ => false

def compensationActivityRetentionView? (program : Program) (state : RuntimeState) :
    Option (List CompensationActivityRetention) :=
  program.compensationActivityRetention.map fun _ =>
    state.compensationActivityRetentions

/-- Closed eligibility decision for a Multi-Instance completion fact. -/
def multiInstanceCompletionEligible : CompensationCompletionFacts → Bool
  | .ordinaryUserTask _ => false
  | .multiInstanceUserTask activity planned successful outcome =>
      activityIdentityValid activity && safeNat planned && safeNat successful &&
        match outcome with
        | .allSuccessfulCompletion => planned == successful
        | .earlyCompletion | .interrupted => false

private def retentionCandidate? :
    CompensationCompletionFacts → Option (Option ActivityOccurrenceId)
  | .ordinaryUserTask activity =>
      if activityIdentityValid activity then some (some activity) else none
  | facts@(.multiInstanceUserTask activity planned successful outcome) =>
      if !activityIdentityValid activity || !safeNat planned || !safeNat successful then none
      else match outcome with
        | .allSuccessfulCompletion =>
            if multiInstanceCompletionEligible facts then some (some activity) else none
        | .earlyCompletion | .interrupted =>
            if successful < planned then some none else none

private def CompensationCompletionFacts.operationFamily :
    CompensationCompletionFacts → CompensationActivityOperationFamily
  | .ordinaryUserTask _ => .ordinaryUserTask
  | .multiInstanceUserTask .. => .multiInstanceUserTask

inductive CompensationRetentionCapacityMeasure where
  | records
  | canonicalBytes
  deriving Repr, DecidableEq

inductive CompensationRetentionRefusal where
  | declarationAbsent
  | invalidDeclaration
  | invalidState
  | malformedCompletion
  | wrongInstance
  | targetAbsent
  | registerAbsent
  | duplicateActivity
  | capacity
      (measure : CompensationRetentionCapacityMeasure)
      (limit observed : Nat)
  deriving Repr, DecidableEq

inductive CompensationRetentionResult where
  | retained (state : RuntimeState) (record : CompletedCompensableActivity)
  | notRetained (state : RuntimeState)
  | refused (reason : CompensationRetentionRefusal) (state : RuntimeState)
  deriving Repr, DecidableEq

private def replaceRetentionRegister
    (target updated : CompensationActivityRetention) :
    List CompensationActivityRetention → List CompensationActivityRetention
  | [] => []
  | current :: rest =>
      (if current.owner = target.owner then updated else current) ::
        replaceRetentionRegister target updated rest

def insertCompletedCompensableActivity
    (declaration : CompensationActivityRetentionDeclaration)
    (activity : ActivityOccurrenceId)
    (retention : CompensationActivityRetention) :
    Except CompensationRetentionRefusal
      (CompensationActivityRetention × CompletedCompensableActivity) :=
  if retention.records.any fun record => record.id == activity then
    .error .duplicateActivity
  else
    let record : CompletedCompensableActivity :=
      { id := activity, completionOrdinal := retention.nextCompletionOrdinal }
    let records := retention.records ++ [record]
    if records.length > declaration.maxRecords then
      .error (.capacity .records declaration.maxRecords records.length)
    else
      let observedBytes := canonicalCompensationRecordsUtf8Bytes records
      if observedBytes > declaration.maxCanonicalBytes then
        .error (.capacity .canonicalBytes declaration.maxCanonicalBytes observedBytes)
      else
        .ok
          ({ retention with
              nextCompletionOrdinal := retention.nextCompletionOrdinal + 1
              records }, record)

/-- Pure classifier and pre-mutation insertion. Every refusal carries the exact submitted state. -/
def retainCompletedCompensableActivity (program : Program)
    (owner : ScopeOccurrenceId) (facts : CompensationCompletionFacts)
    (state : RuntimeState) : CompensationRetentionResult :=
  match program.compensationActivityRetention with
  | none => .refused .declarationAbsent state
  | some declaration =>
      if !compensationActivityRetentionDeclarationValid program then
        .refused .invalidDeclaration state
      else if !compensationActivityRetentionStateValid program state then
        .refused .invalidState state
      else match retentionCandidate? facts with
        | none => .refused .malformedCompletion state
        | candidate =>
          let activity := facts.activity
          if activity.processInstanceId != owner.processInstanceId then
            .refused .wrongInstance state
          else if !declarationTargetsActivity declaration activity then
              .refused .targetAbsent state
          else match compensationActivityTargetFamily? program declaration
              ⟨activity.activityElementId.value⟩ with
            | none => .refused .targetAbsent state
            | some family =>
              if family != facts.operationFamily then
                .refused .malformedCompletion state
              else
                let selectedRetentions := state.compensationActivityRetentions.filter
                  (fun retention => retention.owner == owner)
                if selectedRetentions.any fun retention =>
                    retention.records.any fun record => record.id == activity then
                  .refused .duplicateActivity state
                else match candidate with
                | some none => .notRetained state
                | some (some activity) =>
                    match selectedRetentions with
                    | [retention] =>
                        match insertCompletedCompensableActivity declaration activity retention with
                        | .error reason => .refused reason state
                        | .ok (updated, record) =>
                            .retained
                              { state with compensationActivityRetentions :=
                                  (replaceRetentionRegister retention updated
                                    state.compensationActivityRetentions) }
                              record
                    | _ => .refused .registerAbsent state
                | none => .refused .malformedCompletion state

/-- Declarative selection of the same pure retention result. -/
inductive CompensationRetentionStep (program : Program) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before : RuntimeState) :
    RuntimeState → Prop where
  | retained (after : RuntimeState) (record : CompletedCompensableActivity)
      (selected : retainCompletedCompensableActivity program owner facts before =
        .retained after record) :
      CompensationRetentionStep program owner facts before after
  | notRetained
      (selected : retainCompletedCompensableActivity program owner facts before =
        .notRetained before) :
      CompensationRetentionStep program owner facts before before
  | refused (reason : CompensationRetentionRefusal)
      (selected : retainCompletedCompensableActivity program owner facts before =
        .refused reason before) :
      CompensationRetentionStep program owner facts before before

theorem retainCompletedCompensableActivity_sound
    (program : Program) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before after : RuntimeState)
    (record : CompletedCompensableActivity)
    (selected : retainCompletedCompensableActivity program owner facts before =
      .retained after record) :
    CompensationRetentionStep program owner facts before after :=
  .retained after record selected

/-- Every refused result preserves the complete submitted state by construction. -/
theorem retainCompletedCompensableActivity_refusal_preserves_state
    (program : Program) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before preserved : RuntimeState)
    (reason : CompensationRetentionRefusal)
    (selected : retainCompletedCompensableActivity program owner facts before =
      .refused reason preserved) :
    preserved = before := by
  cases facts <;>
    simp only [retainCompletedCompensableActivity, retentionCandidate?,
      CompensationCompletionFacts.activity, CompensationCompletionFacts.operationFamily] at selected
  all_goals repeat' split at selected
  all_goals
    repeat' split at selected
    all_goals simp_all

/-- Valid early and interrupted facts preserve the complete state without creating a record. -/
theorem retainCompletedCompensableActivity_nonretention_preserves_state
    (program : Program) (owner : ScopeOccurrenceId)
    (facts : CompensationCompletionFacts) (before preserved : RuntimeState)
    (selected : retainCompletedCompensableActivity program owner facts before =
      .notRetained preserved) :
    preserved = before := by
  cases facts <;>
    simp only [retainCompletedCompensableActivity, retentionCandidate?,
      CompensationCompletionFacts.activity, CompensationCompletionFacts.operationFamily] at selected
  all_goals repeat' split at selected
  all_goals
    repeat' split at selected
    all_goals simp_all

/-- Successful direct insertion appends one record at the prior ordinal and advances once. -/
theorem insertCompletedCompensableActivity_success_shape
    (declaration : CompensationActivityRetentionDeclaration)
    (activity : ActivityOccurrenceId) (before after : CompensationActivityRetention)
    (record : CompletedCompensableActivity)
    (inserted : insertCompletedCompensableActivity declaration activity before =
      .ok (after, record)) :
    record = { id := activity, completionOrdinal := before.nextCompletionOrdinal } ∧
      after.records = before.records ++ [record] ∧
      after.nextCompletionOrdinal = before.nextCompletionOrdinal + 1 := by
  unfold insertCompletedCompensableActivity at inserted
  split at inserted
  · simp at inserted
  · dsimp only at inserted
    split at inserted
    · simp at inserted
    · split at inserted
      · simp at inserted
      · simp only [Except.ok.injEq, Prod.mk.injEq] at inserted
        obtain ⟨rfl, rfl⟩ := inserted
        exact ⟨rfl, rfl, rfl⟩

/-- Representation-only issue for zero-item Multi-Instance entry: one fresh outer identity and no
inner occurrence are returned, while the outer high-water mark advances atomically. -/
structure ZeroItemOuterActivityIssue where
  activity : ActivityOccurrenceId
  successor : RuntimeState
  deriving Repr, DecidableEq

def issueZeroItemOuterActivity (state : RuntimeState) (instanceId : SemanticId)
    (activityElementId : TaskDefinitionId) : ZeroItemOuterActivityIssue :=
  let activation := activityActivationCount state activityElementId + 1
  { activity :=
      { processInstanceId := instanceId
        activityElementId := ⟨activityElementId.value⟩
        activation }
    successor :=
      { state with activityActivations :=
          setActivationCount state.activityActivations activityElementId activation } }

theorem issueZeroItemOuterActivity_has_fresh_outer_identity
    (state : RuntimeState) (instanceId : SemanticId)
    (activityElementId : TaskDefinitionId) :
    (issueZeroItemOuterActivity state instanceId activityElementId).activity.activation =
      activityActivationCount state activityElementId + 1 := rfl

theorem issueZeroItemOuterActivity_has_no_inner_wait
    (state : RuntimeState) (instanceId : SemanticId)
    (activityElementId : TaskDefinitionId) :
    (issueZeroItemOuterActivity state instanceId activityElementId).successor.waits =
      state.waits := rfl

end BpmnSemantics.SemanticProcess
