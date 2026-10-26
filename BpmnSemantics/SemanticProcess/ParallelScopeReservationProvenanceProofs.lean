module

import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs
import BpmnSemantics.SemanticProcess.ProgramStructuralValidationLaws
public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity

/-! # Admitted reservation identity provenance

PMIS-ADMIT-01 separates source identities across Human and Service declarations.
Reservation validity alone does not bind arbitrary retained waits to those
declarations; these laws supply the Program side of that reachable-state obligation.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

/-- Source identity admission separates families as well as operations within one family. -/
theorem analyzeProgram_source_nodes_unique (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) :
    (program.operations.filterMap (fun operation => match operation with
      | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
      | _ => SequentialScopeProgram.sourceNode? operation)).Nodup := by
  let key : SemanticOperation → Option String := fun operation => match operation with
    | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
    | _ => SequentialScopeProgram.sourceNode? operation
  change (program.operations.filterMap key).Nodup
  have fromGuard (source : SemanticOperation → Option String)
      (checked : (program.processId.value :: program.controlPlaces.map (·.origin.elementId.value) ++
        program.operations.filterMap source).eraseDups.length =
        (program.processId.value :: program.controlPlaces.map (·.origin.elementId.value) ++
        program.operations.filterMap source).length)
      (same : source = key) : (program.operations.filterMap key).Nodup := by
    rw [same] at checked
    have unique := StructuredComposition.equal_deduplicated_length_has_unique_names _ checked
    exact (List.nodup_append.mp (List.nodup_cons.mp unique).2).2.1
  unfold analyzeProgram at admitted
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  try dsimp only at admitted
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  split at admitted <;> try contradiction
  try dsimp only at admitted
  split at admitted <;> try contradiction
  rename_i checked
  simp only [bne_iff_ne, Classical.not_not] at checked
  exact fromGuard _ checked (by funext operation; cases operation <;> rfl)

private theorem filterMap_key_unique {α β : Type} (values : List α) (key : α → Option β)
    (unique : (values.filterMap key).Nodup) (left right : α) (value : β)
    (leftMember : left ∈ values) (rightMember : right ∈ values)
    (leftKey : key left = some value) (rightKey : key right = some value) : left = right := by
  induction values with
  | nil => simp at leftMember
  | cons head tail ih =>
      rcases List.mem_cons.mp leftMember with rfl | tailLeft
      · rcases List.mem_cons.mp rightMember with rfl | tailRight
        · rfl
        · simp only [List.filterMap_cons, leftKey] at unique
          exact False.elim ((List.nodup_cons.mp unique).1 (List.mem_filterMap.mpr ⟨right, tailRight, rightKey⟩))
      · rcases List.mem_cons.mp rightMember with rfl | tailRight
        · simp only [List.filterMap_cons, rightKey] at unique
          exact False.elim ((List.nodup_cons.mp unique).1 (List.mem_filterMap.mpr ⟨left, tailLeft, leftKey⟩))
        · have tailUnique : (tail.filterMap key).Nodup := by
            cases found : key head with
            | none => simpa only [List.filterMap_cons, found] using unique
            | some value => exact (List.nodup_cons.mp (by simpa only [List.filterMap_cons, found] using unique)).2
          exact ih tailUnique tailLeft tailRight

private theorem admitted_source_filter_singleton (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (operation : SemanticOperation)
    (value : String) (member : operation ∈ program.operations)
    (operationKey : (match operation with
      | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
      | _ => SequentialScopeProgram.sourceNode? operation) = some value)
    (predicate : SemanticOperation → Bool) (matched : predicate operation = true)
    (matchingKey : ∀ candidate ∈ program.operations, predicate candidate = true →
      (match candidate with
        | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
        | _ => SequentialScopeProgram.sourceNode? candidate) = some value) :
    program.operations.filter predicate = [operation] := by
  let key : SemanticOperation → Option String := fun candidate => match candidate with
    | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
    | _ => SequentialScopeProgram.sourceNode? candidate
  have normalizedOperationKey : key operation = some value := by
    cases operation <;> exact operationKey
  have same : program.operations.filter predicate =
      program.operations.filter (fun candidate => decide (candidate = operation)) := by
    apply List.filter_congr
    intro candidate included
    cases selected : predicate candidate with
    | false =>
        have different : candidate ≠ operation := by
          rintro rfl
          rw [matched] at selected
          contradiction
        simp [different]
    | true =>
        have normalizedCandidateKey : key candidate = some value := by
          have candidateKey := matchingKey candidate included selected
          cases candidate <;> exact candidateKey
        have identical := filterMap_key_unique program.operations key
          (analyzeProgram_source_nodes_unique program analysis admitted) operation candidate value
          member included normalizedOperationKey normalizedCandidateKey
        subst candidate
        simp
  have unique := strictlySortedStrings_nodup _ (programWellFormed_operationIdsSorted program
    (analyzeProgram_incidence_admission program analysis admitted).1)
  have operationsUnique : program.operations.Nodup :=
    List.Pairwise.of_map (S := (· ≠ ·)) (fun candidate : SemanticOperation => candidate.id.value)
      (fun _ _ different equal => different (congrArg (fun candidate : SemanticOperation => candidate.id.value) equal)) unique
  rw [same]
  exact filter_key_eq_singleton_of_nodup program.operations (fun candidate => candidate) operation
    (by simpa using operationsUnique) member

/-- PMIS-ADMIT-01 source uniqueness closes the full Human declaration census, including excluded declaration constructors. -/
theorem analyzeProgram_human_uniqueFamilyDeclarer (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (human : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations) :
    InternalCommutation.uniqueFamilyDeclarer? program (.awaitUserTask id origin input output task)
      .userTask ⟨task.id.value⟩ = true := by
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 _ human
  simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed, Bool.and_eq_true,
    beq_iff_eq] at allowed
  have singleton : userTaskWaitDeclarers program task.id = [.awaitUserTask id origin input output task] := by
    unfold userTaskWaitDeclarers
    apply admitted_source_filter_singleton program analysis admitted
      (.awaitUserTask id origin input output task) origin.elementId.value human rfl
    · simp
    · intro candidate included matched
      have permitted := List.all_eq_true.mp
        (analyzeProgram_incidence_admission program analysis admitted).2.2 candidate included
      cases candidate <;>
        simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed] at permitted <;>
        simp only [] at matched <;> try contradiction
      case awaitUserTask candidateId candidateOrigin candidateInput candidateOutput candidateTask =>
        simp only [Bool.and_eq_true, beq_iff_eq] at permitted
        have sameTask : candidateTask.id = task.id := of_decide_eq_true matched
        change some candidateOrigin.elementId.value = some origin.elementId.value
        rw [← permitted.2, sameTask, allowed.2]
  simpa only [InternalCommutation.uniqueFamilyDeclarer?, decide_eq_true_eq] using singleton

/-- PMIS-ADMIT-01 aligns Service payload and source identities before closing the full Effect declaration census. -/
theorem analyzeProgram_effect_uniqueFamilyDeclarer (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (service : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations) :
    InternalCommutation.uniqueFamilyDeclarer? program (.awaitEffect id origin input output effect route)
      .effect effect.elementId = true := by
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 _ service
  simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed, Bool.and_eq_true,
    beq_iff_eq] at allowed
  have singleton : effectWaitDeclarers program effect.elementId = [.awaitEffect id origin input output effect route] := by
    unfold effectWaitDeclarers
    apply admitted_source_filter_singleton program analysis admitted
      (.awaitEffect id origin input output effect route) effect.elementId.value service
      (by simpa only [SequentialScopeProgram.sourceNode?] using
        congrArg (fun element : NodeId => some element.value) allowed.2.symm)
    · simp [allowed.2]
    · intro candidate included matched
      cases candidate <;> simp only [] at matched <;> try contradiction
      case awaitEffect candidateId candidateOrigin candidateInput candidateOutput candidateEffect candidateRoute =>
        change some candidateOrigin.elementId.value = some effect.elementId.value
        exact congrArg (fun element : NodeId => some element.value) (of_decide_eq_true matched)
  simpa only [InternalCommutation.uniqueFamilyDeclarer?, decide_eq_true_eq] using singleton

/-- Human and Service counters have separate namespaces, but admitted source identities prevent their published wait anchors from sharing an element key. -/
theorem analyzeProgram_human_effect_keys_disjoint (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (humanId effectId : OperationId) (humanOrigin effectOrigin : BpmnElementOrigin)
    (humanInput humanOutput effectInput effectOutput : ControlPlaceId)
    (task : UserTaskDefinition) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (human : SemanticOperation.awaitUserTask humanId humanOrigin humanInput humanOutput task ∈ program.operations)
    (service : SemanticOperation.awaitEffect effectId effectOrigin effectInput effectOutput effect route ∈ program.operations) :
    task.id.value ≠ effect.elementId.value := by
  have allowed := (analyzeProgram_incidence_admission program analysis admitted).2.2
  have humanAllowed := List.all_eq_true.mp allowed _ human
  have effectAllowed := List.all_eq_true.mp allowed _ service
  simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed, Bool.and_eq_true,
    beq_iff_eq] at humanAllowed effectAllowed
  intro same
  have origins : humanOrigin.elementId.value = effectOrigin.elementId.value := by
    rw [← humanAllowed.2, same, effectAllowed.2]
  have identical := filterMap_key_unique program.operations
    (fun operation => match operation with
      | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
      | _ => SequentialScopeProgram.sourceNode? operation)
    (analyzeProgram_source_nodes_unique program analysis admitted) _ _ humanOrigin.elementId.value
    human service rfl (by simp only [SequentialScopeProgram.sourceNode?, origins])
  contradiction

end BpmnSemantics.SemanticProcess.ParallelScopeStart

namespace BpmnSemantics.SemanticProcess.InternalCommutation

def collisionOwner : ScopeOccurrenceId := ⟨⟨"instance"⟩, ⟨"root"⟩, 1⟩
def collisionTask : UserTaskDefinition := ⟨⟨"shared"⟩, none, none⟩
def timerCollisionState : RuntimeState := { initialState with
  timerWaits := [⟨⟨"instance"⟩, collisionOwner, ⟨"shared"⟩, 1, 0, ⟨"output"⟩⟩] }
def humanCollisionState : RuntimeState := { initialState with
  waits := [⟨⟨"instance"⟩, collisionOwner, collisionTask, 1, ⟨"output"⟩, none⟩]
  activations := [⟨⟨"shared"⟩, 1⟩] }

/-- Reservation validity alone admits a Timer anchor that collides with raw Human issuance; this deliberately makes no Start-reachability claim. -/
theorem reservation_validity_does_not_imply_human_anchor_freshness :
    occurrenceReservationStateValid timerCollisionState = true ∧
      occurrenceReservationStateValid (activateUserTask timerCollisionState ⟨"instance"⟩ collisionOwner
        ⟨"input"⟩ ⟨"output"⟩ collisionTask) = false := by
  decide +kernel

/-- Separate Human and Effect counters do not separate their untagged anchor keys without declaration provenance. -/
theorem reservation_validity_does_not_imply_effect_anchor_freshness :
    occurrenceReservationStateValid humanCollisionState = true ∧
      occurrenceReservationStateValid (activateEffect humanCollisionState ⟨"instance"⟩ collisionOwner
        ⟨"input"⟩ ⟨"output"⟩ ⟨⟨"shared"⟩, ⟨"activity", "probe"⟩, [], []⟩ none []) = false := by
  decide +kernel

end BpmnSemantics.SemanticProcess.InternalCommutation
