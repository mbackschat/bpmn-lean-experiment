import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import BpmnSemantics.SemanticProcess.Scenario

/-! # Nested scope-control conformance

Finite checked witnesses of nested embedded scope control under the cumulative embedded completion
profile. Employee onboarding nests a Parallel block three scopes deep, and the internal audit puts a Parallel
block of two Sub-Processes inside a third-level scope. Each journey step is one dispatcher evaluation, and the
theorems only read its result. The depth refusal and the admitted fan-out bound agree across the checked
and Program analyses; the structural and over-limit refusals use the checked analysis. They do not
discharge a quantified law; see the
[nested scope-control proposal](../docs/capsules/NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#separating-witnesses).
-/

namespace BpmnSemantics.NestedScopeControlConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def scope (name : String) : DefinitionScopeId := ⟨"scope:" ++ name⟩

private def task (id name : String) : String × CheckedNode := (id, .userTask ⟨id⟩ (some name))

private def sub (id : String) : String × CheckedNode := (id, .embeddedSubProcess ⟨id⟩ (scope id))

/-- A checked process rooted at `P`; `scopes` pairs each scope with its parent and `members` pairs each
owning scope with its node, in node-id order. Flow `s>t` belongs to the scope owning `s`. -/
def build (scopes : List (String × Option String)) (members : List (String × String × CheckedNode))
    (edges : List (String × String)) : CheckedProcess :=
  let owner := fun (id : String) => ((members.find? (·.2.1 == id)).map (·.1)).getD ""
  let flowId := fun (edge : String × String) => edge.1 ++ ">" ++ edge.2
  { identity :=
      { semanticProfile := ⟨"cibseven-2.2.0-embedded-subprocess-completion-draft"⟩
        sourceId := ⟨"nested-scope-control"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000003" }
    processId := ⟨"P"⟩
    definitionScopes := scopes.map fun (name, parent) =>
      { id := scope name, parentScopeId := parent.map scope, originElementId := ⟨name⟩ }
    nodeScopes := members.map fun (owner, id, _) => { nodeId := ⟨id⟩, scopeId := scope owner }
    sequenceFlowScopes := edges.map fun edge => { sequenceFlowId := ⟨flowId edge⟩, scopeId := scope (owner edge.1) }
    nodes := members.map (·.2.2)
    sequenceFlows := edges.map fun edge => { id := ⟨flowId edge⟩, sourceId := ⟨edge.1⟩, targetId := ⟨edge.2⟩ } }

private def start (owner id : String) : String × String × CheckedNode := (owner, id, .noneStartEvent ⟨id⟩)
private def finish (owner id : String) : String × String × CheckedNode := (owner, id, .noneEndEvent ⟨id⟩)
private def fork (owner id : String) : String × String × CheckedNode := (owner, id, .parallelGateway ⟨id⟩ .diverging)
private def join (owner id : String) : String × String × CheckedNode := (owner, id, .parallelGateway ⟨id⟩ .converging)
private def inScope (owner : String) (node : String × CheckedNode) : String × String × CheckedNode := (owner, node)

/-- Employee onboarding: the root forks equipment against start-date confirmation followed by workplace
setup `W`; setup forks desk assignment against accounts `X`, which forks mailbox against VPN. -/
def onboarding : CheckedProcess :=
  build [("P", none), ("W", some "P"), ("X", some "W")]
    [ start "P" "A", inScope "P" (task "D" "Confirm start date"), inScope "P" (task "E" "Order equipment")
    , fork "P" "F", join "P" "J", inScope "P" (task "M" "Welcome meeting"), inScope "P" (sub "W")
    , start "W" "WA", inScope "W" (task "WD" "Assign desk"), fork "W" "WF", finish "W" "WY", finish "W" "WZ"
    , inScope "W" (sub "X"), start "X" "XA", fork "X" "XF", inScope "X" (task "XM" "Create mailbox")
    , inScope "X" (task "XV" "Grant VPN"), finish "X" "XY", finish "X" "XZ", finish "P" "Z" ]
    [ ("A", "F"), ("D", "W"), ("E", "J"), ("F", "D"), ("F", "E"), ("J", "M"), ("M", "Z"), ("W", "J")
    , ("WA", "WF"), ("WD", "WZ"), ("WF", "WD"), ("WF", "X"), ("X", "WY"), ("XA", "XF"), ("XF", "XM")
    , ("XF", "XV"), ("XM", "XY"), ("XV", "XZ") ]

/-- Internal audit: audit `S` runs fieldwork `T` and then sign-off; fieldwork plans, forks sampling `U`
against interviews `V`, joins and reviews findings. `deep` nests a fourth level `W` after the sample. -/
def auditWith (deep : Bool) : CheckedProcess :=
  build ([("P", none), ("S", some "P"), ("T", some "S"), ("U", some "T"), ("V", some "T")] ++ (
      if deep then [("W", some "U")] else []))
    ([ start "P" "A", inScope "P" (task "C" "Close audit"), inScope "P" (sub "S"), start "S" "SA"
     , inScope "S" (task "SS" "Sign off"), finish "S" "SZ", inScope "S" (sub "T"), start "T" "TA", fork "T" "TF"
     , join "T" "TJ", inScope "T" (task "TP" "Plan fieldwork"), inScope "T" (task "TR" "Review findings")
     , finish "T" "TZ", inScope "T" (sub "U"), start "U" "UA", inScope "U" (task "UD" "Draw sample")
     , finish "U" "UZ", inScope "T" (sub "V"), start "V" "VA", inScope "V" (task "VI" "Interview staff")
     , finish "V" "VZ" ] ++
      (if deep then [inScope "U" (sub "W"), start "W" "WA", inScope "W" (task "WU" "Work"), finish "W" "WZ"] else []) ++
      [finish "P" "Z"])
    ([ ("A", "S"), ("C", "Z"), ("S", "C"), ("SA", "T"), ("SS", "SZ"), ("T", "SS"), ("TA", "TP"), ("TF", "U")
     , ("TF", "V"), ("TJ", "TR"), ("TP", "TF"), ("TR", "TZ"), ("U", "TJ"), ("UA", "UD")
     , (if deep then ("UD", "W") else ("UD", "UZ")), ("V", "TJ"), ("VA", "VI"), ("VI", "VZ") ] ++
      (if deep then [("W", "UZ"), ("WA", "WU"), ("WU", "WZ")] else []))

def audit : CheckedProcess := auditWith false

/-- Root Sub-Process `Q` whose body forks `width` User Tasks and joins them; `extra` adds child edges. -/
def fanout (width : Nat) (extra : List (String × String)) : CheckedProcess :=
  let tasks := ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"].take width
  build [("P", none), ("Q", some "P")]
    ([start "P" "PA", finish "P" "PZ", inScope "P" (sub "Q")] ++ tasks.map (fun id => inScope "Q" (task id "Work")) ++
      [start "Q" "QA", fork "Q" "QF", join "Q" "QJ", finish "Q" "QZ"])
    ([("PA", "Q"), ("Q", "PZ")] ++ tasks.map (·, "QJ") ++ [("QA", "QF")] ++ tasks.map ("QF", ·) ++
      extra ++ [("QJ", "QZ")])

/-- Two overlapping Parallel blocks in `Q`: `QJ` joins a branch of `QF` with a branch of `QG`. -/
def crossing : CheckedProcess :=
  build [("P", none), ("Q", some "P")]
    [ start "P" "PA", finish "P" "PZ", inScope "P" (sub "Q"), inScope "Q" (task "Q1" "Work"), inScope "Q" (task "Q2" "Work")
    , inScope "Q" (task "Q3" "Work"), start "Q" "QA", fork "Q" "QF", fork "Q" "QG", join "Q" "QJ", join "Q" "QK"
    , finish "Q" "QZ" ]
    [ ("PA", "Q"), ("Q", "PZ"), ("Q1", "QJ"), ("Q2", "QJ"), ("Q3", "QK"), ("QA", "QF"), ("QF", "Q1")
    , ("QF", "QG"), ("QG", "Q2"), ("QG", "Q3"), ("QJ", "QK"), ("QK", "QZ") ]

/-- The root's join takes one input from its own fork and one from a task inside `Q`. -/
def joinFedFromTwoScopes : CheckedProcess :=
  build [("P", none), ("Q", some "P")]
    [ start "P" "PA", fork "P" "PF", join "P" "PJ", inScope "P" (task "PU" "Work"), finish "P" "PZ"
    , inScope "P" (sub "Q"), start "Q" "QA", inScope "Q" (task "QU" "Work"), finish "Q" "QZ" ]
    [ ("PA", "PF"), ("PF", "PU"), ("PF", "Q"), ("PJ", "PZ"), ("PU", "PJ"), ("Q", "PJ"), ("QA", "QU")
    , ("QU", "PJ"), ("QU", "QZ") ]

/-- `Q` routes its entry through `node`, identified `QN`, before its User Task. -/
def detour (node : CheckedNode) : CheckedProcess :=
  build [("P", none), ("Q", some "P")]
    [ start "P" "PA", finish "P" "PZ", inScope "P" (sub "Q"), start "Q" "QA", ("Q", "QN", node)
    , inScope "Q" (task "QU" "Work"), finish "Q" "QZ" ]
    [("PA", "Q"), ("Q", "PZ"), ("QA", "QN"), ("QN", "QU"), ("QU", "QZ")]

/-- The root forks into two Ends beside its Sub-Process. -/
def rootTerminalFork : CheckedProcess :=
  build [("P", none), ("Q", some "P")]
    [ start "P" "PA", fork "P" "PF", finish "P" "PY", finish "P" "PZ", inScope "P" (sub "Q"), start "Q" "QA"
    , inScope "Q" (task "QU" "Work"), finish "Q" "QZ" ]
    [ ("PA", "PF"), ("PF", "PY"), ("PF", "Q"), ("Q", "PZ"), ("QA", "QU"), ("QU", "QZ") ]

private def admitted (source : CheckedProcess) : Bool :=
  let program := lowerCheckedProcess source
  checkedWellFormed source && programWellFormed program && programProfileCapabilitiesValid program &&
    definitionBindingValid source program

private def analyses (source : CheckedProcess) : Option Nat × Option Nat :=
  (NestedScopeControl.checkedAnalysis source, NestedScopeControl.programAnalysis (lowerCheckedProcess source))

private def taskId (element : String) : UserTaskInstanceId :=
  { processInstanceId := ⟨"I"⟩, elementId := ⟨element⟩, activation := 1 }

/-- The committed result after starting `source` and completing `tasks` in order; a rejected step stops. -/
def journey (source : CheckedProcess) (tasks : List String) : StimulusResult :=
  let program := lowerCheckedProcess source
  tasks.foldl (fun result element =>
      if result.outcome == .committed then
        applyStimulus scenarioClosureLimit program result.state
          (.completeUserTaskInstance ⟨"complete-" ++ element⟩ (taskId element) [])
      else result)
    (applyStimulus scenarioClosureLimit program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ []))

/-- The open User Tasks after a committed journey; `none` when a step did not commit or the state is unstable. -/
def openTasks (source : CheckedProcess) (tasks : List String) : Option (List String) :=
  let result := journey source tasks
  if result.outcome == .committed then
    (observeStableState (lowerCheckedProcess source) result.state).map
      (·.openUserTasks.map (·.id.elementId.value))
  else none

private def completed (source : CheckedProcess) (tasks : List String) : Bool :=
  let result := journey source tasks
  result.outcome == .committed && result.state.control == .completed ⟨"I"⟩

/-- Completing `element` after `tasks` is rejected and leaves the committed state unchanged. -/
def refused (source : CheckedProcess) (tasks : List String) (element : String) : Bool :=
  let before := journey source tasks
  let after := applyStimulus scenarioClosureLimit (lowerCheckedProcess source) before.state
    (.completeUserTaskInstance ⟨"again"⟩ (taskId element) [])
  before.outcome == .committed && after.outcome == .rejected && after.state == before.state

theorem onboarding_is_admitted_with_agreeing_bursts :
    admitted onboarding = true ∧ analyses onboarding = (some 7, some 7) := by
  decide +kernel

theorem audit_is_admitted_with_agreeing_bursts :
    admitted audit = true ∧ analyses audit = (some 5, some 5) := by
  decide +kernel

theorem onboarding_start_arms_start_date_and_equipment :
    openTasks onboarding [] = some ["D", "E"] := by
  decide +kernel

/-- NSC-ENTER-01: confirming the start date enters setup and accounts in one closure, arming three tasks
three scopes deep beside the root's pending equipment order. -/
theorem onboarding_start_date_enters_two_scopes_in_one_closure :
    openTasks onboarding ["D"] = some ["E", "WD", "XM", "XV"] := by
  decide +kernel

/-- NSC-END-01 and NSC-OUTSIDE-01: the mailbox End at depth two leaves its sibling VPN, the desk and the
root join waiting. -/
theorem onboarding_mailbox_end_completes_nothing :
    openTasks onboarding ["D", "XM"] = some ["E", "WD", "XV"] := by
  decide +kernel

/-- NSC-END-01 and NSC-OUTSIDE-01: the desk End at depth one leaves the accounts scope and the root join
waiting. -/
theorem onboarding_desk_end_completes_nothing :
    openTasks onboarding ["D", "WD"] = some ["E", "XM", "XV"] := by
  decide +kernel

/-- NSC-JOIN-01: the root join waits for the setup scope, which waits for the accounts scope. -/
theorem onboarding_root_join_waits_for_the_last_nested_task :
    openTasks onboarding ["D", "XM", "WD", "E"] = some ["XV"] := by
  decide +kernel

theorem onboarding_last_nested_task_releases_the_welcome_meeting :
    openTasks onboarding ["D", "XM", "WD", "E", "XV"] = some ["M"] := by
  decide +kernel

/-- NSC-JOIN-01: the reverse completion order reaches the same join. -/
theorem onboarding_reverse_order_releases_the_welcome_meeting :
    openTasks onboarding ["E", "D", "XV", "XM", "WD"] = some ["M"] := by
  decide +kernel

theorem onboarding_completes_after_the_welcome_meeting :
    completed onboarding ["D", "XM", "WD", "E", "XV", "M"] = true := by
  decide +kernel

/-- NSC-ENTER-01: planning enters both third-level scopes. -/
theorem audit_planning_enters_both_third_level_scopes :
    openTasks audit ["TP"] = some ["UD", "VI"] := by
  decide +kernel

/-- NSC-QUIESCE-01 and NSC-JOIN-01: one completed scope leaves fieldwork's join waiting. -/
theorem audit_one_completed_scope_leaves_fieldwork_waiting :
    openTasks audit ["TP", "UD"] = some ["VI"] := by
  decide +kernel

theorem audit_both_completed_scopes_release_review :
    openTasks audit ["TP", "VI", "UD"] = some ["TR"] := by
  decide +kernel

/-- NSC-QUIESCE-01: completed fieldwork resumes the audit with sign-off. -/
theorem audit_review_resumes_sign_off :
    openTasks audit ["TP", "UD", "VI", "TR"] = some ["SS"] := by
  decide +kernel

theorem audit_completes_after_closing :
    completed audit ["TP", "UD", "VI", "TR", "SS", "C"] = true := by
  decide +kernel

/-- NSC-REFUSE-01: an early review is a rejection that leaves the state unchanged. -/
theorem early_review_leaves_state_unchanged :
    refused audit ["TP", "UD"] "TR" = true := by
  decide +kernel

/-- NSC-REFUSE-01: a repeated sample is a rejection that leaves the state unchanged. -/
theorem repeated_sample_leaves_state_unchanged :
    refused audit ["TP", "UD"] "UD" = true := by
  decide +kernel

/-- NSC-ADMIT-01: the audit at depth three is admitted, and a fourth level under sampling is refused. -/
theorem fourth_nesting_level_is_refused :
    analyses (auditWith true) = (none, none) := by
  decide +kernel

/-- NSC-ADMIT-01: five parallel child tasks need eight closure steps and are admitted; six would need nine.
The kernel does not reduce the five-task Start journey, so its commit is witnessed by the source admission test. -/
theorem closure_limit_bounds_the_fanout :
    analyses (fanout 5 []) = (some 8, some 8) ∧
      (NestedScopeControl.checkedAnalysis (fanout 6 [])).isNone = true := by
  decide +kernel

/-- NSC-ADMIT-01: a task-free branch, crossing Parallel blocks, a join fed from two scopes, a root terminal
fork, an Exclusive Gateway and a Service Task are refused. -/
theorem unstructured_bodies_are_refused :
    (NestedScopeControl.checkedAnalysis (fanout 2 [("QF", "QJ")])).isNone = true ∧
      (NestedScopeControl.checkedAnalysis crossing).isNone = true ∧
      (NestedScopeControl.checkedAnalysis joinFedFromTwoScopes).isNone = true ∧
      (NestedScopeControl.checkedAnalysis rootTerminalFork).isNone = true ∧
      (NestedScopeControl.checkedAnalysis (detour (.exclusiveGateway ⟨"QN"⟩ [] ⟨"QN>QU"⟩))).isNone = true ∧
      (NestedScopeControl.checkedAnalysis (detour (.serviceTask ⟨"QN"⟩
        { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
          operation := "urn:bpmn-lean:effect-operation:probe-v1" } [] [] none))).isNone = true := by
  decide +kernel

end BpmnSemantics.NestedScopeControlConformance
