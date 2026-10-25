module

public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures

/-! Kernel-checked admission and lowering witnesses separate serial data handoff, branch intersection and nested closure bounds. They supplement the quantified composition obligations; they do not establish reachable execution laws. -/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.StructuredCompositionAdmissionConformance

open SemanticProcess StructuredCompositionFixtures

def serial_program_capability_admitted : Bool := decide <| programProfileCapabilitiesValid serialProgram = true

def serial_checked_capability_admitted : Bool := decide <| checkedProfileCapabilitiesValid serialChecked = true

def serial_checked_well_formed : Bool := decide <| checkedWellFormed serialChecked = true

def serial_program_well_formed : Bool := decide <| programWellFormed serialProgram = true

def serial_lowering_exact : Bool := decide <| lowerCheckedProcess serialChecked = serialProgram

def serial_start_requires_only_invoice : Bool := decide <| (StructuredComposition.programAnalysis serialProgram).map (·.required) =
    some ["Invoice"]

def serial_automatic_burst_is_two : Bool := decide <| (StructuredComposition.programAnalysis serialProgram).map (·.maximumBurst) =
    some 2

def aliasInput (input : DirectActivityDataInput) (variant : Nat) : DirectActivityDataInput :=
  match variant with
  | 0 => { input with targetDataInputId := "AssessInput" }
  | 2 => { input with associationId := "Assess" }
  | 3 => { input with source := .property "Assess" }
  | 4 => { input with associationId := "a" }
  | 5 => { input with source := .property "InvoiceProcess" }
  | _ => input

def aliasOutput (output : DirectActivityDataOutput) (variant : Nat) : DirectActivityDataOutput :=
  if variant == 1 then { output with sourceDataOutputId := "AssessOutput" } else output

def aliasedChecked (variant : Nat) : CheckedProcess :=
  { serialChecked with nodes := serialChecked.nodes.map fun node =>
      match node with
      | .dataInputOutputUserTask id name input output =>
          if id.value == "Archive" then
            .dataInputOutputUserTask id name (aliasInput input variant) (aliasOutput output variant)
          else node
      | _ => node }

def aliasedProgram (variant : Nat) : Program :=
  { serialProgram with operations := serialProgram.operations.map fun operation =>
      match operation with
      | .awaitDataInputOutputUserTask id origin input output task name directInput directOutput =>
          if task.value == "Archive" then
            .awaitDataInputOutputUserTask id origin input output task name
              (aliasInput directInput variant) (aliasOutput directOutput variant)
          else operation
      | _ => operation }

def cross_task_aliases_retain_exact_lowering : Bool := decide <|
    ([0, 1, 2, 3, 4, 5].all fun variant =>
      lowerCheckedProcess (aliasedChecked variant) == aliasedProgram variant) = true

def checked_cross_task_and_cross_role_aliases_rejected : Bool := decide <|
    ([0, 1, 2, 3, 4, 5].map fun variant => checkedWellFormed (aliasedChecked variant)) =
      [false, false, false, false, false, false]

def program_cross_task_and_cross_role_aliases_rejected : Bool := decide <|
    ([0, 1, 2, 3, 4, 5].map fun variant => programProfileCapabilitiesValid (aliasedProgram variant)) =
      [false, false, false, false, false, false]

def branched (allWrite : Bool) : List StructuredComposition.Vertex :=
  [ { id := "start", kind := .start, outputs := ["choice"] }
  , { id := "choice", kind := .choice, outputs := ["approve", "reject", "manual"] }
  , { id := "approve", kind := .task, outputs := ["merge"]
      reads := some "Invoice", writes := some "Decision" }
  , { id := "reject", kind := .task, outputs := ["merge"]
      reads := if allWrite then some "Invoice" else none
      writes := if allWrite then some "Decision" else none }
  , { id := "manual", kind := .task, outputs := ["merge"]
      reads := if allWrite then some "Invoice" else none
      writes := if allWrite then some "Decision" else none }
  , { id := "merge", kind := .merge, outputs := ["archive"] }
  , { id := "archive", kind := .task, outputs := ["end"]
      reads := some "Decision", writes := some "Receipt" }
  , { id := "end", kind := .finish, outputs := [] } ]

def one_branch_write_does_not_establish_availability : Bool := decide <| (StructuredComposition.analyze (branched false)).map (·.required) =
    some ["Decision", "Invoice"]

def every_branch_write_establishes_availability : Bool := decide <| (StructuredComposition.analyze (branched true)).map (·.required) =
    some ["Invoice"]

def declaration_reversal_preserves_requirements : Bool := decide <| (StructuredComposition.analyze (branched false).reverse).map (·.required) =
    some ["Decision", "Invoice"]

def nestedRegion : Nat → String → List StructuredComposition.Vertex
  | 0, _ => []
  | depth + 1, next =>
      let split := "split" ++ toString (depth + 1)
      let merge := "merge" ++ toString (depth + 1)
      let inner := if depth == 0 then merge else "split" ++ toString depth
      [ { id := split, kind := .choice, outputs := [merge, merge, inner] }
      , { id := merge, kind := .merge, outputs := [next] } ] ++ nestedRegion depth merge

def nested (depth : Nat) : List StructuredComposition.Vertex :=
  [{ id := "start", kind := .start, outputs := ["split" ++ toString depth] }] ++
    nestedRegion depth "task" ++
    [{ id := "task", kind := .task, outputs := ["end"] },
     { id := "end", kind := .finish, outputs := [] }]

def nested_empty_regions_reach_exact_bound : Bool := decide <| (StructuredComposition.analyze (nested 3)).map (·.maximumBurst) =
    some scenarioClosureLimit

def one_deeper_region_exceeds_bound : Bool := decide <| (StructuredComposition.analyze (nested 4)).map (·.maximumBurst) =
    some (scenarioClosureLimit + 2)

def nineStep : List StructuredComposition.Vertex := (nested 3).map fun vertex =>
  if vertex.id == "split3" then { vertex with outputs := ["task", "merge3", "split2"] }
  else if vertex.id == "merge3" then { vertex with outputs := ["end"] }
  else if vertex.id == "task" then { vertex with outputs := ["merge3"] }
  else vertex

def empty_route_reaches_exactly_nine_steps : Bool := decide <|
    (StructuredComposition.analyze nineStep).map (·.maximumBurst) = some 9

def exact_nine_step_route_exceeds_admission_limit : Bool := decide <|
    ((StructuredComposition.analyze nineStep).map fun analysis =>
      decide (analysis.maximumBurst ≤ scenarioClosureLimit)) = some false

def private_profile_refuses_explicit_scheduling : Bool := decide <| programProfileCapabilitiesValid
    { serialProgram with internalSchedulingMode := .requireChoiceSchedule } = false

def crossing : List StructuredComposition.Vertex :=
  [ { id := "start", kind := .start, outputs := ["outer"] }
  , { id := "outer", kind := .choice, outputs := ["inner", "a", "b"] }
  , { id := "inner", kind := .choice, outputs := ["c", "d", "e"] }
  , { id := "a", kind := .task, outputs := ["first"] }
  , { id := "b", kind := .task, outputs := ["second"] }
  , { id := "c", kind := .task, outputs := ["first"] }
  , { id := "d", kind := .task, outputs := ["first"] }
  , { id := "e", kind := .task, outputs := ["second"] }
  , { id := "first", kind := .merge, outputs := ["second"] }
  , { id := "second", kind := .merge, outputs := ["end"] }
  , { id := "end", kind := .finish, outputs := [] } ]

def crossed_regions_have_valid_local_arities : Bool := decide <|
    StructuredComposition.aritiesValid crossing = true

def crossed_regions_are_not_structured : Bool := decide <|
    StructuredComposition.analyze crossing = none

def composed_predecessor_profile_stays_single_task : Bool := decide <|
    programProfileCapabilitiesValid
      { serialProgram with identity :=
          { serialProgram.identity with semanticProfile := activityDataInputOutputUserTaskProfileId } } =
      false

def completion_identity_cannot_hide_excluded_operation : Bool := decide <|
    structuredCompositionProgramGraph
      { serialProgram with operations := serialProgram.operations ++
          [.duplicate ⟨"operation:complete-scope:scope:InvoiceProcess"⟩
            { elementId := ⟨"Unexpected"⟩ } ⟨"place:d"⟩ [⟨"place:a"⟩, ⟨"place:b"⟩]] } = false

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("serial_program_capability_admitted", serial_program_capability_admitted),
  ("serial_checked_capability_admitted", serial_checked_capability_admitted),
  ("serial_checked_well_formed", serial_checked_well_formed),
  ("serial_program_well_formed", serial_program_well_formed),
  ("serial_lowering_exact", serial_lowering_exact),
  ("serial_start_requires_only_invoice", serial_start_requires_only_invoice),
  ("serial_automatic_burst_is_two", serial_automatic_burst_is_two),
  ("cross_task_aliases_retain_exact_lowering", cross_task_aliases_retain_exact_lowering),
  ("checked_cross_task_and_cross_role_aliases_rejected", checked_cross_task_and_cross_role_aliases_rejected),
  ("program_cross_task_and_cross_role_aliases_rejected", program_cross_task_and_cross_role_aliases_rejected),
  ("one_branch_write_does_not_establish_availability", one_branch_write_does_not_establish_availability),
  ("every_branch_write_establishes_availability", every_branch_write_establishes_availability),
  ("declaration_reversal_preserves_requirements", declaration_reversal_preserves_requirements),
  ("nested_empty_regions_reach_exact_bound", nested_empty_regions_reach_exact_bound),
  ("one_deeper_region_exceeds_bound", one_deeper_region_exceeds_bound),
  ("empty_route_reaches_exactly_nine_steps", empty_route_reaches_exactly_nine_steps),
  ("exact_nine_step_route_exceeds_admission_limit", exact_nine_step_route_exceeds_admission_limit),
  ("private_profile_refuses_explicit_scheduling", private_profile_refuses_explicit_scheduling),
  ("crossed_regions_have_valid_local_arities", crossed_regions_have_valid_local_arities),
  ("crossed_regions_are_not_structured", crossed_regions_are_not_structured),
  ("composed_predecessor_profile_stays_single_task", composed_predecessor_profile_stays_single_task),
  ("completion_identity_cannot_hide_excluded_operation", completion_identity_cannot_hide_excluded_operation)
]

end BpmnSemantics.StructuredCompositionAdmissionConformance
