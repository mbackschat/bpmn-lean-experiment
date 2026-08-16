import BpmnSemantics.SemanticProcess.Execution
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.StrictJson

/-! # Structured Human Work semantic conformance

This module proves the generic non-negative integer, ordered String-list, atomic completion-patch,
and assignment-only passive metadata account selected by the structured Human Work profile. Product
2 forms, actions, validation, Rendering contents, and catalog projection remain outside this module.
-/

namespace BpmnSemantics.StructuredHumanWorkConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson

def assignmentOnlyMetadata : UserTaskMetadata :=
  { assignment :=
      { candidates := [{ kind := .group, id := "reviewers" }] }
    form := none }

def existingBindings : List VariableBinding :=
  [ { name := "approvedAmount", value := .integer 10 }
  , { name := "untouched", value := .string "kept" } ]

def mixedCompletionPatch : List VariableBinding :=
  [ { name := "approvedAmount", value := .integer 4250 }
  , { name := "resolution", value := .string "approved" }
  , { name := "riskFlags", value := .stringList ["policy", "policy"] } ]

def processId : ProcessId := ⟨"Process_ExpenseExceptionReview"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := structuredHumanWorkProfileId
        sourceId := ⟨"expense-exception-review"⟩
        sourceSha256 :=
          "a904b67218ae2a72e4e48ae93a6a14350ac55b1ca5f63e5ddcb55e3c1c8c734e" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"End_Aborted"⟩, ⟨"End_Approved"⟩, ⟨"End_ChangesRequested"⟩
      , ⟨"Resolution"⟩, ⟨"ReviewException"⟩, ⟨"Start_ExpenseException"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_Aborted"⟩, ⟨"Flow_Approved"⟩, ⟨"Flow_ChangesRequested"⟩
      , ⟨"Flow_ReviewToResolution"⟩, ⟨"Flow_StartToReview"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"End_Aborted"⟩
      , .noneEndEvent ⟨"End_Approved"⟩
      , .noneEndEvent ⟨"End_ChangesRequested"⟩
      , .exclusiveGateway ⟨"Resolution"⟩
          [⟨"Flow_Approved"⟩, ⟨"Flow_ChangesRequested"⟩] ⟨"Flow_Aborted"⟩
      , .userTask ⟨"ReviewException"⟩ (some "Review exception")
          (some assignmentOnlyMetadata)
      , .noneStartEvent ⟨"Start_ExpenseException"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Aborted"⟩
          sourceId := ⟨"Resolution"⟩, targetId := ⟨"End_Aborted"⟩ }
      , { id := ⟨"Flow_Approved"⟩
          sourceId := ⟨"Resolution"⟩, targetId := ⟨"End_Approved"⟩
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(resolution,\"approved\")" } }
      , { id := ⟨"Flow_ChangesRequested"⟩
          sourceId := ⟨"Resolution"⟩, targetId := ⟨"End_ChangesRequested"⟩
          condition := some
            { language := simpleBooleanExpressionLanguage
              body := "stringEquals(resolution,\"changes-requested\")" } }
      , { id := ⟨"Flow_ReviewToResolution"⟩
          sourceId := ⟨"ReviewException"⟩, targetId := ⟨"Resolution"⟩ }
      , { id := ⟨"Flow_StartToReview"⟩
          sourceId := ⟨"Start_ExpenseException"⟩, targetId := ⟨"ReviewException"⟩ } ] }

def executionOperations : List SemanticOperation :=
  [ .reachNoneEnd ⟨"operation:End_Aborted"⟩
      { elementId := ⟨"End_Aborted"⟩ } ⟨"place:Flow_Aborted"⟩
  , .reachNoneEnd ⟨"operation:End_Approved"⟩
      { elementId := ⟨"End_Approved"⟩ } ⟨"place:Flow_Approved"⟩
  , .reachNoneEnd ⟨"operation:End_ChangesRequested"⟩
      { elementId := ⟨"End_ChangesRequested"⟩ } ⟨"place:Flow_ChangesRequested"⟩
  , .choose ⟨"operation:Resolution"⟩ { elementId := ⟨"Resolution"⟩ }
      ⟨"place:Flow_ReviewToResolution"⟩
      [ { condition := .stringEquals "resolution" "approved"
          output := ⟨"place:Flow_Approved"⟩
          origin := { elementId := ⟨"Flow_Approved"⟩ } }
      , { condition := .stringEquals "resolution" "changes-requested"
          output := ⟨"place:Flow_ChangesRequested"⟩
          origin := { elementId := ⟨"Flow_ChangesRequested"⟩ } } ]
      ⟨"place:Flow_Aborted"⟩ { elementId := ⟨"Flow_Aborted"⟩ }
  , .awaitUserTask ⟨"operation:ReviewException"⟩
      { elementId := ⟨"ReviewException"⟩ }
      ⟨"place:Flow_StartToReview"⟩ ⟨"place:Flow_ReviewToResolution"⟩
      { id := ⟨"ReviewException"⟩
        name := some "Review exception"
        metadata := some assignmentOnlyMetadata }
  , .initiate ⟨"operation:Start_ExpenseException"⟩
      { elementId := ⟨"Start_ExpenseException"⟩ } ⟨"place:Flow_StartToReview"⟩
  , .completeScope
      ⟨"operation:complete-scope:scope:Process_ExpenseExceptionReview"⟩
      { elementId := ⟨"Process_ExpenseExceptionReview"⟩ }
      (rootDefinitionScopeId processId) none ]

/-- Independently authored executable account for the exact M6 control and data semantics. -/
def executionProgram : Program :=
  let scopeId := rootDefinitionScopeId processId
  let flowIds : List SequenceFlowId :=
    [ ⟨"Flow_Aborted"⟩, ⟨"Flow_Approved"⟩, ⟨"Flow_ChangesRequested"⟩
    , ⟨"Flow_ReviewToResolution"⟩, ⟨"Flow_StartToReview"⟩ ]
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := structuredHumanWorkProfileId
        sourceId := ⟨"expense-exception-review"⟩
        sourceSha256 :=
          "a904b67218ae2a72e4e48ae93a6a14350ac55b1ca5f63e5ddcb55e3c1c8c734e" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    operationScopes := executionOperations.map fun operation =>
      { operationId := operation.id, scopeId }
    controlPlaceScopes := flowIds.map fun flowId =>
      { controlPlaceId := ⟨"place:" ++ flowId.value⟩, scopeId }
    controlPlaces := flowIds.map fun flowId =>
      { id := ⟨"place:" ++ flowId.value⟩, origin := { elementId := flowId } }
    operations := executionOperations }

def checkedProcessWithFirstCondition (body : String) : CheckedProcess :=
  { checkedProcess with
    sequenceFlows := checkedProcess.sequenceFlows.map fun flow =>
      if flow.id = ⟨"Flow_Approved"⟩ then
        { flow with
          condition := some
            { language := simpleBooleanExpressionLanguage, body } }
      else
        flow }

def executionProgramWithFirstCondition
    (condition : SimpleBooleanExpression) : Program :=
  { executionProgram with
    operations := executionProgram.operations.map fun operation =>
      match operation with
      | .choose id origin input (first :: rest) fallback fallbackOrigin =>
          .choose id origin input ({ first with condition } :: rest)
            fallback fallbackOrigin
      | other => other }

def instanceId : SemanticId := ⟨"ExpenseExceptionApprove_1"⟩

def startStimulus : Stimulus :=
  .startProcess ⟨"start-expense-exception-review"⟩
    ⟨processId.value⟩ instanceId []

def startedResult : StimulusResult :=
  applyStimulus scenarioClosureLimit executionProgram initialState startStimulus

def exactTaskInstanceId : UserTaskInstanceId :=
  { processInstanceId := instanceId
    elementId := ⟨"ReviewException"⟩
    activation := 1 }

def exactWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootScopeOccurrenceId instanceId processId
    task :=
      { id := ⟨"ReviewException"⟩
        name := some "Review exception"
        metadata := some assignmentOnlyMetadata }
    activation := 1
    output := ⟨"place:Flow_ReviewToResolution"⟩
    metadata := some assignmentOnlyMetadata }

def waitingState : RuntimeState := singletonWaitingState exactWait

def completionStimulus : Stimulus :=
  .completeUserTaskInstance ⟨"complete-expense-exception-approve"⟩
    exactTaskInstanceId mixedCompletionPatch

def completedWaitState : RuntimeState :=
  { waitingState with
    waits := []
    tokens :=
      [rootToken instanceId processId ⟨"place:Flow_ReviewToResolution"⟩] }

def admittedCompletionState : RuntimeState :=
  { completedWaitState with
    variables :=
      { completedWaitState.variables with
        process := { bindings := mixedCompletionPatch } } }

def completedState : RuntimeState :=
  { admittedCompletionState with
    control := .completed instanceId
    scopeOccurrences := []
    tokens := []
    endOccurrences := 1 }

def completionClosureChoices : List OperationId :=
  [ ⟨"operation:Resolution"⟩
  , ⟨"operation:End_Approved"⟩
  , ⟨"operation:complete-scope:scope:Process_ExpenseExceptionReview"⟩ ]

private def metadataFormPhysicallyAbsent (metadata : UserTaskMetadata) : Bool :=
  match optionalField (encodeUserTaskMetadata metadata) "form" with
  | .ok none => true
  | _ => false

/-- Integer admission retains the exact safe upper bound and refuses the next natural number. -/
theorem nonnegative_safe_integer_boundary_is_exact :
    variableValueAdmitted structuredHumanWorkProfileId .userTaskCompletion
        (.integer 9007199254740991) = true ∧
      variableValueAdmitted structuredHumanWorkProfileId .userTaskCompletion
        (.integer 9007199254740992) = false := by
  decide +kernel

/-- The new values are admitted only at the selected User Task completion surface. -/
theorem new_values_are_closed_to_profile_and_surface :
    processDataBindingsAdmitted structuredHumanWorkProfileId .processStart
        mixedCompletionPatch = false ∧
      processDataBindingsAdmitted booleanProcessDataCheckpointProfileId
        .userTaskCompletion mixedCompletionPatch = false := by
  decide +kernel

/-- A structurally and byte-valid ordered string list is admitted at the selected completion surface. -/
theorem well_formed_string_list_is_admitted_at_m6_completion
    (values : List String)
    (wellFormed : variableValueWellFormed (.stringList values) = true) :
    variableValueAdmitted structuredHumanWorkProfileId .userTaskCompletion
      (.stringList values) = true := by
  simp [variableValueAdmitted, wellFormed]

/-- String lists use ordinary ordered, multiplicity-sensitive structural equality. -/
theorem string_list_order_and_multiplicity_are_semantic :
    VariableValue.stringList ["a", "b"] ≠ .stringList ["b", "a"] ∧
      VariableValue.stringList ["a", "a"] ≠ .stringList ["a"] := by
  decide +kernel

/-- The generic list value exposes the exact member-count, member-byte, and canonical-byte conjunction. -/
theorem string_list_wire_bounds_are_exact (values : List String) :
    variableValueWellFormed (.stringList values) =
      (values.length ≤ 32 &&
        values.all (fun value => value.toUTF8.size ≤ 1024) &&
        (encodeVariableValue (.stringList values)).compress.toUTF8.size ≤ 16384) := by
  rfl

/-- Member-count overflow is rejected before member or canonical-byte evaluation. -/
theorem string_list_member_count_overflow_is_rejected (values : List String)
    (overflow : 32 < values.length) :
    variableValueWellFormed (.stringList values) = false := by
  simp [variableValueWellFormed, Nat.not_le.mpr overflow]

/-- A member-byte overflow rejects the complete ordered list. -/
theorem string_list_member_byte_overflow_is_rejected (values : List String)
    (overflow : values.all (fun value => value.toUTF8.size ≤ 1024) = false) :
    variableValueWellFormed (.stringList values) = false := by
  change
    ((decide (values.length ≤ 32) &&
        values.all (fun value => decide (value.toUTF8.size ≤ 1024))) &&
      decide ((encodeVariableValue (.stringList values)).compress.toUTF8.size ≤ 16384)) = false
  rw [overflow]
  simp

/-- A canonical-byte overflow rejects the complete ordered list. -/
theorem string_list_canonical_byte_overflow_is_rejected (values : List String)
    (overflow :
      decide ((encodeVariableValue (.stringList values)).compress.toUTF8.size ≤ 16384) = false) :
    variableValueWellFormed (.stringList values) = false := by
  change
    ((decide (values.length ≤ 32) &&
        values.all (fun value => decide (value.toUTF8.size ≤ 1024))) &&
      decide ((encodeVariableValue (.stringList values)).compress.toUTF8.size ≤ 16384)) = false
  rw [overflow]
  simp

/-- The generic merge replaces equal keys atomically and retains unrelated bindings. -/
theorem mixed_patch_replaces_and_preserves_unrelated_bindings :
    mergeProcessVariableBindings existingBindings mixedCompletionPatch =
      [ { name := "approvedAmount", value := .integer 4250 }
      , { name := "resolution", value := .string "approved" }
      , { name := "riskFlags", value := .stringList ["policy", "policy"] }
      , { name := "untouched", value := .string "kept" } ] := by
  decide +kernel

/-- Assignment-only metadata is exact and physically omits the legacy form member on the wire. -/
theorem assignment_only_metadata_is_exact_and_formless :
    UserTaskMetadata.assignmentOnlyWellFormed assignmentOnlyMetadata = true ∧
      metadataFormPhysicallyAbsent assignmentOnlyMetadata = true := by
  decide +kernel

/-- The exact checked graph and independent executable account retain the selected control topology. -/
theorem exact_structured_human_work_topology_is_preserved :
    structuredHumanWorkCheckedTopologyValid checkedProcess = true ∧
      structuredHumanWorkProgramTopologyValid executionProgram = true ∧
      executionProgram.identity.semanticProfile = checkedProcess.identity.semanticProfile := by
  decide +kernel

/-- Literal, presence, and null checks stay outside the M6 String-equality subprofile. -/
theorem non_string_equality_conditions_are_rejected :
    ["true", "isPresent(resolution)", "isNull(resolution)"].all
        (fun body =>
          structuredHumanWorkCheckedTopologyValid
            (checkedProcessWithFirstCondition body) = false) = true ∧
      [ SimpleBooleanExpression.literal true
      , .isPresent "resolution"
      , .isNull "resolution" ].all
        (fun condition =>
          structuredHumanWorkProgramTopologyValid
            (executionProgramWithFirstCondition condition) = false) = true := by
  decide +kernel

/-- Activation publishes the exact assignment-only candidate metadata without a form arm. -/
theorem activation_preserves_exact_assignment_only_metadata :
    startedResult =
        { outcome := .committed
          state := waitingState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      waitingState.waits.map (fun wait => wait.task.metadata) =
        [some assignmentOnlyMetadata] := by
  decide +kernel

/-- Matching the complete occurrence identity removes exactly that wait and publishes its continuation token. -/
theorem exact_task_wait_completion_produces_successor :
    completeUserTask waitingState exactTaskInstanceId.processInstanceId
        ⟨exactTaskInstanceId.elementId.value⟩ exactTaskInstanceId.activation =
      some completedWaitState := by
  decide +kernel

/-- After admitted atomic data replacement, the exact three internal operations select one branch and complete. -/
theorem admitted_mixed_completion_closes_one_branch :
    runChoices executionProgram admittedCompletionState completionClosureChoices =
        some completedState ∧
      completedState.variables.process.bindings = mixedCompletionPatch ∧
      completedState.control = .completed instanceId := by
  decide +kernel

/-- An invalid M6 value rejects before merge and preserves the complete waiting state. -/
theorem oversized_integer_completion_preserves_complete_state :
    applyStimulus scenarioClosureLimit executionProgram waitingState
        (.completeUserTaskInstance ⟨"invalid-integer"⟩ exactTaskInstanceId
          [{ name := "approvedAmount", value := .integer 9007199254740992 }]) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Full occurrence identity is checked independently of the newly admitted value arms. -/
theorem wrong_occurrence_mixed_completion_preserves_complete_state :
    applyStimulus scenarioClosureLimit executionProgram waitingState
        (.completeUserTaskInstance ⟨"wrong-occurrence"⟩
          { exactTaskInstanceId with activation := 2 } mixedCompletionPatch) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

def mappedOutput : List VariableMapping :=
  [{ target := "approvedAmount", expression := .localVariable "result" }]

/-- Effect mapping remains closed to both new generic User Task completion values. -/
theorem new_values_are_rejected_on_every_effect_result_route :
    applyEffectResult [] mappedOutput []
        (.success [{ name := "result", value := .integer 1 }]) = none ∧
      applyEffectResult [] mappedOutput []
        (.bpmnError "E" none
          [{ name := "result", value := .stringList ["policy"] }]) = none := by
  decide +kernel

/-- Simple Boolean conditions remain total but do not reinterpret integer or list operands. -/
theorem new_values_are_not_condition_operands :
    evaluateSimpleBooleanExpression (.isNull "value")
        [{ name := "value", value := .integer 1 }] = some false ∧
      evaluateSimpleBooleanExpression (.stringEquals "value" "policy")
        [{ name := "value", value := .stringList ["policy"] }] = some false := by
  decide +kernel

end BpmnSemantics.StructuredHumanWorkConformance
