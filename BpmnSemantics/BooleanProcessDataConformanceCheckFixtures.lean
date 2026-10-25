module

public import BpmnSemantics.SequentialUserTaskFixtures
public import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries

/-! Fixture definitions and executable checks of [`BooleanProcessDataConformance`](BooleanProcessDataConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

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

/-- The checkpoint profile is admitted for the existing exact one-Start, one-User-Task, one-End Semantic Process shape. -/
def checkpoint_program_profile_is_admitted : Bool := decide <|
    programProfileCapabilitiesValid checkpointProgram = true

/-- Process Start remains string/null-only even under the Boolean completion profile. -/
def checkpoint_boolean_process_start_is_rejected : Bool := decide <|
    applyStimulus scenarioClosureLimit checkpointProgram initialState
        (.startProcess ⟨"boolean-start"⟩
          ⟨checkpointProgram.processId.value⟩ ⟨"Instance_Boolean"⟩
          [{ name := "decision", value := .boolean true }]) =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- The selected completion profile commits Boolean false as a Boolean Process binding. -/
def boolean_false_completion_commits_distinct_value : Bool := decide <|
    applyStimulus scenarioClosureLimit checkpointProgram waitingState
        (completionStimulus (.boolean false)) =
      { outcome := .committed
        state := expectedCompletedState (.boolean false)
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def mappedOutput : List VariableMapping :=
  [{ target := "decision", expression := .localVariable "result" }]

/-- Simple Boolean remains total without interpreting a Boolean binding as null or as a string. -/
def boolean_binding_simple_boolean_behavior_is_total_and_typed : Bool := decide <|
    evaluateSimpleBooleanExpression (.isPresent "decision")
        [submittedBinding (.boolean true)] = some true ∧
      evaluateSimpleBooleanExpression (.isNull "decision")
        [submittedBinding (.boolean true)] = some false ∧
      evaluateSimpleBooleanExpression (.stringEquals "decision" "true")
        [submittedBinding (.boolean true)] = some false

/-- Stable public projection retains Boolean identity and therefore separates true from false. -/
def public_projection_preserves_boolean_identity : Bool := decide <|
    (observeStableState checkpointProgram
      (expectedCompletedState (.boolean true))).map (·.variables) =
        some (expectedBindings (.boolean true)) ∧
      (observeStableState checkpointProgram
        (expectedCompletedState (.boolean false))).map (·.variables) =
          some (expectedBindings (.boolean false)) ∧
      observeStableState checkpointProgram
          (expectedCompletedState (.boolean true)) ≠
        observeStableState checkpointProgram
          (expectedCompletedState (.boolean false))

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("checkpoint_program_profile_is_admitted", checkpoint_program_profile_is_admitted),
  ("checkpoint_boolean_process_start_is_rejected", checkpoint_boolean_process_start_is_rejected),
  ("boolean_false_completion_commits_distinct_value", boolean_false_completion_commits_distinct_value),
  ("boolean_binding_simple_boolean_behavior_is_total_and_typed", boolean_binding_simple_boolean_behavior_is_total_and_typed),
  ("public_projection_preserves_boolean_identity", public_projection_preserves_boolean_identity)
]

end BpmnSemantics.BooleanProcessDataConformance
