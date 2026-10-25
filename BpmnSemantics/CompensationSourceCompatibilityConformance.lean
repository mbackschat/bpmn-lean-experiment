module

public import BpmnSemantics.CompensationSourceLoweringFixtures
public import BpmnSemantics.SemanticProcess.CompensationStartDataAdmission

/-! # Compensation source compatibility conformance

The checkpoint-only profile's String value-kind cell, exact Program-derived start binding, prospective downstream capacities, and every physically absent legacy declaration are decided independently of the larger admission fixtures.
-/

@[expose] public section

namespace BpmnSemantics.CompensationSourceLoweringConformance

open BpmnSemantics.SemanticProcess

def checkpoint_process_value_domain_leaves_empty_patch_to_program_admission : Bool := decide <|
    processDataBindingsAdmitted compensationSourceCheckpointProfileId .processStart [] = true

def checkpoint_process_start_accepts_the_selected_string_kind : Bool := decide <|
    processDataBindingsAdmitted compensationSourceCheckpointProfileId .processStart
      [{ name := "Property_TravelDetails", value := .string "value" }] = true

def checkpoint_process_start_rejects_an_unselected_kind : Bool := decide <|
    processDataBindingsAdmitted compensationSourceCheckpointProfileId .processStart
      [{ name := "Property_TravelDetails", value := .boolean true }] = false

def admittedStartBindings : List VariableBinding :=
  [{ name := "Property_TravelDetails", value := .string "frozen itinerary" }]

def checkpoint_start_admission_is_program_derived_and_exact : Bool := decide <|
    compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩
        admittedStartBindings = true ∧
      compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩ [] = false ∧
      compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩
        [{ name := "DataInput_TravelDetails", value := .string "frozen itinerary" }] = false ∧
      compensationStartDataAdmitted swappedRestoredBindingProgram ⟨"CompensationStart_1"⟩
        [{ name := "DataInput_TravelDetails", value := .string "frozen itinerary" }] = true

def checkpoint_start_admission_rejects_extra_duplicate_and_wrong_kind : Bool := decide <|
    compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩
        (admittedStartBindings ++ [{ name := "Unrelated", value := .string "extra" }]) = false ∧
      compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩
        (admittedStartBindings ++ admittedStartBindings) = false ∧
      compensationStartDataAdmitted expectedProgram ⟨"CompensationStart_1"⟩
        [{ name := "Property_TravelDetails", value := .null }] = false

def repeatAscii (count : Nat) : String := String.ofList (List.replicate count 'a')

def startCapacityBytes (instanceId : SemanticId) (value : String) : Nat × Nat :=
  match projectCompensationStartCapacity? expectedProgram instanceId
      [{ name := "Property_TravelDetails", value := .string value }] with
  | some projection =>
      (projection.snapshotCanonicalBytes, projection.executionCanonicalBytes)
  | none => (0, 0)

def withStartCapacityLimits (snapshotBytes executionBytes : Nat) : Program :=
  let withSnapshot := mutateSnapshotLimits 1 snapshotBytes
  match withSnapshot.compensationExecution with
  | none => withSnapshot
  | some declaration =>
      { withSnapshot with
        compensationExecution := some
          { declaration with
            limits := { declaration.limits with maxCanonicalBytes := executionBytes } } }

def checkpointStart (instanceId : SemanticId) (bindings : List VariableBinding) : Stimulus :=
  .startProcess ⟨"start-command"⟩ ⟨processId.value⟩ instanceId bindings

def checkpoint_start_capacity_accepts_exact_encoder_counts_and_rejects_one_under : Bool := decide <|
    let bytes := startCapacityBytes ⟨"ShortCapacity_1"⟩ "short value"
    let bindings :=
      [{ name := "Property_TravelDetails", value := .string "short value" }]
    let stimulus := checkpointStart ⟨"ShortCapacity_1"⟩ bindings
    let exact := admitStimulusWithCompensationSnapshots
      (withStartCapacityLimits bytes.1 bytes.2) initialState stimulus
    let snapshotOneUnder := admitStimulusWithCompensationSnapshots
      (withStartCapacityLimits (bytes.1 - 1) bytes.2) initialState stimulus
    let executionOneUnder := admitStimulusWithCompensationSnapshots
      (withStartCapacityLimits bytes.1 (bytes.2 - 1)) initialState stimulus
    exact.outcome = .committed ∧
      exact.state.variables.process.bindings = bindings ∧
      snapshotOneUnder.outcome = .rejected ∧
      snapshotOneUnder.state = initialState ∧
      executionOneUnder.outcome = .rejected ∧
      executionOneUnder.state = initialState

def checkpoint_start_capacity_uses_escaped_and_multibyte_canonical_json_bytes : Bool := decide <|
    startCapacityBytes ⟨"Escaped_\"\\_1"⟩ "quote=\" slash=\\ newline=\n" = (706, 3273) ∧
      startCapacityBytes ⟨"Multibyte_雪_1"⟩ "旅程-雪-🚆" = (697, 3267)

def direct_command_admission_installs_the_exact_patch_and_preserves_empty_refusal : Bool := decide <|
    (admitStimulusWithCompensationSnapshots expectedProgram initialState
        (checkpointStart ⟨"CompensationStart_1"⟩ admittedStartBindings)).outcome = .committed ∧
      (admitStimulusWithCompensationSnapshots expectedProgram initialState
        (checkpointStart ⟨"CompensationStart_1"⟩ admittedStartBindings)).state.variables.process.bindings =
          admittedStartBindings ∧
      (admitStimulusWithCompensationSnapshots expectedProgram initialState
        (checkpointStart ⟨"CompensationStart_1"⟩ [])).outcome = .rejected ∧
      (admitStimulusWithCompensationSnapshots expectedProgram initialState
        (checkpointStart ⟨"CompensationStart_1"⟩ [])).state = initialState

def old_checked_process_omits_compensation : Bool := decide <|
    oldCheckedProcess.compensation = none

def old_lowering_omits_compensation_retention : Bool := decide <|
    (lowerCheckedProcess oldCheckedProcess).compensationActivityRetention = none

def old_lowering_omits_compensation_snapshots : Bool := decide <|
    (lowerCheckedProcess oldCheckedProcess).compensationEventSubProcessSnapshots = none

def old_lowering_omits_compensation_execution : Bool := decide <|
    (lowerCheckedProcess oldCheckedProcess).compensationExecution = none

/-- Every executable check of this module, named for the driver's failure report. -/
def compensationSourceCompatibilityConformanceChecks : List (String × Bool) := [
  ("checkpoint_process_value_domain_leaves_empty_patch_to_program_admission", checkpoint_process_value_domain_leaves_empty_patch_to_program_admission),
  ("checkpoint_process_start_accepts_the_selected_string_kind", checkpoint_process_start_accepts_the_selected_string_kind),
  ("checkpoint_process_start_rejects_an_unselected_kind", checkpoint_process_start_rejects_an_unselected_kind),
  ("checkpoint_start_admission_is_program_derived_and_exact", checkpoint_start_admission_is_program_derived_and_exact),
  ("checkpoint_start_admission_rejects_extra_duplicate_and_wrong_kind", checkpoint_start_admission_rejects_extra_duplicate_and_wrong_kind),
  ("checkpoint_start_capacity_accepts_exact_encoder_counts_and_rejects_one_under", checkpoint_start_capacity_accepts_exact_encoder_counts_and_rejects_one_under),
  ("checkpoint_start_capacity_uses_escaped_and_multibyte_canonical_json_bytes", checkpoint_start_capacity_uses_escaped_and_multibyte_canonical_json_bytes),
  ("direct_command_admission_installs_the_exact_patch_and_preserves_empty_refusal", direct_command_admission_installs_the_exact_patch_and_preserves_empty_refusal),
  ("old_checked_process_omits_compensation", old_checked_process_omits_compensation),
  ("old_lowering_omits_compensation_retention", old_lowering_omits_compensation_retention),
  ("old_lowering_omits_compensation_snapshots", old_lowering_omits_compensation_snapshots),
  ("old_lowering_omits_compensation_execution", old_lowering_omits_compensation_execution)
]

end BpmnSemantics.CompensationSourceLoweringConformance
