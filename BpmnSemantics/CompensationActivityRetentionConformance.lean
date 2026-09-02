import BpmnSemantics.SemanticProcess.CompensationActivityRetention
import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcessJson.CompensationActivityRetention

/-! # Compensation Activity retention checkpoint

Kernel-decided fixtures for the approved hidden boundary-handler retention representation. Producer
integration, source admission, handler execution, Temporal hosting, and public projection remain
outside this checkpoint.
-/

namespace BpmnSemantics.CompensationActivityRetentionConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson

def target : BoundaryCompensationTarget :=
  { activityElementId := ⟨"UserTask_Approve"⟩
    boundaryEventElementId := ⟨"BoundaryEvent_Compensate"⟩
    compensationActivityElementId := ⟨"ServiceTask_UndoApproval"⟩ }

def declarationFor (maxRecords maxCanonicalBytes : Nat) :
    CompensationActivityRetentionDeclaration :=
  { definitionScopeId := rootDefinitionScopeId sequentialProgram.processId
    targets := [target]
    maxRecords
    maxCanonicalBytes }

def retentionProgramFor (maxRecords maxCanonicalBytes : Nat) : Program :=
  { sequentialProgram with
    compensationActivityRetention := some (declarationFor maxRecords maxCanonicalBytes) }

def retentionProgram : Program := retentionProgramFor 4 65536
def instanceId : SemanticId := ⟨"retention-instance"⟩
def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId retentionProgram.processId

def activity (activation : Nat := 1) : ActivityOccurrenceId :=
  { processInstanceId := instanceId
    activityElementId := ⟨target.activityElementId.value⟩
    activation }

def ordinaryFacts : CompensationCompletionFacts := .ordinaryUserTask activity

def startState : RuntimeState :=
  (runningProgramStartState? retentionProgram instanceId []).getD initialState

def firstRecord : CompletedCompensableActivity :=
  { id := activity, completionOrdinal := 1 }

def firstRetention : CompensationActivityRetention :=
  { owner, nextCompletionOrdinal := 2, records := [firstRecord] }

def stateAfterFirst : RuntimeState :=
  { startState with compensationActivityRetentions := [firstRetention] }

def expectedFirstState : RuntimeState :=
  { startState with
    compensationActivityRetentions :=
      [{ owner, nextCompletionOrdinal := 2, records := [firstRecord] }] }

theorem aggregate_program_admission_includes_retention_declaration :
    programWellFormed retentionProgram = true := by decide +kernel

theorem declaration_and_running_register_are_valid :
    compensationActivityRetentionDeclarationValid retentionProgram = true ∧
      compensationActivityRetentionStateValid retentionProgram startState = true := by
  decide +kernel

theorem start_creates_exactly_one_root_register :
    (runningProgramStartState? retentionProgram instanceId []).map
        (·.compensationActivityRetentions) =
      some [{ owner, nextCompletionOrdinal := 1, records := [] }] := by
  decide +kernel

theorem declaration_absence_is_observationally_omitted :
    compensationActivityRetentionView? sequentialProgram initialState = none ∧
      initialState.compensationActivityRetentions = [] ∧
      ((runningProgramStartState? sequentialProgram instanceId []).map
        (·.compensationActivityRetentions)) = some [] := by
  decide +kernel

theorem handler_free_completion_is_refused_without_state_change :
    retainCompletedCompensableActivity sequentialProgram owner ordinaryFacts initialState =
      .refused .declarationAbsent initialState := by decide +kernel

def missingTargetActivity : ActivityOccurrenceId :=
  { activity with activityElementId := ⟨"UserTask_NotDeclared"⟩ }

theorem undeclared_target_is_refused_without_state_change :
    retainCompletedCompensableActivity retentionProgram owner
        (.ordinaryUserTask missingTargetActivity) startState =
      .refused .targetAbsent startState := by decide +kernel

def excludedOperationProgram : Program :=
  { retentionProgram with
    compensationActivityRetention := some
      { declarationFor 4 65536 with
        targets :=
          [{ activityElementId := ⟨"StartEvent_1"⟩
             boundaryEventElementId := ⟨"BoundaryEvent_Compensate"⟩
             compensationActivityElementId := ⟨"ServiceTask_UndoStart"⟩ }] } }

theorem excluded_operation_cannot_be_a_declared_target :
    compensationActivityRetentionDeclarationValid excludedOperationProgram = false := by
  decide +kernel

def withInvokeProcess : Program :=
  { retentionProgram with
    operations :=
      .invokeProcess ⟨"operation:ForbiddenInvoke"⟩ ⟨⟨"Call_Forbidden"⟩⟩
        ⟨"place:invoke-input"⟩ ⟨"Called_Process"⟩ ⟨"scope:called"⟩
        ⟨"place:called-entry"⟩ ⟨"operation:ForbiddenReturn"⟩ ::
        retentionProgram.operations }

def withReturnProcess : Program :=
  { retentionProgram with
    operations :=
      .returnProcess ⟨"operation:ForbiddenReturn"⟩ ⟨⟨"Call_Forbidden"⟩⟩
        ⟨"Called_Process"⟩ ⟨"scope:called"⟩ ⟨"place:return-output"⟩ ::
        retentionProgram.operations }

def withTerminateScope : Program :=
  { retentionProgram with
    operations :=
      .terminateScope ⟨"operation:ForbiddenTerminate"⟩ ⟨⟨"End_Terminate"⟩⟩
        ⟨"place:terminate-input"⟩ (rootDefinitionScopeId retentionProgram.processId) ::
        retentionProgram.operations }

def cancellationProfileProgram : Program :=
  { retentionProgram with
    identity :=
      { retentionProgram.identity with
        semanticProfile := serviceTaskIncidentCancellationCheckpointProfileId } }

theorem forbidden_lifecycle_and_cancellation_profile_are_rejected :
    compensationActivityRetentionDeclarationValid withInvokeProcess = false ∧
      compensationActivityRetentionDeclarationValid withReturnProcess = false ∧
      compensationActivityRetentionDeclarationValid withTerminateScope = false ∧
      compensationActivityRetentionDeclarationValid cancellationProfileProgram = false := by
  decide +kernel

def emptyMultiInstanceData : SequentialMultiInstanceDataDefinition :=
  { input :=
      { collectionItemDefinitionId := "collection-item"
        scalarItemDefinitionId := "scalar-item"
        dataObjectId := "input-object"
        dataObjectReferenceId := "input-reference"
        loopDataInputId := "loop-input"
        inputDataItemId := "input-item"
        taskDataInputId := "task-input"
        collectionAssociationId := "collection-input-association"
        itemAssociationId := "item-input-association" }
    output :=
      { dataObjectId := "output-object"
        dataObjectReferenceId := "output-reference"
        taskDataOutputId := "task-output"
        outputDataItemId := "output-item"
        loopDataOutputId := "loop-output"
        itemAssociationId := "item-output-association"
        collectionAssociationId := "collection-output-association" } }

def asSequentialMultiInstance : SemanticOperation → SemanticOperation
  | .awaitUserTask id origin input output task =>
      .awaitSequentialMultiInstanceUserTask id origin input
        { id := task.id, name := task.name } emptyMultiInstanceData output
        { elementId := ⟨"Boundary_Timer"⟩
          durationMs := 1000
          output := ⟨"place:timer-output"⟩
          origin := ⟨⟨"Flow_Timer"⟩⟩ }
        { maximumItems := 16
          maximumItemUtf8Bytes := 512
          maximumCanonicalCollectionUtf8Bytes := 8192 }
  | operation => operation

def multiInstanceProgram : Program :=
  { retentionProgram with operations := retentionProgram.operations.map asSequentialMultiInstance }

def asParallelMultiInstance : SemanticOperation → SemanticOperation
  | .awaitUserTask id origin input output task =>
      .awaitParallelMultiInstanceUserTask id origin input task.id task.name
        emptyMultiInstanceData output
        { elementId := ⟨"Boundary_Timer"⟩
          durationMs := 1000
          output := ⟨"place:timer-output"⟩
          origin := ⟨⟨"Flow_Timer"⟩⟩ }
        (.stringEquals "completionPolicy" "all")
        { maximumItems := 16
          maximumItemUtf8Bytes := 512
          maximumCanonicalCollectionUtf8Bytes := 8192 }
  | operation => operation

def parallelMultiInstanceProgram : Program :=
  { retentionProgram with operations := retentionProgram.operations.map asParallelMultiInstance }

def multiInstanceStartState : RuntimeState :=
  (runningProgramStartState? multiInstanceProgram instanceId []).getD initialState

def miFacts (planned successful : Nat) (outcome : CompensationMultiInstanceOutcome) :
    CompensationCompletionFacts :=
  .multiInstanceUserTask activity planned successful outcome

theorem multi_instance_declaration_selects_exact_operation_family :
    compensationActivityRetentionDeclarationValid multiInstanceProgram = true ∧
      compensationActivityTargetFamily? multiInstanceProgram (declarationFor 4 65536)
        target.activityElementId = some .multiInstanceUserTask ∧
      compensationActivityRetentionDeclarationValid parallelMultiInstanceProgram = true ∧
      compensationActivityTargetFamily? parallelMultiInstanceProgram (declarationFor 4 65536)
        target.activityElementId = some .multiInstanceUserTask := by
  decide +kernel

theorem zero_one_and_many_all_success_are_eligible :
    multiInstanceCompletionEligible (miFacts 0 0 .allSuccessfulCompletion) = true ∧
      multiInstanceCompletionEligible (miFacts 1 1 .allSuccessfulCompletion) = true ∧
      multiInstanceCompletionEligible (miFacts 3 3 .allSuccessfulCompletion) = true := by
  decide +kernel

theorem early_and_interrupted_completion_are_not_retained :
    retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 1 .earlyCompletion) multiInstanceStartState =
          .notRetained multiInstanceStartState ∧
      retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 1 .interrupted) multiInstanceStartState =
          .notRetained multiInstanceStartState := by
  decide +kernel

theorem malformed_multi_instance_counts_are_refused :
    retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 2 .allSuccessfulCompletion) multiInstanceStartState =
          .refused .malformedCompletion multiInstanceStartState ∧
      retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 3 .earlyCompletion) multiInstanceStartState =
          .refused .malformedCompletion multiInstanceStartState ∧
      retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 2 3 .interrupted) multiInstanceStartState =
          .refused .malformedCompletion multiInstanceStartState := by
  decide +kernel

theorem completion_fact_family_must_match_exact_operation :
    retainCompletedCompensableActivity multiInstanceProgram owner ordinaryFacts
        multiInstanceStartState = .refused .malformedCompletion multiInstanceStartState ∧
      retainCompletedCompensableActivity retentionProgram owner
        (miFacts 1 1 .allSuccessfulCompletion) startState =
          .refused .malformedCompletion startState := by
  decide +kernel

def wrongInstanceActivity : ActivityOccurrenceId :=
  { activity with processInstanceId := ⟨"another-instance"⟩ }

theorem completion_fact_instance_must_match_register_owner :
    retainCompletedCompensableActivity retentionProgram owner
        (.ordinaryUserTask wrongInstanceActivity) startState =
      .refused .wrongInstance startState := by decide +kernel

theorem successful_insertion_uses_prior_ordinal_and_preserves_state :
    retainCompletedCompensableActivity retentionProgram owner ordinaryFacts startState =
      .retained expectedFirstState firstRecord := by decide +kernel

theorem duplicate_identity_is_refused_without_state_change :
    retainCompletedCompensableActivity retentionProgram owner ordinaryFacts stateAfterFirst =
      .refused .duplicateActivity stateAfterFirst := by decide +kernel

def multiInstanceStateAfterFirst : RuntimeState :=
  { multiInstanceStartState with compensationActivityRetentions := [firstRetention] }

theorem duplicate_identity_is_refused_before_early_or_interrupted_classification :
    retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 1 .earlyCompletion) multiInstanceStateAfterFirst =
          .refused .duplicateActivity multiInstanceStateAfterFirst ∧
      retainCompletedCompensableActivity multiInstanceProgram owner
        (miFacts 3 1 .interrupted) multiInstanceStateAfterFirst =
          .refused .duplicateActivity multiInstanceStateAfterFirst := by
  decide +kernel

def secondActivity : ActivityOccurrenceId := activity 2

def insertionAcceptedAs
    (result : Except CompensationRetentionRefusal
      (CompensationActivityRetention × CompletedCompensableActivity))
    (expectedRetention : CompensationActivityRetention)
    (expectedRecord : CompletedCompensableActivity) : Bool :=
  match result with
  | .ok (retention, record) =>
      decide (retention = expectedRetention ∧ record = expectedRecord)
  | .error _ => false

def insertionRefusedAs
    (result : Except CompensationRetentionRefusal
      (CompensationActivityRetention × CompletedCompensableActivity))
    (expected : CompensationRetentionRefusal) : Bool :=
  match result with
  | .error actual => decide (actual = expected)
  | .ok _ => false

theorem count_capacity_accepts_exact_fit_and_refuses_one_over :
    insertionAcceptedAs
        (insertCompletedCompensableActivity (declarationFor 1 65536) activity
          { owner, nextCompletionOrdinal := 1, records := [] })
        { owner, nextCompletionOrdinal := 2, records := [firstRecord] } firstRecord = true ∧
      insertionRefusedAs
        (insertCompletedCompensableActivity (declarationFor 1 65536)
          secondActivity firstRetention)
        (.capacity .records 1 2) = true := by
  decide +kernel

def escapedRecord : CompletedCompensableActivity :=
  { id :=
      { processInstanceId := ⟨"instance-\"-\\-é"⟩
        activityElementId := ⟨"activity-\n-"⟩
        activation := 1 }
    completionOrdinal := 1 }

def escapedCanonicalBytes : Nat := canonicalCompensationRecordsUtf8Bytes [escapedRecord]

theorem escaped_non_ascii_identity_uses_canonical_json_bytes :
    escapedCanonicalBytes >
      escapedRecord.id.processInstanceId.value.utf8ByteSize +
        escapedRecord.id.activityElementId.value.utf8ByteSize := by decide +kernel

theorem canonical_byte_capacity_accepts_exact_fit_and_refuses_one_under :
    insertionAcceptedAs
        (insertCompletedCompensableActivity (declarationFor 1 escapedCanonicalBytes)
          escapedRecord.id { owner, nextCompletionOrdinal := 1, records := [] })
        { owner, nextCompletionOrdinal := 2, records := [escapedRecord] } escapedRecord = true ∧
      insertionRefusedAs
        (insertCompletedCompensableActivity
          (declarationFor 1 (escapedCanonicalBytes - 1)) escapedRecord.id
          { owner, nextCompletionOrdinal := 1, records := [] })
        (.capacity .canonicalBytes (escapedCanonicalBytes - 1)
          escapedCanonicalBytes) = true := by
  decide +kernel

def extraRegisterState : RuntimeState :=
  { startState with
    compensationActivityRetentions :=
      startState.compensationActivityRetentions ++
        [{ owner := { owner with activation := 2 }, nextCompletionOrdinal := 1,
           records := [] }] }

def consumedPrefixState : RuntimeState :=
  { startState with
    compensationActivityRetentions :=
      [{ owner, nextCompletionOrdinal := 3,
         records := [{ id := activity, completionOrdinal := 2 }] }] }

def nextAfterConsumedPrefix : CompletedCompensableActivity :=
  { id := activity 2, completionOrdinal := 3 }

def stateAfterConsumedPrefixInsertion : RuntimeState :=
  { startState with
    compensationActivityRetentions :=
      [{ owner, nextCompletionOrdinal := 4,
         records :=
          [{ id := activity, completionOrdinal := 2 }, nextAfterConsumedPrefix] }] }

theorem malformed_extra_register_is_refused_while_consumed_prefix_remains_appendable :
    retainCompletedCompensableActivity retentionProgram owner ordinaryFacts extraRegisterState =
        .refused .invalidState extraRegisterState ∧
      retainCompletedCompensableActivity retentionProgram owner
          (.ordinaryUserTask (activity 2)) consumedPrefixState =
        .retained stateAfterConsumedPrefixInsertion nextAfterConsumedPrefix := by
  decide +kernel

def unrelatedOwner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"unrelated-instance"⟩
    definitionScopeId := ⟨"scope:unrelated"⟩
    activation := 1 }

def unrelatedRetention : CompensationActivityRetention :=
  { owner := unrelatedOwner, nextCompletionOrdinal := 1, records := [] }

def rootCloseBefore : RuntimeState :=
  { startState with
    initiationPending := false
    compensationActivityRetentions :=
      [{ owner, nextCompletionOrdinal := 1, records := [] }, unrelatedRetention] }

def rootCloseAfter : RuntimeState :=
  { rootCloseBefore with
    control := .completed instanceId
    scopeOccurrences := []
    compensationActivityRetentions := [unrelatedRetention] }

theorem root_close_removes_only_the_exact_matching_register :
    completeScopeState? rootCloseBefore owner.definitionScopeId none = some rootCloseAfter := by
  decide +kernel

def childOwner : ScopeOccurrenceId :=
  { processInstanceId := instanceId
    definitionScopeId := ⟨"scope:child"⟩
    activation := 1 }

def childOutput : ControlPlaceId := ⟨"place:child-output"⟩

def childCloseBefore : RuntimeState :=
  { startState with
    initiationPending := false
    scopeOccurrences :=
      [{ id := owner, parent := none }, { id := childOwner, parent := some owner }] }

def childCloseAfter : RuntimeState :=
  { childCloseBefore with
    tokens := [{ placeId := childOutput, owner }]
    scopeOccurrences := [{ id := owner, parent := none }] }

theorem child_close_preserves_the_root_retention_register :
    completeScopeState? childCloseBefore childOwner.definitionScopeId (some childOutput) =
      some childCloseAfter ∧
      childCloseAfter.compensationActivityRetentions =
        childCloseBefore.compensationActivityRetentions := by
  decide +kernel

def zeroIssueBefore : RuntimeState :=
  { startState with activityActivations := [{ taskId := ⟨target.activityElementId.value⟩, count := 2 }] }

def zeroIssue : ZeroItemOuterActivityIssue :=
  issueZeroItemOuterActivity zeroIssueBefore instanceId ⟨target.activityElementId.value⟩

theorem zero_item_entry_issues_one_outer_identity_without_inner_wait :
    zeroIssue.activity = activity 3 ∧
      activityActivationCount zeroIssue.successor ⟨target.activityElementId.value⟩ = 3 ∧
      zeroIssue.successor.waits = zeroIssueBefore.waits ∧
      zeroIssue.successor.activityOccurrences = zeroIssueBefore.activityOccurrences := by
  decide +kernel

def decodeAcceptedAs (json : Lean.Json)
    (expected : Option CompensationActivityRetentionDeclaration) : Bool :=
  match decodeCompensationActivityRetentionField json with
  | .ok actual => decide (actual = expected)
  | .error _ => false

def decodeRejected (json : Lean.Json) : Bool :=
  match decodeCompensationActivityRetentionField json with
  | .error _ => true
  | .ok _ => false

def targetJson (activityElementId : String := target.activityElementId.value) : Lean.Json :=
  Lean.Json.mkObj
    [ ("activityElementId", .str activityElementId)
    , ("boundaryEventElementId", .str target.boundaryEventElementId.value)
    , ("compensationActivityElementId", .str target.compensationActivityElementId.value) ]

def declarationJson (maxRecords maxCanonicalBytes : Nat)
    (targets : Array Lean.Json := #[targetJson]) : Lean.Json :=
  Lean.Json.mkObj
    [("compensationActivityRetention",
      Lean.Json.mkObj
        [ ("definitionScopeId", .str (rootDefinitionScopeId sequentialProgram.processId).value)
        , ("limits", Lean.Json.mkObj
            [("maxCanonicalBytes", .num maxCanonicalBytes),
             ("maxRecords", .num maxRecords)])
        , ("targets", .arr targets) ])]

theorem strict_decoder_preserves_omission_and_presence :
    decodeAcceptedAs (Lean.Json.mkObj []) none = true ∧
      decodeAcceptedAs (declarationJson 4 65536) (some (declarationFor 4 65536)) = true := by
  decide +kernel

theorem strict_decoder_rejects_malformed_limits_and_targets :
    decodeRejected (declarationJson 0 65536 #[targetJson]) = true ∧
      decodeRejected (declarationJson 4 1 #[targetJson]) = true ∧
      decodeRejected (declarationJson 4 65536 #[]) = true ∧
      decodeRejected (declarationJson 4 65536 #[targetJson ""]) = true := by
  decide +kernel

end BpmnSemantics.CompensationActivityRetentionConformance
