module

import BpmnSemantics.SemanticProcess.ParallelScopeReservationProvenanceProofs
public import BpmnSemantics.SemanticProcess.InternalOperationOccurrence
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceUserTaskProgramValidity
import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacityProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionAdmissionProofs

/-! # Declared Human and Service anchor freshness

PMIS-ADMIT-01 excludes Message and Timer declarations and separates Human from
Service source keys. RSI-BIND-04 applies those facts to hosting-instance waits;
the reservation bounds then exclude any ordinal above the issuing family's counter.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open ParallelScopeStart

private theorem owned_declarer_member (program : Program)
    (declarers : List SemanticOperation) (owner : ScopeOccurrenceId)
    (declared : declaredByExactlyOneOwnedOperation program declarers owner = true) :
    ∃ operation, operation ∈ declarers := by
  cases declarers with
  | nil => simp [declaredByExactlyOneOwnedOperation] at declared
  | cons operation rest =>
      cases rest with
      | nil => exact ⟨operation, by simp⟩
      | cons other rest => simp [declaredByExactlyOneOwnedOperation] at declared

private theorem admitted_human_declarer (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (taskId : TaskDefinitionId)
    (owner : ScopeOccurrenceId)
    (declared : declaredByExactlyOneOwnedOperation program (userTaskWaitDeclarers program taskId) owner = true) :
    ∃ id origin input output task,
      SemanticOperation.awaitUserTask id origin input output task ∈ program.operations ∧ task.id = taskId := by
  obtain ⟨operation, member⟩ := owned_declarer_member program _ owner declared
  obtain ⟨member, family⟩ := List.mem_filter.mp member
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  cases operation <;>
    simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed] at allowed <;>
    simp only [] at family <;> try contradiction
  case awaitUserTask =>
    exact ⟨_, _, _, _, _, member, of_decide_eq_true family⟩

private theorem admitted_effect_declarer (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (elementId : NodeId)
    (owner : ScopeOccurrenceId)
    (declared : declaredByExactlyOneOwnedOperation program (effectWaitDeclarers program elementId) owner = true) :
    ∃ id origin input output effect route,
      SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations ∧
      effect.elementId = elementId := by
  obtain ⟨operation, member⟩ := owned_declarer_member program _ owner declared
  obtain ⟨member, family⟩ := List.mem_filter.mp member
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  cases operation <;>
    simp only [programOperationAllowed, SequentialScopeProgram.operationAllowed] at allowed <;>
    simp only [] at family <;> try contradiction
  case awaitEffect =>
    refine ⟨_, _, _, _, _, _, member, ?_⟩
    exact (eq_of_beq (Bool.and_eq_true_iff.mp allowed).2).trans (of_decide_eq_true family)

private theorem admitted_message_declarers_empty (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (elementId : NodeId) :
    messageWaitDeclarers program elementId = [] := by
  unfold messageWaitDeclarers
  apply List.filter_eq_nil_iff.mpr
  intro operation member
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  cases operation <;> simp_all [programOperationAllowed, SequentialScopeProgram.operationAllowed]

private theorem admitted_timer_declarers_empty (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) (elementId : NodeId) :
    timerWaitDeclarers program elementId = [] := by
  unfold timerWaitDeclarers
  apply List.filter_eq_nil_iff.mpr
  intro operation member
  have allowed := List.all_eq_true.mp (analyzeProgram_incidence_admission program analysis admitted).2.2 operation member
  cases operation <;> simp_all [programOperationAllowed, SequentialScopeProgram.operationAllowed]

private theorem human_wait_bounded (before : RuntimeState)
    (valid : occurrenceReservationStateValid before = true) (wait : UserTaskWait)
    (member : wait ∈ before.waits) : wait.activation ≤ activationCount before wait.task.id := by
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid
  have bounded := List.all_eq_true.mp valid.1.1.2 wait member
  simp only [userTaskWaitOccurrence, Bool.and_eq_true] at bounded
  exact of_decide_eq_true bounded.2

private theorem effect_anchor_bounded (before : RuntimeState)
    (valid : occurrenceReservationStateValid before = true) (id : OccurrenceId)
    (member : id ∈ before.effectWaits.map effectWaitOccurrence ++
      before.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait)) :
    id.activation ≤ effectActivationCount before ⟨id.elementId.value⟩ := by
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid
  have bounded := List.all_eq_true.mp valid.1.2 id (by
    simp only [List.mem_append, or_assoc] at member ⊢
    exact member.elim Or.inl (fun present => Or.inr (Or.inl present)))
  simp only [Bool.and_eq_true, decide_eq_true_eq] at bounded
  exact bounded.2

private theorem openWaitAnchorAbsent_of_families (before : RuntimeState) (id : OccurrenceId)
    (humans : ∀ wait ∈ before.waits, userTaskWaitOccurrence wait ≠ id)
    (messages : ∀ wait ∈ before.messageWaits, messageWaitOccurrence wait ≠ id)
    (timers : ∀ wait ∈ before.timerWaits, timerWaitOccurrence wait ≠ id)
    (effects : ∀ wait ∈ before.effectWaits, effectWaitOccurrence wait ≠ id)
    (incidents : ∀ incident ∈ before.effectIncidents, effectWaitOccurrence incident.wait ≠ id) :
    openWaitAnchorAbsent before id = true := by
  have absent : id ∉ openWaitAnchors before := by
    intro member
    simp only [openWaitAnchors, List.mem_append, List.mem_map, or_assoc] at member
    rcases member with ⟨wait, member, same⟩ | ⟨wait, member, same⟩ | ⟨wait, member, same⟩ |
      ⟨wait, member, same⟩ | ⟨incident, member, same⟩
    · exact humans wait member same
    · exact messages wait member same
    · exact timers wait member same
    · exact effects wait member same
    · exact incidents incident member same
  simpa [openWaitAnchorAbsent, List.contains_eq_mem] using absent

private theorem human_effect_key_separation (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (humanId : OperationId) (humanOrigin : BpmnElementOrigin) (humanInput humanOutput : ControlPlaceId)
    (task : UserTaskDefinition)
    (human : SemanticOperation.awaitUserTask humanId humanOrigin humanInput humanOutput task ∈ program.operations)
    (wait : EffectWait)
    (declared : declaredByExactlyOneOwnedOperation program (effectWaitDeclarers program wait.elementId) wait.owner = true) :
    task.id.value ≠ wait.elementId.value := by
  obtain ⟨id, origin, input, output, effect, route, member, aligned⟩ :=
    admitted_effect_declarer program analysis admitted wait.elementId wait.owner declared
  rw [← aligned]
  exact analyzeProgram_human_effect_keys_disjoint program analysis admitted
    humanId id humanOrigin origin humanInput humanOutput input output task effect route human member

private theorem effect_human_key_separation (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis)
    (effectId : OperationId) (effectOrigin : BpmnElementOrigin) (effectInput effectOutput : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (service : SemanticOperation.awaitEffect effectId effectOrigin effectInput effectOutput effect route ∈ program.operations)
    (wait : UserTaskWait)
    (declared : declaredByExactlyOneOwnedOperation program (userTaskWaitDeclarers program wait.task.id) wait.owner = true) :
    wait.task.id.value ≠ effect.elementId.value := by
  obtain ⟨id, origin, input, output, task, member, aligned⟩ :=
    admitted_human_declarer program analysis admitted wait.task.id wait.owner declared
  rw [← aligned]
  exact analyzeProgram_human_effect_keys_disjoint program analysis admitted
    id effectId origin effectOrigin input output effectInput effectOutput task effect route member service

/-- Admission and canonical hosting declarations close every retained-family collision above the Human counter. -/
theorem openWaitAnchorAbsent_human_above_counter
    (program : Program) (analysis : ProgramAnalysis) (before : RuntimeState)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition) (activation : Nat)
    (admitted : analyzeProgram program = some analysis)
    (reservationValid : occurrenceReservationStateValid before = true)
    (declarations : waitDeclarationsValid program hosting before = true)
    (hostingEq : owner.processInstanceId = hosting)
    (human : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations)
    (above : activationCount before task.id < activation) :
    openWaitAnchorAbsent before
      ⟨owner.processInstanceId, ⟨task.id.value⟩, activation⟩ = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations
  apply openWaitAnchorAbsent_of_families
  · intro wait member same
    have sameKey : wait.task.id = task.id :=
      congrArg TaskDefinitionId.mk (congrArg SemanticId.value (congrArg OccurrenceId.elementId same))
    have sameActivation := congrArg OccurrenceId.activation same
    have bounded := human_wait_bounded before reservationValid wait member
    change wait.activation = activation at sameActivation
    rw [sameKey, sameActivation] at bounded
    exact Nat.not_le_of_lt above bounded
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [messageWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.1.1.2 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    simp [admitted_message_declarers_empty program analysis admitted, declaredByExactlyOneOwnedOperation] at declared
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [timerWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.1.2 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    simp [admitted_timer_declarers_empty program analysis admitted, declaredByExactlyOneOwnedOperation] at declared
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [effectWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.2 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    have different := human_effect_key_separation program analysis admitted id origin input output task human wait declared
    exact different (congrArg SemanticId.value (congrArg OccurrenceId.elementId same)).symm
  · intro incident member same
    have hosted : incident.wait.processInstanceId = hosting := by
      simpa only [effectWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.2 incident
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    have different := human_effect_key_separation program analysis admitted id origin input output task human incident.wait declared
    exact different (congrArg SemanticId.value (congrArg OccurrenceId.elementId same)).symm

/-- Every Service ordinal above its counter is fresh across all open families, including Effect incidents. -/
theorem openWaitAnchorAbsent_effect_above_counter
    (program : Program) (analysis : ProgramAnalysis) (before : RuntimeState)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute) (activation : Nat)
    (admitted : analyzeProgram program = some analysis)
    (reservationValid : occurrenceReservationStateValid before = true)
    (declarations : waitDeclarationsValid program hosting before = true)
    (hostingEq : owner.processInstanceId = hosting)
    (service : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations)
    (above : effectActivationCount before effect.elementId < activation) :
    openWaitAnchorAbsent before
      ⟨owner.processInstanceId, ⟨effect.elementId.value⟩, activation⟩ = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations
  apply openWaitAnchorAbsent_of_families
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [userTaskWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.1.1.1 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    have different := effect_human_key_separation program analysis admitted id origin input output effect route service wait declared
    exact different (congrArg SemanticId.value (congrArg OccurrenceId.elementId same))
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [messageWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.1.1.2 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    simp [admitted_message_declarers_empty program analysis admitted, declaredByExactlyOneOwnedOperation] at declared
  · intro wait member same
    have hosted : wait.processInstanceId = hosting := by
      simpa only [timerWaitOccurrence, hostingEq] using congrArg OccurrenceId.processInstanceId same
    have declared := List.all_eq_true.mp declarations.1.1.2 wait
      (List.mem_filter.mpr ⟨member, by simp [hosted]⟩)
    simp [admitted_timer_declarers_empty program analysis admitted, declaredByExactlyOneOwnedOperation] at declared
  · intro wait member same
    have member' : effectWaitOccurrence wait ∈ before.effectWaits.map effectWaitOccurrence ++
        before.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) := by
      exact List.mem_append_left _ (List.mem_map.mpr ⟨wait, member, rfl⟩)
    have bounded := effect_anchor_bounded before reservationValid _ member'
    rw [same] at bounded
    exact Nat.not_le_of_lt above bounded
  · intro incident member same
    have member' : effectWaitOccurrence incident.wait ∈ before.effectWaits.map effectWaitOccurrence ++
        before.effectIncidents.map (fun incident => effectWaitOccurrence incident.wait) := by
      exact List.mem_append_right _ (List.mem_map.mpr ⟨incident, member, rfl⟩)
    have bounded := effect_anchor_bounded before reservationValid _ member'
    rw [same] at bounded
    exact Nat.not_le_of_lt above bounded

/-- The native next Human ordinal specializes the general bound-based freshness law. -/
theorem openWaitAnchorAbsent_human_next
    (program : Program) (analysis : ProgramAnalysis) (before : RuntimeState)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (task : UserTaskDefinition)
    (admitted : analyzeProgram program = some analysis)
    (reservationValid : occurrenceReservationStateValid before = true)
    (declarations : waitDeclarationsValid program hosting before = true)
    (hostingEq : owner.processInstanceId = hosting)
    (human : SemanticOperation.awaitUserTask id origin input output task ∈ program.operations) :
    openWaitAnchorAbsent before
      ⟨owner.processInstanceId, ⟨task.id.value⟩, activationCount before task.id + 1⟩ = true :=
  openWaitAnchorAbsent_human_above_counter program analysis before hosting owner id origin input output task
    (activationCount before task.id + 1) admitted reservationValid declarations hostingEq human (Nat.lt_succ_self _)

/-- The native next Service ordinal specializes the general bound-based freshness law. -/
theorem openWaitAnchorAbsent_effect_next
    (program : Program) (analysis : ProgramAnalysis) (before : RuntimeState)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (admitted : analyzeProgram program = some analysis)
    (reservationValid : occurrenceReservationStateValid before = true)
    (declarations : waitDeclarationsValid program hosting before = true)
    (hostingEq : owner.processInstanceId = hosting)
    (service : SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations) :
    openWaitAnchorAbsent before
      ⟨owner.processInstanceId, ⟨effect.elementId.value⟩, effectActivationCount before effect.elementId + 1⟩ = true :=
  openWaitAnchorAbsent_effect_above_counter program analysis before hosting owner id origin input output effect route
    (effectActivationCount before effect.elementId + 1) admitted reservationValid declarations hostingEq service (Nat.lt_succ_self _)

/-- The reservation frame census excludes every Effect-local owner above its native counter; Activity-local owners never match an Effect write. -/
theorem effect_write_available_above_counter (before : RuntimeState) (wait : EffectWait)
    (bindings : List VariableBinding)
    (valid : occurrenceReservationStateValid before = true)
    (above : effectActivationCount before wait.elementId < wait.activation) :
    (InternalArmingWrite.effect wait bindings).available before = true := by
  simp only [occurrenceReservationStateValid, Bool.and_eq_true] at valid
  have absent : before.variables.activities.any (activityScopeMatches (effectWaitOccurrence wait)) = false := by
    apply List.any_eq_false.mpr
    intro frame member matched
    have same : LocalDataOwner.effectOccurrence (effectWaitOccurrence wait) = frame.owner := by
      simpa only [activityScopeMatches, localDataOwnerMatches, decide_eq_true_eq] using matched
    have bounded := List.all_eq_true.mp valid.2 frame member
    rw [← same] at bounded
    simp only [effectWaitOccurrence, Bool.and_eq_true] at bounded
    exact Nat.not_le_of_lt above (of_decide_eq_true bounded.2)
  simp only [InternalArmingWrite.available, absent, Bool.not_false]

end BpmnSemantics.SemanticProcess.InternalCommutation
