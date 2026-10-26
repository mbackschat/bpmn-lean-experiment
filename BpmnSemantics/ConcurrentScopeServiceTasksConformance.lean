module

public import BpmnSemantics.RepeatedNestedConcurrentCallsFixtures

/-! # Concurrent scope Service Tasks conformance

Finite witnesses of data-free, overlay-bound Service Tasks in the nested scope-control class of the cumulative
embedded completion profile (CSE-ADMIT-01, CSE-QUIESCE-01, CSE-ISOLATE-01, CSE-REFUSE-01). The supplier and
claim intake models are admitted with agreeing checked and Program closure bounds and run their journeys, each
refused model differs from an admitted control in the one fact its name states, and the dispatcher check
records that the profile completes an effect through the generic `completeEffect` arm whose frame law
`completeEffect_data_free_frame` states. Burst expectations are the TypeScript analysis's values for the same
graphs; see the
[concurrent scope Service Tasks proposal](../docs/capsules/CONCURRENT-SCOPE-SERVICE-TASKS-SPEC.md#separating-witnesses).
-/

@[expose] public section

namespace BpmnSemantics.ConcurrentScopeServiceTasksConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance
  (build node start finish fork join merge task sub scope admitted analyses complete)
open BpmnSemantics.RepeatedNestedConcurrentCallsConformance (call chain)

def activityProtocol : String := "urn:bpmn-lean:effect-protocol:activity-v1"

/-- A data-free Service Task whose handler is named after its element. -/
def service (owner id : String) := node owner (.serviceTask ⟨id⟩ { protocol := activityProtocol, operation := "handle" ++ id } [] [] none)

def overlay : SourceOverlayIdentity :=
  { id := ⟨"concurrent-scope-handlers"⟩, sha256 := "0000000000000000000000000000000000000000000000000000000000000004" }

def withOverlay (source : CheckedProcess) : CheckedProcess :=
  { source with identity := { source.identity with sourceOverlay := some overlay } }

/-- Supplier onboarding: root `P` runs Onboard `O`, then activates the supplier `Activate` (Service). Onboard
forks sanctions screening `Screen` and bank verification `Verify` (both Service) against contract review
`Review` into a join, then approval `Approve`. -/
def supplierSource : CheckedProcess :=
  build [("P", none), ("O", some "P")]
    [ start "P" "PA", sub "P" "O", service "P" "Activate", finish "P" "Z"
    , start "O" "OA", fork "O" "OF", service "O" "Screen", service "O" "Verify", task "O" "Review"
    , join "O" "OJ", task "O" "Approve", finish "O" "OZ" ]
    [ ("PA", "O"), ("O", "Activate"), ("Activate", "Z"), ("OA", "OF"), ("OF", "Screen"), ("OF", "Verify")
    , ("OF", "Review"), ("Screen", "OJ"), ("Verify", "OJ"), ("Review", "OJ"), ("OJ", "Approve"), ("Approve", "OZ") ]

def supplier : CheckedProcess := withOverlay supplierSource

/-- Claim intake: root `P` runs Intake `I`, then settles the claim `Settle`. Intake forks the police report
`Collect` against the policy lookup `Fetch` (Service) into a merge before Assess `A`, which prices the damage
`Price` (Service) and confirms the assessment `Confirm`. -/
def claim : CheckedProcess :=
  withOverlay <| build [("P", none), ("I", some "P"), ("A", some "I")]
    [ start "P" "PA", sub "P" "I", task "P" "Settle", finish "P" "Z"
    , start "I" "IA", fork "I" "IF", task "I" "Collect", service "I" "Fetch", merge "I" "IM", sub "I" "A"
    , finish "I" "IZ", start "A" "AA", service "A" "Price", task "A" "Confirm", finish "A" "AZ" ]
    [ ("PA", "I"), ("I", "Settle"), ("Settle", "Z"), ("IA", "IF"), ("IF", "Collect"), ("IF", "Fetch")
    , ("Collect", "IM"), ("Fetch", "IM"), ("IM", "A"), ("A", "IZ"), ("AA", "Price"), ("Price", "Confirm")
    , ("Confirm", "AZ") ]

/-- Sub-Processes nested to depth three, the deepest body running `First` and then `last`, the root body
nothing else: completing `last` cascades through three scope completions to the root End. -/
def deepest (last : String → String → String × String × CheckedNode) : CheckedProcess :=
  withOverlay <| build [("P", none), ("A", some "P"), ("B", some "A"), ("C", some "B")]
    [ start "P" "PA", sub "P" "A", finish "P" "Z", start "A" "AA", sub "A" "B", finish "A" "AZ"
    , start "B" "BA", sub "B" "C", finish "B" "BZ", start "C" "CA", task "C" "First", last "C" "Last"
    , finish "C" "CZ" ]
    [ ("PA", "A"), ("A", "Z"), ("AA", "B"), ("B", "AZ"), ("BA", "C"), ("C", "BZ"), ("CA", "First")
    , ("First", "Last"), ("Last", "CZ") ]

/-- `deepest` with `First` and the Service Task `Last` forked into a join, which adds one closure step. -/
def deepestForked : CheckedProcess :=
  withOverlay <| build [("P", none), ("A", some "P"), ("B", some "A"), ("C", some "B")]
    [ start "P" "PA", sub "P" "A", finish "P" "Z", start "A" "AA", sub "A" "B", finish "A" "AZ"
    , start "B" "BA", sub "B" "C", finish "B" "BZ", start "C" "CA", fork "C" "CF", task "C" "First"
    , service "C" "Last", join "C" "CJ", finish "C" "CZ" ]
    [ ("PA", "A"), ("A", "Z"), ("AA", "B"), ("B", "AZ"), ("BA", "C"), ("C", "BZ"), ("CA", "CF")
    , ("CF", "First"), ("CF", "Last"), ("First", "CJ"), ("Last", "CJ"), ("CJ", "CZ") ]

/-- `supplier` with `Screen` replaced. -/
def supplierWithScreen (screen : CheckedNode) : CheckedProcess :=
  { supplier with nodes := supplier.nodes.map fun value => if value.id.value == "Screen" then screen else value }

def mapping : VariableMapping := { target := "screening", expression := .localVariable "screening" }

def errorRoute : CheckedBpmnErrorRoute :=
  { boundaryEventId := ⟨"ScreenFailed"⟩, boundaryEventName := none, attachedToRef := ⟨"Screen"⟩
    errorDefinitionId := ⟨"ScreenError"⟩, errorElementId := ⟨"ScreenError"⟩, errorName := none
    code := "SANCTIONED", outputFlowId := ⟨"ScreenFailed>OJ"⟩ }

def screen (inputs outputs : List VariableMapping) (route : Option CheckedBpmnErrorRoute)
    (protocol : String := activityProtocol) : CheckedNode :=
  .serviceTask ⟨"Screen"⟩ { protocol, operation := "handleScreen" } inputs outputs route

def padded (index : Nat) : String := "T" ++ (if index < 10 then "0" else "") ++ toString index

/-- Root `P` runs Sub-Process `S`, whose body is a serial chain of `count` Service Tasks. -/
def serviceChain (count : Nat) : CheckedProcess :=
  let ids := (List.range count).map padded
  withOverlay <| build [("P", none), ("S", some "P")]
    ([start "P" "PA", sub "P" "S", finish "P" "Z", start "S" "SA", finish "S" "SZ"] ++ ids.map (service "S"))
    ([("PA", "S"), ("S", "Z")] ++ chain (["SA"] ++ ids ++ ["SZ"]))

/-- Root `P` runs `W`, which forks `A` and `B` into a merge before the target `T`, whose body chains `count`
Service Tasks: two fork outputs weigh each of them twice. -/
def weightedTarget (count : Nat) : CheckedProcess :=
  let ids := (List.range count).map padded
  withOverlay <| build [("P", none), ("W", some "P"), ("T", some "W")]
    ([ start "P" "PA", sub "P" "W", finish "P" "Z", start "W" "WA", fork "W" "WF", task "W" "A", task "W" "B"
     , merge "W" "WM", sub "W" "T", finish "W" "WZ", start "T" "TA", finish "T" "TZ" ] ++ ids.map (service "T"))
    ([ ("PA", "W"), ("W", "Z"), ("WA", "WF"), ("WF", "A"), ("WF", "B"), ("A", "WM"), ("B", "WM"), ("WM", "T")
     , ("T", "WZ") ] ++ chain (["TA"] ++ ids ++ ["TZ"]))

/-- A caller root calling `K` and then running `next`; `K` runs `called`. -/
def caller (next called : String → String → String × String × CheckedNode) : CheckedProcess :=
  withOverlay <| build [("P", none), ("K", none)]
    [ start "P" "PA", call "P" "Invoke" "K", next "P" "Next", finish "P" "Z", start "K" "KA", called "K" "Called"
    , finish "K" "KZ" ]
    [("PA", "Invoke"), ("Invoke", "Next"), ("Next", "Z"), ("KA", "Called"), ("Called", "KZ")]

/-- A Service-free control keeps its overlay-free identity. -/
def callerControl : CheckedProcess := { caller task task with identity := { (caller task task).identity with sourceOverlay := none } }

inductive Step where
  | human (element : String) (activation : Nat)
  | effect (element : String) (activation : Nat)

def effectId (element : String) (activation : Nat) : EffectOccurrenceId :=
  { processInstanceId := ⟨"I"⟩, elementId := ⟨element⟩, activation }

def stimulus : Step → Stimulus
  | .human element activation => complete element activation
  | .effect element activation =>
      .completeEffect ⟨element ++ "!" ++ toString activation⟩ (effectId element activation) (.success [])

/-- The result after starting `source` and applying `steps` in order; a step that does not commit stops. -/
def journey (source : CheckedProcess) (steps : List Step) : StimulusResult :=
  let program := lowerCheckedProcess source
  steps.foldl (fun result step =>
      if result.outcome == .committed then applyStimulus scenarioClosureLimit program result.state (stimulus step)
      else result)
    (applyStimulus scenarioClosureLimit program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ []))

def sameElements (left right : List (String × Nat)) : Bool :=
  left.length == right.length && left.all right.contains

/-- After `steps` commit, exactly `tasks` are open User Tasks and exactly `effects` are open effects. -/
def opens (source : CheckedProcess) (steps : List Step) (tasks effects : List (String × Nat)) : Bool :=
  let result := journey source steps
  result.outcome == .committed && match observeStableState (lowerCheckedProcess source) result.state with
    | some observation =>
        sameElements (observation.openUserTasks.map fun entry => (entry.id.elementId.value, entry.id.activation)) tasks &&
          sameElements (observation.openEffects.map fun entry => (entry.id.elementId.value, entry.id.activation)) effects
    | none => false

def completes (source : CheckedProcess) (steps : List Step) : Bool :=
  let result := journey source steps
  result.outcome == .committed && result.state.control == .completed ⟨"I"⟩

/-- Applying `step` after `steps` is rejected and leaves the committed state unchanged. -/
def rejects (source : CheckedProcess) (steps : List Step) (step : Step) : Bool :=
  let before := journey source steps
  let after := applyStimulus scenarioClosureLimit (lowerCheckedProcess source) before.state (stimulus step)
  before.outcome == .committed && after.outcome == .rejected && after.state == before.state

def supplier_is_admitted : Bool := admitted supplier

def supplier_analyses_agree_on_its_burst : Bool := decide <| analyses supplier = (some 6, some 6)

def claim_is_admitted : Bool := admitted claim

def claim_analyses_agree_on_its_burst : Bool := decide <| analyses claim = (some 5, some 5)

/-- CSE-ADMIT-01: an effect completion cascading through three scope completions reaches the closure limit
exactly as the same model with a User Task does. -/
def service_task_burst_reaches_the_closure_limit : Bool := decide <|
    analyses (deepest service) = (some 8, some 8) && NestedScopeControl.checkedAnalysis (deepest task) = some 8

def service_task_burst_beyond_the_closure_limit_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis deepestForked = none

def service_task_with_input_mapping_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis (supplierWithScreen (screen [mapping] [] none)) = none

def service_task_with_output_mapping_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis (supplierWithScreen (screen [] [mapping] none)) = none

def service_task_with_error_route_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis (supplierWithScreen (screen [] [] (some errorRoute))) = none

def service_task_with_foreign_protocol_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis (supplierWithScreen (screen [] [] none "urn:other")) = none

/-- CSE-ADMIT-01: a Program carries a source overlay exactly when it has an effect. -/
def service_tasks_without_overlay_are_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis supplierSource = some 6 &&
      NestedScopeControl.programAnalysis (lowerCheckedProcess supplierSource) = none && !admitted supplierSource

def overlay_without_service_task_is_refused : Bool := decide <|
    analyses ConcurrentEmbeddedActivationsConformance.audit = (some 5, some 5) &&
      NestedScopeControl.programAnalysis (lowerCheckedProcess (withOverlay ConcurrentEmbeddedActivationsConformance.audit)) = none

def thirty_two_service_tasks_are_admitted : Bool := decide <| (NestedScopeControl.checkedAnalysis (serviceChain 32)).isSome

def thirty_three_service_tasks_are_refused : Bool := decide <| NestedScopeControl.checkedAnalysis (serviceChain 33) = none

/-- CSE-ADMIT-01: 16 merge-target Service Tasks weigh 32 and are admitted; 17 weigh 34 and are refused. -/
def merge_target_service_tasks_are_weighted : Bool := decide <|
    (NestedScopeControl.checkedAnalysis (weightedTarget 16)).isSome && NestedScopeControl.checkedAnalysis (weightedTarget 17) = none

def service_task_beside_a_call_is_refused : Bool := decide <|
    (NestedScopeControl.checkedAnalysis callerControl).isSome && NestedScopeControl.checkedAnalysis (caller service task) = none

def service_task_in_a_called_body_is_refused : Bool := decide <|
    NestedScopeControl.checkedAnalysis (caller task service) = none

/-- The guards of the Lean command-admission cascade ahead of the generic `completeEffect` arm all decline the
supplier Program, so its effect completions take that arm. -/
def profile_selects_the_generic_effect_completion : Bool :=
  let program := lowerCheckedProcess supplier
  !ParallelScopeStart.programSelected program && !sequentialScopeProgramSelected program &&
    program.identity.semanticProfile != mixedTaskBusinessErrorProfileId &&
    program.identity.semanticProfile != serialBusinessTaskProfileId &&
    program.identity.semanticProfile != mixedTaskControlFlowProfileId &&
    program.identity.semanticProfile != portableEffectDataProfileId && !nestedScopeDataProgram program

/-- CSE-ISOLATE-01: the human task completing first leaves both effects open and approval absent. -/
def supplier_review_first_leaves_both_effects_open : Bool :=
  opens supplier [.human "Review" 1] [] [("Screen", 1), ("Verify", 1)]

/-- CSE-ISOLATE-01: the join waits for the second effect in either order. -/
def supplier_join_waits_for_the_last_effect : Bool :=
  opens supplier [.human "Review" 1, .effect "Screen" 1] [] [("Verify", 1)] &&
    opens supplier [.human "Review" 1, .effect "Screen" 1, .effect "Verify" 1] [("Approve", 1)] [] &&
    opens supplier [.effect "Verify" 1, .effect "Screen" 1, .human "Review" 1] [("Approve", 1)] []

/-- CSE-QUIESCE-01: Activate is armed only after Onboard completes, and the Process completes after it. -/
def supplier_activates_after_onboard : Bool :=
  opens supplier [.effect "Verify" 1, .effect "Screen" 1, .human "Review" 1, .human "Approve" 1] [] [("Activate", 1)] &&
    completes supplier [.effect "Verify" 1, .effect "Screen" 1, .human "Review" 1, .human "Approve" 1, .effect "Activate" 1]

/-- Two live Assess occurrences hold Price damage activations 1 and 2 at once. -/
def claim_holds_two_price_effects : Bool :=
  opens claim [.human "Collect" 1, .effect "Fetch" 1] [] [("Price", 1), ("Price", 2)]

/-- CSE-ISOLATE-01: completing Price damage 2 opens Confirm in the second occurrence only. -/
def claim_price_two_leaves_price_one_open : Bool :=
  opens claim [.human "Collect" 1, .effect "Fetch" 1, .effect "Price" 2] [("Confirm", 1)] [("Price", 1)]

def claim_completes_after_both_assessments : Bool :=
  opens claim [.human "Collect" 1, .effect "Fetch" 1, .effect "Price" 2, .effect "Price" 1, .human "Confirm" 1,
    .human "Confirm" 2] [("Settle", 1)] [] &&
  completes claim [.human "Collect" 1, .effect "Fetch" 1, .effect "Price" 2, .effect "Price" 1, .human "Confirm" 1,
    .human "Confirm" 2, .human "Settle" 1]

/-- CSE-REFUSE-01: a repeated completion and one naming a never-armed activation are both rejected while Price
damage 1 is open. -/
def claim_rejects_stale_and_absent_effects : Bool :=
  let committed : List Step := [.human "Collect" 1, .effect "Fetch" 1, .effect "Price" 2]
  rejects claim committed (.effect "Price" 2) && rejects claim committed (.effect "Price" 3)

/-- Checked non-law of CSE-QUIESCE-01: an Assess occurrence owning only its Price damage wait, with no token
and no User Task, is not quiescent. -/
def effect_wait_alone_blocks_quiescence : Bool :=
  let state := (journey claim [.human "Collect" 1]).state
  let assess : ScopeOccurrenceId := { processInstanceId := ⟨"I"⟩, definitionScopeId := scope "A", activation := 1 }
  state.tokens.all (·.owner != assess) && state.waits.all (·.owner != assess) &&
    state.effectWaits.any (·.owner == assess) && !scopeQuiescent state assess

/-- Every executable check of this module, named for the driver's failure report. -/
def concurrentScopeServiceTasksConformanceChecks : List (String × Bool) := [
  ("supplier_is_admitted", supplier_is_admitted),
  ("supplier_analyses_agree_on_its_burst", supplier_analyses_agree_on_its_burst),
  ("claim_is_admitted", claim_is_admitted),
  ("claim_analyses_agree_on_its_burst", claim_analyses_agree_on_its_burst),
  ("service_task_burst_reaches_the_closure_limit", service_task_burst_reaches_the_closure_limit),
  ("service_task_burst_beyond_the_closure_limit_is_refused", service_task_burst_beyond_the_closure_limit_is_refused),
  ("service_task_with_input_mapping_is_refused", service_task_with_input_mapping_is_refused),
  ("service_task_with_output_mapping_is_refused", service_task_with_output_mapping_is_refused),
  ("service_task_with_error_route_is_refused", service_task_with_error_route_is_refused),
  ("service_task_with_foreign_protocol_is_refused", service_task_with_foreign_protocol_is_refused),
  ("service_tasks_without_overlay_are_refused", service_tasks_without_overlay_are_refused),
  ("overlay_without_service_task_is_refused", overlay_without_service_task_is_refused),
  ("thirty_two_service_tasks_are_admitted", thirty_two_service_tasks_are_admitted),
  ("thirty_three_service_tasks_are_refused", thirty_three_service_tasks_are_refused),
  ("merge_target_service_tasks_are_weighted", merge_target_service_tasks_are_weighted),
  ("service_task_beside_a_call_is_refused", service_task_beside_a_call_is_refused),
  ("service_task_in_a_called_body_is_refused", service_task_in_a_called_body_is_refused),
  ("profile_selects_the_generic_effect_completion", profile_selects_the_generic_effect_completion),
  ("supplier_review_first_leaves_both_effects_open", supplier_review_first_leaves_both_effects_open),
  ("supplier_join_waits_for_the_last_effect", supplier_join_waits_for_the_last_effect),
  ("supplier_activates_after_onboard", supplier_activates_after_onboard),
  ("claim_holds_two_price_effects", claim_holds_two_price_effects),
  ("claim_price_two_leaves_price_one_open", claim_price_two_leaves_price_one_open),
  ("claim_completes_after_both_assessments", claim_completes_after_both_assessments),
  ("claim_rejects_stale_and_absent_effects", claim_rejects_stale_and_absent_effects),
  ("effect_wait_alone_blocks_quiescence", effect_wait_alone_blocks_quiescence)
]

end BpmnSemantics.ConcurrentScopeServiceTasksConformance
