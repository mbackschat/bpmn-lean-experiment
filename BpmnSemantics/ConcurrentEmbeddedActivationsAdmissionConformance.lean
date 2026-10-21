import BpmnSemantics.ConcurrentEmbeddedActivationsFixtures

/-! # Concurrent embedded activations admission conformance

Finite checked admission witnesses of merge regions under the cumulative embedded completion profile: the
retained audit, intake and depth-two claim models are admitted with agreeing checked and Program closure
bounds, the multiplicity-weighted task bound is tight, and each excluded neighbour of the minimal region is
refused before start. Each refusal is its own theorem, so no kernel decision keeps another model's
reduction resident. The region scan has no quantified certificate; see the
[concurrent embedded activations proposal](../docs/capsules/CONCURRENT-EMBEDDED-ACTIVATIONS-PROPOSAL.md#separating-witnesses).
-/

namespace BpmnSemantics.ConcurrentEmbeddedActivationsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def chainEdges (ids : List String) : List (String × String) := ids.zip ids.tail

/-- Root `P` runs Work `W`, whose body is the region `fork → branches → merge → T → End`; `target` supplies
`T`'s body nodes and edges, and the `extra` lists perturb the model. -/
def regionWith (branches : List String)
    (target : List (String × String × CheckedNode) × List (String × String))
    (extraScopes : List (String × Option String) := []) (extraNodes : List (String × String × CheckedNode) := [])
    (extraEdges : List (String × String) := []) : CheckedProcess :=
  build ([("P", none), ("W", some "P"), ("T", some "W")] ++ extraScopes)
    ([ start "P" "PA", sub "P" "W", finish "P" "Z", start "W" "WA", fork "W" "WF", merge "W" "WM"
     , sub "W" "T", finish "W" "WZ", start "T" "TA", finish "T" "TZ" ] ++ branches.map (task "W") ++
      target.1 ++ extraNodes)
    ([("PA", "W"), ("W", "Z"), ("WA", "WF"), ("WM", "T"), ("T", "WZ")] ++
      branches.flatMap (fun id => [("WF", id), (id, "WM")]) ++ target.2 ++ extraEdges)

/-- `T`'s body as a serial chain of the given User Tasks. -/
def serialTarget (tasks : List String) : List (String × String × CheckedNode) × List (String × String) :=
  (tasks.map (task "T"), chainEdges (["TA"] ++ tasks ++ ["TZ"]))

def region (branches : List String) : CheckedProcess := regionWith branches (serialTarget ["Fix"])

private def padded (index : Nat) : String := "F" ++ (if index < 10 then "0" else "") ++ toString index

/-- The minimal region with `count` target tasks: its multiplicity-weighted count is `2 + 2 * count`. -/
def weighted (count : Nat) : CheckedProcess :=
  regionWith ["A", "B"] (serialTarget ((List.range count).map padded))

def parallelInTarget : CheckedProcess :=
  regionWith ["A", "B"] ([task "T" "X", task "T" "Y", fork "T" "TF", join "T" "TJ"],
    [("TA", "TF"), ("TF", "X"), ("TF", "Y"), ("X", "TJ"), ("Y", "TJ"), ("TJ", "TZ")])

def subProcessInTarget : CheckedProcess :=
  regionWith ["A", "B"] ([sub "T" "N", start "N" "NA", task "N" "NX", finish "N" "NZ"],
    [("TA", "N"), ("N", "TZ"), ("NA", "NX"), ("NX", "NZ")]) (extraScopes := [("N", some "T")])

def serviceTaskBranch : CheckedProcess :=
  let source := region ["A", "B"]
  { source with nodes := source.nodes.map fun value => match value with
    | .userTask ⟨"B"⟩ .. => .serviceTask ⟨"B"⟩
        { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
          operation := "urn:bpmn-lean:effect-operation:probe-v1" } [] [] none
    | other => other }

def forkIntoMerge : CheckedProcess := regionWith ["A"] (serialTarget ["Fix"]) (extraEdges := [("WF", "WM")])

def partialMerge : CheckedProcess :=
  regionWith ["A", "B"] (serialTarget ["Fix"]) (extraNodes := [task "W" "C", finish "W" "CE"])
    (extraEdges := [("WF", "C"), ("C", "CE")])

def twoForks : CheckedProcess :=
  regionWith ["A"] (serialTarget ["Fix"])
    (extraNodes := [fork "W" "G", task "W" "B", task "W" "C", finish "W" "CE"])
    (extraEdges := [("WF", "G"), ("G", "B"), ("G", "C"), ("B", "WM"), ("C", "CE")])

def conditionalMerge : CheckedProcess :=
  let source := region ["A", "B"]
  { source with sequenceFlows := source.sequenceFlows.map fun flow =>
    if flow.id.value == "WM>T" then { flow with condition := some { language := "juel", body := "${true}" } }
    else flow }

def rootRegion : CheckedProcess :=
  build [("P", none), ("T", some "P")]
    [ start "P" "PA", fork "P" "WF", task "P" "A", task "P" "B", merge "P" "WM", sub "P" "T", finish "P" "Z"
    , start "T" "TA", task "T" "Fix", finish "T" "TZ" ]
    [ ("PA", "WF"), ("WF", "A"), ("WF", "B"), ("A", "WM"), ("B", "WM"), ("WM", "T"), ("T", "Z"), ("TA", "Fix")
    , ("Fix", "TZ") ]

/-- The region in a depth-three body `M`, so its target lies at depth four. -/
def depthThreeRegion : CheckedProcess :=
  build [("P", none), ("L", some "P"), ("M", some "L"), ("N", some "M"), ("T", some "N")]
    [ start "P" "PA", sub "P" "L", finish "P" "Z", start "L" "LA", sub "L" "M", finish "L" "LZ"
    , start "M" "MA", sub "M" "N", finish "M" "MZ", start "N" "NA", fork "N" "WF", task "N" "A"
    , task "N" "B", merge "N" "WM", sub "N" "T", finish "N" "NZ", start "T" "TA", task "T" "Fix"
    , finish "T" "TZ" ]
    [ ("PA", "L"), ("L", "Z"), ("LA", "M"), ("M", "LZ"), ("MA", "N"), ("N", "MZ"), ("NA", "WF"), ("WF", "A")
    , ("WF", "B"), ("A", "WM"), ("B", "WM"), ("WM", "T"), ("T", "NZ"), ("TA", "Fix"), ("Fix", "TZ") ]

theorem audit_is_admitted : admitted audit = true := by decide +kernel

theorem audit_analyses_agree_on_its_burst : analyses audit = (some 5, some 5) := by decide +kernel

theorem intake_is_admitted : admitted intake = true := by decide +kernel

theorem intake_analyses_agree_on_its_burst : analyses intake = (some 5, some 5) := by decide +kernel

/-- CEA-ADMIT-01: a region in a depth-two body, whose target lies at depth three, is admitted. -/
theorem depth_two_region_is_admitted : admitted claim = true := by decide +kernel

theorem depth_two_region_analyses_agree : analyses claim = (some 6, some 6) := by decide +kernel

/-- CEA-ADMIT-01: the minimal region is the admitted control for every refusal below. -/
theorem minimal_region_is_admitted : analyses (region ["A", "B"]) = (some 6, some 6) := by decide +kernel

theorem parallel_gateway_in_target_is_refused :
    NestedScopeControl.checkedAnalysis parallelInTarget = none := by decide +kernel

theorem sub_process_in_target_is_refused :
    NestedScopeControl.checkedAnalysis subProcessInTarget = none := by decide +kernel

theorem service_task_branch_is_refused :
    NestedScopeControl.checkedAnalysis serviceTaskBranch = none := by decide +kernel

theorem fork_output_into_merge_is_refused :
    NestedScopeControl.checkedAnalysis forkIntoMerge = none := by decide +kernel

theorem partial_merge_is_refused : NestedScopeControl.checkedAnalysis partialMerge = none := by decide +kernel

theorem merge_fed_by_two_forks_is_refused : NestedScopeControl.checkedAnalysis twoForks = none := by decide +kernel

theorem conditional_merge_flow_is_refused :
    NestedScopeControl.checkedAnalysis conditionalMerge = none := by decide +kernel

theorem root_body_region_is_refused : NestedScopeControl.checkedAnalysis rootRegion = none := by decide +kernel

theorem depth_three_body_region_is_refused :
    NestedScopeControl.checkedAnalysis depthThreeRegion = none := by decide +kernel

/-- CEA-ADMIT-01: 63 target tasks weigh 128 and are admitted. -/
theorem weighted_bound_admits_128_tasks : NestedScopeControl.checkedAnalysis (weighted 63) = some 6 := by
  decide +kernel

/-- CEA-ADMIT-01: 64 target tasks weigh 130 and are refused. -/
theorem weighted_bound_refuses_130_tasks : NestedScopeControl.checkedAnalysis (weighted 64) = none := by
  decide +kernel

end BpmnSemantics.ConcurrentEmbeddedActivationsConformance
