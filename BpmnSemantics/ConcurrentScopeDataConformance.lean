module

public import BpmnSemantics.ConcurrentScopeServiceTasksConformance

/-! # Concurrent scope data conformance

Finite witnesses of the data-bearing gate, CSD-ADMIT-01, CSD-VALUE-01, CSD-AVAILABLE-01 and the Start and
patch refusals of CSD-REFUSE-01 in the cumulative embedded completion profile. The Facility inspection
model transcribes the retained `scenarios/concurrent-scope-data` source model, and its expectations are the
TypeScript analysis's values for the same graph; the serial review model carries the value refusals. Each
refused model differs from an admitted control in the one fact its name states; see the
[concurrent scope data proposal](../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md#separating-witnesses).
-/

@[expose] public section

namespace BpmnSemantics.ConcurrentScopeDataConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance
  (build node start finish fork join task sub scope admitted analyses taskId)
open BpmnSemantics.ConcurrentScopeServiceTasksConformance (activityProtocol withOverlay supplier supplierWithScreen screen)
open BpmnSemantics.RepeatedNestedConcurrentCallsConformance (call)

def literal (target value : String) : VariableMapping := { target, expression := .stringLiteral value }
def enclosing (target name : String) : VariableMapping := { target, expression := .enclosingVariable name }
def copied (target name : String) : VariableMapping := { target, expression := .localVariable name }

def declare (owner : String) (inputs : List VariableMapping) (outputs : List VariableMapping := []) : ScopeLocalData :=
  { scopeId := scope owner, localInputs := inputs, localOutputs := outputs }

def withData (records : List ScopeLocalData) (source : CheckedProcess) : CheckedProcess :=
  { source with scopeLocalData := records }

def text (length : Nat) (character : Char := 'a') : VariableValue := .string (String.ofList (List.replicate length character))

/-- Summarize, mapping the inspection findings and both check results. -/
def summarize (owner : String) := node owner (.serviceTask ⟨"Summarize"⟩
  { protocol := activityProtocol, operation := "inspectionSummary" }
  [enclosing "electricalResult" "electricalResult", enclosing "findings" "findings", enclosing "fireResult" "fireResult"]
  [] none)

/-- Facility inspection: root `P` runs Inspection `N`, which declares `findings` and `result` and forks
straight into Electrical check `E` and Fire safety check `F` before Summarize. `E` shadows `result` with a
literal and `F` reads `fireInput`; each outputs its `result` to a name no enclosing scope declares. -/
def facilityWith (fireInput : VariableMapping) (inspection : List VariableMapping := [literal "findings" "open", literal "result" "none"]) :
    CheckedProcess :=
  withData [ declare "E" [literal "result" "pending-electrical"] [copied "electricalResult" "result"]
           , declare "F" [fireInput] [copied "fireResult" "result"], declare "N" inspection ] <|
  withOverlay <| build [("P", none), ("N", some "P"), ("E", some "N"), ("F", some "N")]
    [ start "P" "PA", sub "P" "N", finish "P" "Z"
    , start "N" "NA", fork "N" "NF", sub "N" "E", sub "N" "F", join "N" "NJ", summarize "N", finish "N" "NZ"
    , start "E" "EA", task "E" "RecordE", finish "E" "EZ", start "F" "FA", task "F" "RecordF", finish "F" "FZ" ]
    [ ("PA", "N"), ("N", "Z"), ("NA", "NF"), ("NF", "E"), ("NF", "F"), ("E", "NJ"), ("F", "NJ"), ("NJ", "Summarize")
    , ("Summarize", "NZ"), ("EA", "RecordE"), ("RecordE", "EZ"), ("FA", "RecordF"), ("RecordF", "FZ") ]

def facility : CheckedProcess := facilityWith (enclosing "result" "result")

/-- Review: root `P` runs Sub-Process `S`, which declares `claim` from the Process and holds one User Task. -/
def review : CheckedProcess :=
  withData [declare "S" [enclosing "claim" "claim"]] <|
  build [("P", none), ("S", some "P")]
    [start "P" "PA", sub "P" "S", finish "P" "Z", start "S" "SA", task "S" "Review", finish "S" "SZ"]
    [("PA", "S"), ("S", "Z"), ("SA", "Review"), ("Review", "SZ")]

/-- A caller root calling `K` before running `S`, whose body holds one User Task; `records` declares on `S`. -/
def callerBeside (records : List ScopeLocalData) : CheckedProcess :=
  withData records <| build [("P", none), ("S", some "P"), ("K", none)]
    [ start "P" "PA", call "P" "Invoke" "K", sub "P" "S", finish "P" "Z", start "S" "SA", task "S" "T"
    , finish "S" "SZ", start "K" "KA", task "K" "Called", finish "K" "KZ" ]
    [ ("PA", "Invoke"), ("Invoke", "S"), ("S", "Z"), ("SA", "T"), ("T", "SZ"), ("KA", "Called"), ("Called", "KZ") ]

def facility_is_admitted : Bool := admitted facility

def facility_analyses_agree_on_its_burst : Bool := decide <| analyses facility = (some 7, some 7)

/-- CSD-AVAILABLE-01: Summarize reads both check outputs after the join without a Start binding. -/
def facility_requires_no_start_name : Bool := decide <|
  NestedScopeControl.checkedStartNames facility = some [] &&
    NestedScopeControl.programStartNames (lowerCheckedProcess facility) = some []

/-- CSD-AVAILABLE-01: a write in one fork branch is never available in its sibling. -/
def sibling_output_read_is_a_required_start_name : Bool := decide <|
  let sibling := facilityWith (enclosing "result" "electricalResult")
  NestedScopeControl.checkedStartNames sibling = some ["electricalResult"] &&
    NestedScopeControl.programStartNames (lowerCheckedProcess sibling) = some ["electricalResult"]

/-- The gate: a declaration or a mapped Service Task makes an embedded completion Program data-bearing, and
only then does it select the bounded String policy. -/
def data_bearing_gate_selects_the_bounded_string_policy : Bool :=
  let declaring := lowerCheckedProcess facility
  let mapped := lowerCheckedProcess (supplierWithScreen (screen [] [copied "screening" "screening"] none))
  let free := lowerCheckedProcess supplier
  nestedScopeDataProgram declaring && programEffectMappingValuePolicy declaring == .boundedString &&
    nestedScopeDataProgram mapped && programEffectMappingValuePolicy mapped == .boundedString &&
    !nestedScopeDataProgram free && programEffectMappingValuePolicy free == .scalar

/-- CSD-ADMIT-01: a Service Task that only maps an output is admitted as data. -/
def mapped_service_task_is_admitted_as_data : Bool :=
  admitted (supplierWithScreen (screen [] [copied "screening" "screening"] none))

def bounded_string_counts_utf8_bytes_and_keeps_null_present : Bool :=
  [true, false].all fun allowNull =>
    let admits := EffectMappingValuePolicy.boundedString.admits allowNull
    admits (text 1024) && !admits (text 1025) && admits (text 512 'é') && !admits (text 513 'é') &&
      admits .null && !admits (.boolean true) && !admits (.map [])

/-- CSD-ADMIT-01: the data-free caller is admitted, and one declaration beside its Call refuses it. -/
def call_beside_data_is_refused : Bool := decide <|
  (NestedScopeControl.checkedAnalysis (callerBeside [])).isSome &&
    NestedScopeControl.checkedAnalysis (callerBeside [declare "S" [literal "x" "v"]]) = none

def overlong_literal_is_refused : Bool := decide <|
  let literalOf := fun (length : Nat) => facilityWith (enclosing "result" "result")
    [literal "findings" (String.ofList (List.replicate length 'a')), literal "result" "none"]
  (NestedScopeControl.checkedAnalysis (literalOf 1024)).isSome && NestedScopeControl.checkedAnalysis (literalOf 1025) = none

def ninth_declaration_is_refused : Bool := decide <|
  let declaring := fun (count : Nat) => facilityWith (enclosing "result" "result")
    ((List.range count).map (fun index => literal ("extra" ++ toString index) "x") ++
      [literal "findings" "open", literal "result" "none"])
  (NestedScopeControl.checkedAnalysis (declaring 6)).isSome && NestedScopeControl.checkedAnalysis (declaring 7) = none

def startWith (bindings : List VariableBinding) : StimulusResult :=
  applyStimulus scenarioClosureLimit (lowerCheckedProcess review) initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ bindings)

def completeReview (before : RuntimeState) (values : List VariableBinding) : StimulusResult :=
  applyStimulus scenarioClosureLimit (lowerCheckedProcess review) before
    (.completeUserTaskInstance ⟨"Review#1"⟩ (taskId "Review" 1) values)

/-- CSD-AVAILABLE-01 and CSD-VALUE-01 at Start: the required name must be present, a present null counts,
and an over-long String or a Boolean is rejected. -/
def review_start_requires_a_bounded_claim : Bool :=
  (startWith []).outcome == .rejected && (startWith [⟨"claim", text 1025⟩]).outcome == .rejected &&
    (startWith [⟨"claim", .boolean true⟩]).outcome == .rejected &&
    (startWith [⟨"claim", .null⟩]).outcome == .committed && (startWith [⟨"claim", text 1024⟩]).outcome == .committed

/-- NSD-INIT-01 through the gate: Review's frame holds the Start value. -/
def review_frame_holds_the_start_value : Bool :=
  let started := startWith [⟨"claim", .string "c"⟩]
  started.outcome == .committed && started.state.variables.scopes.any fun frame =>
    frame.owner.definitionScopeId == scope "S" && frame.bindings == [⟨"claim", .string "c"⟩]

/-- CSD-REFUSE-01: an out-of-domain or undeclared patch is rejected with the state unchanged, and a
1,024-byte one commits. -/
def review_patch_is_bounded_and_declared : Bool :=
  let started := (startWith [⟨"claim", .string "c"⟩]).state
  let refused := fun (values : List VariableBinding) =>
    let result := completeReview started values
    result.outcome == .rejected && result.state == started
  refused [⟨"claim", .boolean true⟩] && refused [⟨"claim", text 1025⟩] && refused [⟨"other", .string "x"⟩] &&
    (completeReview started [⟨"claim", text 1024⟩]).outcome == .committed

/-- Every executable check of this module, named for the driver's failure report. -/
def concurrentScopeDataConformanceChecks : List (String × Bool) := [
  ("facility_is_admitted", facility_is_admitted),
  ("facility_analyses_agree_on_its_burst", facility_analyses_agree_on_its_burst),
  ("facility_requires_no_start_name", facility_requires_no_start_name),
  ("sibling_output_read_is_a_required_start_name", sibling_output_read_is_a_required_start_name),
  ("data_bearing_gate_selects_the_bounded_string_policy", data_bearing_gate_selects_the_bounded_string_policy),
  ("mapped_service_task_is_admitted_as_data", mapped_service_task_is_admitted_as_data),
  ("bounded_string_counts_utf8_bytes_and_keeps_null_present", bounded_string_counts_utf8_bytes_and_keeps_null_present),
  ("call_beside_data_is_refused", call_beside_data_is_refused),
  ("overlong_literal_is_refused", overlong_literal_is_refused),
  ("ninth_declaration_is_refused", ninth_declaration_is_refused),
  ("review_start_requires_a_bounded_claim", review_start_requires_a_bounded_claim),
  ("review_frame_holds_the_start_value", review_frame_holds_the_start_value),
  ("review_patch_is_bounded_and_declared", review_patch_is_bounded_and_declared)
]

end BpmnSemantics.ConcurrentScopeDataConformance
