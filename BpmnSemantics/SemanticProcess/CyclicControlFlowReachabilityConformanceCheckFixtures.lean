module

import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.CheckedProcessContract
public import BpmnSemantics.Scenario
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.CyclicControlFlowFixtures
public import BpmnSemantics.SemanticProcess.Data
public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcess.RuntimeState
public import BpmnSemantics.SemanticProcess.Transition
public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.WaitCompletion

/-! Fixture definitions and executable checks of [`CyclicControlFlowReachabilityConformance`](CyclicControlFlowReachabilityConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

public section

namespace BpmnSemantics.SemanticProcess


open BpmnSemantics

inductive CyclicReviewPatch where
  | empty
  | nullRoute
  | stringRoute (value : String)
  deriving Repr, DecidableEq

def CyclicReviewPatch.bindings : CyclicReviewPatch → List VariableBinding
  | .empty => []
  | .nullRoute => [{ name := "route", value := .null }]
  | .stringRoute value => [{ name := "route", value := .string value }]

inductive CyclicRouteValue where
  | absent
  | nullValue
  | stringValue (value : String)
  deriving Repr, DecidableEq

def CyclicRouteValue.bindings : CyclicRouteValue → List VariableBinding
  | .absent => []
  | .nullValue => [{ name := "route", value := .null }]
  | .stringValue value => [{ name := "route", value := .string value }]

def CyclicReviewPatch.apply : CyclicReviewPatch → CyclicRouteValue → CyclicRouteValue
  | .empty, previous => previous
  | .nullRoute, _ => .nullValue
  | .stringRoute value, _ => .stringValue value

def CyclicRouteValue.output : CyclicRouteValue → ControlPlaceId
  | .stringValue "repeat" => ⟨"place:Flow_Repeat"⟩
  | .stringValue "rework" => ⟨"place:Flow_Rework"⟩
  | _ => ⟨"place:Flow_Exit"⟩

def cyclicPatchReviewState (state : RuntimeState)
    (patch : CyclicReviewPatch) : RuntimeState :=
  { state with
    variables :=
      { state.variables with
        process :=
          { bindings := mergeProcessVariableBindings
              state.variables.process.bindings patch.bindings } } }

def cyclicScopedVariables (route : CyclicRouteValue) : ScopedVariables :=
  { emptyScopedVariables with process := { bindings := route.bindings } }

def cyclicWaitingWithBindings (activation : Nat)
    (route : CyclicRouteValue) : RuntimeState :=
  singletonWaitingState (cyclicWait activation) 0 (cyclicScopedVariables route)

def cyclicPostCompletionWithBindings (activation : Nat)
    (route : CyclicRouteValue) : RuntimeState :=
  { cyclicWaitingWithBindings activation route with
    waits := []
    tokens :=
      [{ placeId := ⟨"place:Flow_Review_Choice"⟩, owner := cyclicOwner }] }

def cyclicPostChooseWithBindings (activation : Nat)
    (route : CyclicRouteValue) (output : ControlPlaceId) : RuntimeState :=
  { cyclicPostCompletionWithBindings activation route with
    tokens := [{ placeId := output, owner := cyclicOwner }] }

def cyclicPostMergeWithBindings (activation : Nat)
    (route : CyclicRouteValue) : RuntimeState :=
  { cyclicPostCompletionWithBindings activation route with
    tokens :=
      [{ placeId := ⟨"place:Flow_Merge_Review"⟩, owner := cyclicOwner }] }

def cyclicPostEndWithBindings (activation : Nat)
    (route : CyclicRouteValue) : RuntimeState :=
  { cyclicPostCompletionWithBindings activation route with
    tokens := []
    endOccurrences :=
      (cyclicPostCompletionWithBindings activation route).endOccurrences + 1 }

def cyclicCompletedWithBindings (activation : Nat)
    (route : CyclicRouteValue) : RuntimeState :=
  { cyclicPostEndWithBindings activation route with
    control := .completed cyclicInstanceId
    scopeOccurrences := [] }

/-- One actual internal evaluator action in the admitted selected program. -/
inductive CyclicSelectedInternalAction :
    RuntimeState → OperationId → RuntimeState → Prop where
  | start
      (execution : step cyclicProgram cyclicAdmittedStartState
        ⟨"operation:Start"⟩ = some cyclicPostStartState) :
      CyclicSelectedInternalAction cyclicAdmittedStartState
        ⟨"operation:Start"⟩ cyclicPostStartState
  | initialMerge
      (execution : step cyclicProgram cyclicPostStartState
        ⟨"operation:Merge"⟩ = some cyclicInitialPostMergeState) :
      CyclicSelectedInternalAction cyclicPostStartState
        ⟨"operation:Merge"⟩ cyclicInitialPostMergeState
  | initialReview
      (execution : step cyclicProgram cyclicInitialPostMergeState
        ⟨"operation:Review"⟩ =
          some (cyclicWaitingWithBindings 1 .absent)) :
      CyclicSelectedInternalAction cyclicInitialPostMergeState
        ⟨"operation:Review"⟩ (cyclicWaitingWithBindings 1 .absent)
  | choose (activation : Nat) (route : CyclicRouteValue)
      (execution : step cyclicProgram
        (cyclicPostCompletionWithBindings activation route)
        ⟨"operation:Choice"⟩ =
          some (cyclicPostChooseWithBindings activation route route.output)) :
      CyclicSelectedInternalAction
        (cyclicPostCompletionWithBindings activation route)
        ⟨"operation:Choice"⟩
        (cyclicPostChooseWithBindings activation route route.output)
  | mergeRepeat (activation : Nat)
      (execution : step cyclicProgram
        (cyclicPostChooseWithBindings activation (.stringValue "repeat")
          ⟨"place:Flow_Repeat"⟩) ⟨"operation:Merge"⟩ =
          some (cyclicPostMergeWithBindings activation
            (.stringValue "repeat"))) :
      CyclicSelectedInternalAction
        (cyclicPostChooseWithBindings activation (.stringValue "repeat")
          ⟨"place:Flow_Repeat"⟩) ⟨"operation:Merge"⟩
        (cyclicPostMergeWithBindings activation (.stringValue "repeat"))
  | mergeRework (activation : Nat)
      (execution : step cyclicProgram
        (cyclicPostChooseWithBindings activation (.stringValue "rework")
          ⟨"place:Flow_Rework"⟩) ⟨"operation:Merge"⟩ =
          some (cyclicPostMergeWithBindings activation
            (.stringValue "rework"))) :
      CyclicSelectedInternalAction
        (cyclicPostChooseWithBindings activation (.stringValue "rework")
          ⟨"place:Flow_Rework"⟩) ⟨"operation:Merge"⟩
        (cyclicPostMergeWithBindings activation (.stringValue "rework"))
  | review (activation : Nat) (route : CyclicRouteValue)
      (execution : step cyclicProgram
        (cyclicPostMergeWithBindings activation route)
        ⟨"operation:Review"⟩ =
          some (cyclicWaitingWithBindings (activation + 1) route)) :
      CyclicSelectedInternalAction
        (cyclicPostMergeWithBindings activation route)
        ⟨"operation:Review"⟩
        (cyclicWaitingWithBindings (activation + 1) route)
  | endDefault (activation : Nat) (route : CyclicRouteValue)
      (defaultSelected : route.output = ⟨"place:Flow_Exit"⟩)
      (execution : step cyclicProgram
        (cyclicPostChooseWithBindings activation route route.output)
        ⟨"operation:End"⟩ = some (cyclicPostEndWithBindings activation route)) :
      CyclicSelectedInternalAction
        (cyclicPostChooseWithBindings activation route route.output)
        ⟨"operation:End"⟩ (cyclicPostEndWithBindings activation route)
  | complete (activation : Nat) (route : CyclicRouteValue)
      (execution : step cyclicProgram (cyclicPostEndWithBindings activation route)
        ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩ =
          some (cyclicCompletedWithBindings activation route)) :
      CyclicSelectedInternalAction (cyclicPostEndWithBindings activation route)
        ⟨"operation:complete-scope:scope:Process_CyclicControlFlow"⟩
        (cyclicCompletedWithBindings activation route)

/-- One actual admitted selected-program action: exact start admission, an internal evaluator action, or one matching User Task completion with a valid route patch. -/
inductive CyclicSelectedAction : RuntimeState → RuntimeState → Prop where
  | admitStart
      (execution : admitStimulus cyclicProgram initialState cyclicStartStimulus =
        { outcome := .committed, state := cyclicAdmittedStartState }) :
      CyclicSelectedAction initialState cyclicAdmittedStartState
  | internal (before after : RuntimeState) (operationId : OperationId)
      (execution : CyclicSelectedInternalAction before operationId after) :
      CyclicSelectedAction before after
  | completeReview (before raw after : RuntimeState) (activation : Nat)
      (patch : CyclicReviewPatch)
      (running : before.control = .running cyclicInstanceId)
      (completion : completeUserTask before cyclicInstanceId ⟨"Review"⟩
        activation = some raw)
      (patched : cyclicPatchReviewState raw patch = after) :
      CyclicSelectedAction before after

/-- Reflexive-transitive closure from the initial state over actual admitted selected-program actions. -/
inductive CyclicSelectedReachable : RuntimeState → Prop where
  | initial : CyclicSelectedReachable initialState
  | next (before after : RuntimeState)
      (reachable : CyclicSelectedReachable before)
      (action : CyclicSelectedAction before after) :
      CyclicSelectedReachable after

inductive CyclicReachableShape : RuntimeState → Prop where
  | initial : CyclicReachableShape initialState
  | admitted : CyclicReachableShape cyclicAdmittedStartState
  | started : CyclicReachableShape cyclicPostStartState
  | initialMerged : CyclicReachableShape cyclicInitialPostMergeState
  | waiting (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape (cyclicWaitingWithBindings activation route)
  | completedTask (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape
        (cyclicPostCompletionWithBindings activation route)
  | chosen (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape
        (cyclicPostChooseWithBindings activation route route.output)
  | merged (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape (cyclicPostMergeWithBindings activation route)
  | ended (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape (cyclicPostEndWithBindings activation route)
  | completed (activation : Nat) (route : CyclicRouteValue) :
      CyclicReachableShape (cyclicCompletedWithBindings activation route)

def other_route_command_commits_the_exact_default_exit : Bool := decide <|
    applyStimulus 3 cyclicProgram (cyclicWaitingState 1 none)
      (cyclicCompletionStimulus 1 "other") =
        cyclicCommittedResult (cyclicCompletedState 1 "other")

/-- Every executable check of this module, named for the driver's failure report. -/
def cyclicControlFlowReachabilityConformanceChecks : List (String × Bool) := [
  ("other_route_command_commits_the_exact_default_exit", other_route_command_commits_the_exact_default_exit)
]

end BpmnSemantics.SemanticProcess
