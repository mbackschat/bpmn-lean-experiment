import BpmnSemantics.NestedScopeControlConformance
import BpmnSemantics.SemanticProcess.MergeTargetOccurrenceLaws

/-! # Concurrent embedded activations fixtures

The retained merge-region models of the cumulative embedded completion profile and the observation helpers
their conformance modules decide: the audit, whose two parallel reviews merge into one Remediation
Sub-Process, the intake, whose three checks merge into one Assess Sub-Process, and the depth-two claim. Tasks
are named by element and activation. This module states no theorem, so each conformance module decides only
its own facts. -/

namespace BpmnSemantics.ConcurrentEmbeddedActivationsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- `NestedScopeControlConformance.build` over scopes, members and edges sorted into the canonical id order. -/
def build (scopes : List (String × Option String)) (members : List (String × String × CheckedNode))
    (edges : List (String × String)) : CheckedProcess :=
  NestedScopeControlConformance.build (sortBy (fun left right => decide (left.1 < right.1)) scopes) (sortBy (fun left right => decide (left.2.1 < right.2.1)) members)
    (sortBy (fun left right => decide (left.1 ++ ">" ++ left.2 < right.1 ++ ">" ++ right.2)) edges)

def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩
def node (owner : String) (value : CheckedNode) : String × String × CheckedNode := (owner, value.id.value, value)
def start (owner id : String) := node owner (.noneStartEvent ⟨id⟩)
def finish (owner id : String) := node owner (.noneEndEvent ⟨id⟩)
def fork (owner id : String) := node owner (.parallelGateway ⟨id⟩ .diverging)
def join (owner id : String) := node owner (.parallelGateway ⟨id⟩ .converging)
def merge (owner id : String) := node owner (.exclusiveMerge ⟨id⟩)
def task (owner id : String) := node owner (.userTask ⟨id⟩ (some id))
def sub (owner id : String) := node owner (.embeddedSubProcess ⟨id⟩ (scope id))


/-- Audit `S` forks control review `RC` against payment review `RP`; each merges into Remediation `R`
(fix `FF`, verify `VF`), followed by report `RF`. The root closes the audit with `C`. -/
def audit : CheckedProcess :=
  build [("P", none), ("S", some "P"), ("R", some "S")]
    [ start "P" "PA", task "P" "C", sub "P" "S", finish "P" "Z"
    , start "S" "SA", fork "S" "SF", task "S" "RC", task "S" "RP", merge "S" "SM", sub "S" "R"
    , task "S" "RF", finish "S" "SZ", start "R" "RA", task "R" "FF", task "R" "VF", finish "R" "RZ" ]
    [ ("PA", "S"), ("S", "C"), ("C", "Z"), ("SA", "SF"), ("SF", "RC"), ("SF", "RP"), ("RC", "SM")
    , ("RP", "SM"), ("SM", "R"), ("R", "RF"), ("RF", "SZ"), ("RA", "FF"), ("FF", "VF"), ("VF", "RZ") ]

/-- Intake `I` opens the application `IO`, then forks three checks into one merge before Assess `X`, which
scores the applicant `XS`; the root decides with `D`. -/
def intake : CheckedProcess :=
  build [("P", none), ("I", some "P"), ("X", some "I")]
    [ start "P" "PA", task "P" "D", sub "P" "I", finish "P" "Z"
    , start "I" "IA", task "I" "IO", fork "I" "IF", task "I" "I1", task "I" "I2", task "I" "I3"
    , merge "I" "IM", sub "I" "X", finish "I" "IZ", start "X" "XA", task "X" "XS", finish "X" "XZ" ]
    [ ("PA", "I"), ("I", "D"), ("D", "Z"), ("IA", "IO"), ("IO", "IF"), ("IF", "I1"), ("IF", "I2")
    , ("IF", "I3"), ("I1", "IM"), ("I2", "IM"), ("I3", "IM"), ("IM", "X"), ("X", "IZ"), ("XA", "XS")
    , ("XS", "XZ") ]

/-- Claim case `K` runs review `V`, whose depth-two body forks two assessments into a merge before
Escalation `E` at depth three; the case files with `KF` and the root closes the claim with `CL`. -/
def claim : CheckedProcess :=
  build [("P", none), ("K", some "P"), ("V", some "K"), ("E", some "V")]
    [ start "P" "PA", task "P" "CL", sub "P" "K", finish "P" "Z", start "K" "KA", sub "K" "V"
    , task "K" "KF", finish "K" "KZ", start "V" "VA", fork "V" "VF", task "V" "V1", task "V" "V2"
    , merge "V" "VM", sub "V" "E", finish "V" "VZ", start "E" "EA", task "E" "EE", finish "E" "EZ" ]
    [ ("PA", "K"), ("K", "CL"), ("CL", "Z"), ("KA", "V"), ("V", "KF"), ("KF", "KZ"), ("VA", "VF")
    , ("VF", "V1"), ("VF", "V2"), ("V1", "VM"), ("V2", "VM"), ("VM", "E"), ("E", "VZ"), ("EA", "EE")
    , ("EE", "EZ") ]

def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

def analyses (source : CheckedProcess) : Option Nat × Option Nat :=
  (NestedScopeControl.checkedAnalysis source, NestedScopeControl.programAnalysis (lowerCheckedProcess source))

def taskId (element : String) (activation : Nat) : UserTaskInstanceId :=
  { processInstanceId := ⟨"I"⟩, elementId := ⟨element⟩, activation }

def complete (element : String) (activation : Nat) : Stimulus :=
  .completeUserTaskInstance ⟨element ++ "#" ++ toString activation⟩ (taskId element activation) []

/-- The committed result after starting `source` and completing `tasks` in order; a rejected step stops. -/
def journey (source : CheckedProcess) (tasks : List (String × Nat)) : StimulusResult :=
  let program := lowerCheckedProcess source
  tasks.foldl (fun result (element, activation) =>
      if result.outcome == .committed then
        applyStimulus scenarioClosureLimit program result.state (complete element activation)
      else result)
    (applyStimulus scenarioClosureLimit program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ []))

/-- The open User Tasks as element and activation; `none` when a step did not commit or the state is
unstable. -/
def openTasks (source : CheckedProcess) (tasks : List (String × Nat)) : Option (List (String × Nat)) :=
  let result := journey source tasks
  if result.outcome == .committed then
    (observeStableState (lowerCheckedProcess source) result.state).map
      (·.openUserTasks.map fun task => (task.id.elementId.value, task.id.activation))
  else none

def completed (source : CheckedProcess) (tasks : List (String × Nat)) : Bool :=
  let result := journey source tasks
  result.outcome == .committed && result.state.control == .completed ⟨"I"⟩

/-- Completing `element` at `activation` after `tasks` is rejected and leaves the committed state unchanged. -/
def refused (source : CheckedProcess) (tasks : List (String × Nat)) (element : String) (activation : Nat) :
    Bool :=
  let before := journey source tasks
  let after := applyStimulus scenarioClosureLimit (lowerCheckedProcess source) before.state
    (complete element activation)
  before.outcome == .committed && after.outcome == .rejected && after.state == before.state

/-- The `activation`-th Remediation occurrence of the audit. -/
def remediation (activation : Nat) : ScopeOccurrenceId :=
  { processInstanceId := ⟨"I"⟩, definitionScopeId := scope "R", activation }

/-- Both Remediations live after the second review's fix, with the second made quiescent by withdrawing
its Verify fix wait: the mid-closure state just before its completion fires. -/
def twoRemediations : RuntimeState :=
  let state := (journey audit [("RC", 1), ("RP", 1), ("FF", 2)]).state
  { state with waits := state.waits.filter fun wait => wait.owner != remediation 2 }

def remediationCompletion : Option SemanticOperation :=
  (lowerCheckedProcess audit).operations.find? fun operation => match operation with
    | .completeScope _ _ scopeId _ => scopeId == scope "R"
    | _ => false

end BpmnSemantics.ConcurrentEmbeddedActivationsConformance
