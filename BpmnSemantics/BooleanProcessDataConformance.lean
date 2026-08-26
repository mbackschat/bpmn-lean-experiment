import BpmnSemantics.SequentialUserTask
import BpmnSemantics.SemanticProcess.JsonSupport

/-! # Boolean Process-data conformance

This module proves the Boolean value-domain extension at the exact Process Start, User Task completion, effect-result, expression, closure, and public-projection boundaries selected by its semantic profile.
-/

namespace BpmnSemantics.BooleanProcessDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

def checkpointProgram : Program :=
  { SequentialUserTask.program with
    identity :=
      { SequentialUserTask.program.identity with
        semanticProfile := booleanProcessDataCheckpointProfileId } }

def waitingBindings : List VariableBinding :=
  [ { name := "decision", value := .string "pending" }
  , { name := "untouched", value := .string "kept" } ]

def waitingState : RuntimeState :=
  { SequentialUserTask.afterStartState with
    variables :=
      { SequentialUserTask.afterStartState.variables with
        process := { bindings := waitingBindings } } }

def submittedBinding (value : VariableValue) : VariableBinding :=
  { name := "decision", value }

def completionStimulus (value : VariableValue) : Stimulus :=
  .completeUserTaskInstance ⟨"complete-boolean"⟩
    SequentialUserTask.exactTaskInstanceId [submittedBinding value]

def expectedBindings (value : VariableValue) : List VariableBinding :=
  [ submittedBinding value
  , { name := "untouched", value := .string "kept" } ]

def expectedCompletedState (value : VariableValue) : RuntimeState :=
  { SequentialUserTask.completedState with
    variables :=
      { SequentialUserTask.completedState.variables with
        process := { bindings := expectedBindings value } } }

def oldProfileBooleanRefusal : StimulusResult :=
  applyStimulus scenarioClosureLimit SequentialUserTask.program waitingState
    (completionStimulus (.boolean true))

def validOldProfileCompletion : Stimulus :=
  .completeUserTaskInstance ⟨"complete-after-refusal"⟩
    SequentialUserTask.exactTaskInstanceId
    [submittedBinding (.string "approved")]

/-- The Boolean Process-data checkpoint distinguishes the two Boolean values in the shared semantic domain. -/
theorem boolean_values_are_distinct :
    VariableValue.boolean true ≠ VariableValue.boolean false := by
  decide +kernel

/-- The checkpoint profile is admitted for the existing exact one-Start, one-User-Task, one-End Semantic Process shape. -/
theorem checkpoint_program_profile_is_admitted :
    programProfileCapabilitiesValid checkpointProgram = true := by
  decide +kernel

/-- Process Start remains string/null-only even under the Boolean completion profile. -/
theorem checkpoint_boolean_process_start_is_rejected :
    applyStimulus scenarioClosureLimit checkpointProgram initialState
        (.startProcess ⟨"boolean-start"⟩
          ⟨checkpointProgram.processId.value⟩ ⟨"Instance_Boolean"⟩
          [{ name := "decision", value := .boolean true }]) =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The selected completion profile commits Boolean true as a Boolean Process binding. -/
theorem boolean_true_completion_commits_distinct_value :
    applyStimulus scenarioClosureLimit checkpointProgram waitingState
        (completionStimulus (.boolean true)) =
      { outcome := .committed
        state := expectedCompletedState (.boolean true)
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The selected completion profile commits Boolean false as a Boolean Process binding. -/
theorem boolean_false_completion_commits_distinct_value :
    applyStimulus scenarioClosureLimit checkpointProgram waitingState
        (completionStimulus (.boolean false)) =
      { outcome := .committed
        state := expectedCompletedState (.boolean false)
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- Process-scope replacement is value-parametric and therefore cannot coerce a submitted Boolean while merging. -/
theorem process_scope_merge_preserves_submitted_value
    (value : VariableValue) :
    mergeProcessVariableBindings [] [submittedBinding value] =
      [submittedBinding value] := by
  rfl

/-- The prior sequential User Task profile refuses Boolean completion data with exact state preservation. -/
theorem old_profile_boolean_refusal_preserves_exact_state :
    oldProfileBooleanRefusal =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The state preserved by an old-profile Boolean refusal still admits its original string/null completion domain. -/
theorem valid_completion_commits_after_old_profile_refusal :
    applyStimulus scenarioClosureLimit SequentialUserTask.program
        oldProfileBooleanRefusal.state validOldProfileCompletion =
      { outcome := .committed
        state := expectedCompletedState (.string "approved")
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  rw [show oldProfileBooleanRefusal.state = waitingState by
    rw [old_profile_boolean_refusal_preserves_exact_state]]
  decide +kernel

/-- Full occurrence identity remains prior to value admission, so a mismatched Boolean completion preserves all scoped state. -/
theorem boolean_completion_with_wrong_occurrence_preserves_state :
    applyStimulus scenarioClosureLimit checkpointProgram waitingState
        (.completeUserTaskInstance ⟨"wrong-activation"⟩
          { SequentialUserTask.exactTaskInstanceId with activation := 2 }
          [submittedBinding (.boolean true)]) =
      { outcome := .rejected
        state := waitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  exact task_identity_mismatch_is_rejected
    checkpointProgram SequentialUserTask.exactWait ⟨"wrong-activation"⟩
      { SequentialUserTask.exactTaskInstanceId with activation := 2 }
      [submittedBinding (.boolean true)] 0 waitingState.variables
      (by decide +kernel)
      (by decide +kernel)
      (Or.inr (Or.inr (by decide +kernel)))

def mappedOutput : List VariableMapping :=
  [{ target := "decision", expression := .localVariable "result" }]

/-- Boolean patches are excluded from both successful and BPMN Error effect-result mappings. -/
theorem boolean_effect_patches_are_rejected_on_every_result_route :
    applyEffectResult [] mappedOutput []
        (.success [{ name := "result", value := .boolean true }]) = none ∧
      applyEffectResult [] mappedOutput []
        (.bpmnError "E" none
          [{ name := "result", value := .boolean false }]) = none := by
  decide +kernel

/-- Simple Boolean remains total without interpreting a Boolean binding as null or as a string. -/
theorem boolean_binding_simple_boolean_behavior_is_total_and_typed :
    evaluateSimpleBooleanExpression (.isPresent "decision")
        [submittedBinding (.boolean true)] = some true ∧
      evaluateSimpleBooleanExpression (.isNull "decision")
        [submittedBinding (.boolean true)] = some false ∧
      evaluateSimpleBooleanExpression (.stringEquals "decision" "true")
        [submittedBinding (.boolean true)] = some false := by
  decide +kernel

/-- Boolean completion reaches the ordinary End closure without changing its bound or adding an internal choice. -/
theorem boolean_completion_preserves_bounded_deterministic_closure :
    let result :=
      applyStimulus scenarioClosureLimit checkpointProgram waitingState
        (completionStimulus (.boolean true))
    result.state.control = .completed ⟨"Instance_1"⟩ ∧
      result.internalStepBoundExceeded = false ∧
      result.ambiguousInternalChoice = false := by
  decide +kernel

/-- Stable public projection retains Boolean identity and therefore separates true from false. -/
theorem public_projection_preserves_boolean_identity :
    (observeStableState checkpointProgram
      (expectedCompletedState (.boolean true))).map (·.variables) =
        some (expectedBindings (.boolean true)) ∧
      (observeStableState checkpointProgram
        (expectedCompletedState (.boolean false))).map (·.variables) =
          some (expectedBindings (.boolean false)) ∧
      observeStableState checkpointProgram
          (expectedCompletedState (.boolean true)) ≠
        observeStableState checkpointProgram
          (expectedCompletedState (.boolean false)) := by
  decide +kernel

/-- Strict JSON decoding and encoding distinguish both Booleans from the string `"true"` and null. -/
theorem strict_json_preserves_all_four_value_identities :
    decodeVariableValue (encodeVariableValue (.boolean true)) =
        .ok (.boolean true) ∧
      decodeVariableValue (encodeVariableValue (.boolean false)) =
        .ok (.boolean false) ∧
      decodeVariableValue (encodeVariableValue (.string "true")) =
        .ok (.string "true") ∧
      decodeVariableValue (encodeVariableValue .null) = .ok .null ∧
      encodeVariableValue (.boolean true) =
        Json.mkObj [("kind", toJson "boolean"), ("value", toJson true)] ∧
      encodeVariableValue (.boolean false) =
        Json.mkObj [("kind", toJson "boolean"), ("value", toJson false)] ∧
      encodeVariableValue (.string "true") =
        Json.mkObj [("kind", toJson "string"), ("value", toJson "true")] ∧
      encodeVariableValue .null = Json.mkObj [("kind", toJson "null")] := by
  constructor
  · rfl
  constructor
  · rfl
  constructor
  · rfl
  constructor
  · rfl
  constructor
  · rfl
  constructor
  · rfl
  constructor <;> rfl

end BpmnSemantics.BooleanProcessDataConformance
