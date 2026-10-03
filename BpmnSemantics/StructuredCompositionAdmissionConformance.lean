import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures

/-! Kernel-checked admission and lowering witnesses separate serial data handoff, branch intersection and nested closure bounds. They supplement the quantified composition obligations; they do not establish reachable execution laws. -/

set_option Elab.async false

namespace BpmnSemantics.StructuredCompositionAdmissionConformance

open SemanticProcess StructuredCompositionFixtures

theorem serial_program_capability_admitted : programProfileCapabilitiesValid serialProgram = true := by decide +kernel

theorem serial_checked_capability_admitted : checkedProfileCapabilitiesValid serialChecked = true := by decide +kernel

theorem serial_checked_well_formed : checkedWellFormed serialChecked = true := by decide +kernel

theorem serial_program_well_formed : programWellFormed serialProgram = true := by decide +kernel

theorem serial_lowering_exact : lowerCheckedProcess serialChecked = serialProgram := by decide +kernel

theorem serial_start_requires_only_invoice : (StructuredComposition.programAnalysis serialProgram).map (·.required) =
    some ["Invoice"] := by decide +kernel

theorem serial_automatic_burst_is_two : (StructuredComposition.programAnalysis serialProgram).map (·.maximumBurst) =
    some 2 := by decide +kernel

private def aliasInput (input : DirectActivityDataInput) (variant : Nat) : DirectActivityDataInput :=
  match variant with
  | 0 => { input with targetDataInputId := "AssessInput" }
  | 2 => { input with associationId := "Assess" }
  | 3 => { input with sourcePropertyId := "Assess" }
  | 4 => { input with associationId := "a" }
  | 5 => { input with sourcePropertyId := "InvoiceProcess" }
  | _ => input

private def aliasOutput (output : DirectActivityDataOutput) (variant : Nat) : DirectActivityDataOutput :=
  if variant == 1 then { output with sourceDataOutputId := "AssessOutput" } else output

private def aliasedChecked (variant : Nat) : CheckedProcess :=
  { serialChecked with nodes := serialChecked.nodes.map fun node =>
      match node with
      | .dataInputOutputUserTask id name input output =>
          if id.value == "Archive" then
            .dataInputOutputUserTask id name (aliasInput input variant) (aliasOutput output variant)
          else node
      | _ => node }

private def aliasedProgram (variant : Nat) : Program :=
  { serialProgram with operations := serialProgram.operations.map fun operation =>
      match operation with
      | .awaitDataInputOutputUserTask id origin input output task name directInput directOutput =>
          if task.value == "Archive" then
            .awaitDataInputOutputUserTask id origin input output task name
              (aliasInput directInput variant) (aliasOutput directOutput variant)
          else operation
      | _ => operation }

theorem cross_task_aliases_retain_exact_lowering :
    ([0, 1, 2, 3, 4, 5].all fun variant =>
      lowerCheckedProcess (aliasedChecked variant) == aliasedProgram variant) = true := by decide +kernel

theorem checked_cross_task_and_cross_role_aliases_rejected :
    ([0, 1, 2, 3, 4, 5].map fun variant => checkedWellFormed (aliasedChecked variant)) =
      [false, false, false, false, false, false] := by decide +kernel

theorem program_cross_task_and_cross_role_aliases_rejected :
    ([0, 1, 2, 3, 4, 5].map fun variant => programProfileCapabilitiesValid (aliasedProgram variant)) =
      [false, false, false, false, false, false] := by decide +kernel

private def branched (allWrite : Bool) : List StructuredComposition.Vertex :=
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

theorem one_branch_write_does_not_establish_availability : (StructuredComposition.analyze (branched false)).map (·.required) =
    some ["Decision", "Invoice"] := by decide +kernel

theorem every_branch_write_establishes_availability : (StructuredComposition.analyze (branched true)).map (·.required) =
    some ["Invoice"] := by decide +kernel

theorem declaration_reversal_preserves_requirements : (StructuredComposition.analyze (branched false).reverse).map (·.required) =
    some ["Decision", "Invoice"] := by decide +kernel

private def nestedRegion : Nat → String → List StructuredComposition.Vertex
  | 0, _ => []
  | depth + 1, next =>
      let split := "split" ++ toString (depth + 1)
      let merge := "merge" ++ toString (depth + 1)
      let inner := if depth == 0 then merge else "split" ++ toString depth
      [ { id := split, kind := .choice, outputs := [merge, merge, inner] }
      , { id := merge, kind := .merge, outputs := [next] } ] ++ nestedRegion depth merge

private def nested (depth : Nat) : List StructuredComposition.Vertex :=
  [{ id := "start", kind := .start, outputs := ["split" ++ toString depth] }] ++
    nestedRegion depth "task" ++
    [{ id := "task", kind := .task, outputs := ["end"] },
     { id := "end", kind := .finish, outputs := [] }]

theorem nested_empty_regions_reach_exact_bound : (StructuredComposition.analyze (nested 3)).map (·.maximumBurst) =
    some scenarioClosureLimit := by decide +kernel

theorem one_deeper_region_exceeds_bound : (StructuredComposition.analyze (nested 4)).map (·.maximumBurst) =
    some (scenarioClosureLimit + 2) := by decide +kernel

private def nineStep : List StructuredComposition.Vertex := (nested 3).map fun vertex =>
  if vertex.id == "split3" then { vertex with outputs := ["task", "merge3", "split2"] }
  else if vertex.id == "merge3" then { vertex with outputs := ["end"] }
  else if vertex.id == "task" then { vertex with outputs := ["merge3"] }
  else vertex

theorem empty_route_reaches_exactly_nine_steps :
    (StructuredComposition.analyze nineStep).map (·.maximumBurst) = some 9 := by decide +kernel

theorem exact_nine_step_route_exceeds_admission_limit :
    ((StructuredComposition.analyze nineStep).map fun analysis =>
      decide (analysis.maximumBurst ≤ scenarioClosureLimit)) = some false := by decide +kernel

theorem private_profile_refuses_explicit_scheduling : programProfileCapabilitiesValid
    { serialProgram with internalSchedulingMode := .requireChoiceSchedule } = false := by decide +kernel

private def crossing : List StructuredComposition.Vertex :=
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

theorem crossed_regions_have_valid_local_arities :
    StructuredComposition.aritiesValid crossing = true := by decide +kernel

theorem crossed_regions_are_not_structured :
    StructuredComposition.analyze crossing = none := by decide +kernel

theorem composed_predecessor_profile_stays_single_task :
    programProfileCapabilitiesValid
      { serialProgram with identity :=
          { serialProgram.identity with semanticProfile := activityDataInputOutputUserTaskProfileId } } =
      false := by decide +kernel

theorem completion_identity_cannot_hide_excluded_operation :
    structuredCompositionProgramGraph
      { serialProgram with operations := serialProgram.operations ++
          [.duplicate ⟨"operation:complete-scope:scope:InvoiceProcess"⟩
            { elementId := ⟨"Unexpected"⟩ } ⟨"place:d"⟩ [⟨"place:a"⟩, ⟨"place:b"⟩]] } = false := by
  decide +kernel

end BpmnSemantics.StructuredCompositionAdmissionConformance
