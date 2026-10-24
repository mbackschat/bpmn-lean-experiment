module

public import BpmnSemantics.SemanticProcess.ParallelScopeBatchReadinessProofs
public import BpmnSemantics.SemanticProcess.ParallelScopeReservationProvenanceProofs

/-! # Actual reservation anchor uniqueness

PMIS-SELECT-01 allocates strictly increasing slots within each shared
family/element cohort. PMIS-ADMIT-01 separates Human and Service source keys.
Together these facts make the actual reservation result's wait anchors unique
before collective batch acceptance, without a runtime-reachability premise.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics ParallelScopeStart

def ReservedArmDeclared (program : Program) (arm : InternalArmingPatch) : Prop :=
  match arm.write with
  | .userTask wait => ∃ id origin input output,
      SemanticOperation.awaitUserTask id origin input output wait.task ∈ program.operations
  | .effect wait _ => ∃ id origin input output effect route,
      SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations ∧
        effect.elementId = wait.elementId
  | _ => False

private theorem prepared_arm_declared (program : Program) (state : RuntimeState)
    (arm : InternalArmingPatch)
    (prepared : prepareReservedOccurrenceArm? program state
      ⟨arm.operation.id, arm.owner⟩ arm.write.occurrence.activation = some arm) :
    ReservedArmDeclared program arm := by
  obtain ⟨runtimeId, operation, input, _, _, _, resolved, _, _, _, _, _, _, shape, _, _⟩ :=
    ParallelScopeReplay.prepareReservedOccurrenceArm_gate_provenance program state _ _ arm prepared
  have member := (resolveInternalOperationOccurrence_declaration program state _ operation resolved).1
  cases operation <;> simp only [ParallelScopeReplay.ReservedArmWriteShape] at shape <;> try contradiction
  case awaitUserTask id origin input output task =>
    unfold ReservedArmDeclared
    rw [shape]
    exact ⟨_, _, _, _, member⟩
  case awaitEffect id origin input output effect route =>
    obtain ⟨arguments, _, write⟩ := shape
    unfold ReservedArmDeclared
    rw [write]
    exact ⟨_, _, _, _, _, _, member, rfl⟩

private theorem declared_human_effect_keys (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (human : UserTaskWait) (service : EffectWait)
    (humanDeclaration : ∃ id origin input output,
      SemanticOperation.awaitUserTask id origin input output human.task ∈ program.operations)
    (serviceDeclaration : ∃ id origin input output effect route,
      SemanticOperation.awaitEffect id origin input output effect route ∈ program.operations ∧
        effect.elementId = service.elementId) : human.task.id.value ≠ service.elementId.value := by
  obtain ⟨humanId, humanOrigin, humanInput, humanOutput, humanMember⟩ := humanDeclaration
  obtain ⟨effectId, effectOrigin, effectInput, effectOutput, effect, route, effectMember, elementEq⟩ := serviceDeclaration
  have separate := analyzeProgram_human_effect_keys_disjoint program analysis analyzed humanId effectId
    humanOrigin effectOrigin humanInput humanOutput effectInput effectOutput human.task effect route humanMember effectMember
  simpa only [elementEq] using separate

def ReservedSlotsBounded (state : RuntimeState) (reserved : List InternalOccurrencePatch) : Prop :=
  ∀ arm, .arm arm ∈ reserved → match arm.write with
    | .userTask wait => wait.activation ≤ activationCount state wait.task.id +
        reservedCohortSize reserved .userTask wait.task.id.value
    | .effect wait _ => wait.activation ≤ effectActivationCount state wait.elementId +
        reservedCohortSize reserved .effect wait.elementId.value
    | _ => False

private theorem cohort_append_monotone (reserved : List InternalOccurrencePatch)
    (member : InternalOccurrencePatch) (kind : InternalWaitKind) (element : String) :
    reservedCohortSize reserved kind element ≤ reservedCohortSize (reserved ++ [member]) kind element := by
  simp only [reservedCohortSize, List.filter_append, List.length_append]
  omega

private theorem reservation_step_slots_bounded (program : Program) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence)
    (member : InternalOccurrencePatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [member]))
    (bounded : ReservedSlotsBounded state reserved) : ReservedSlotsBounded state (reserved ++ [member]) := by
  intro arm present
  rcases List.mem_append.mp present with old | fresh
  · have bound := bounded arm old
    cases write : arm.write with
    | userTask wait =>
        change wait.activation ≤ activationCount state wait.task.id +
          reservedCohortSize (reserved ++ [member]) .userTask wait.task.id.value
        have prior : wait.activation ≤ activationCount state wait.task.id +
            reservedCohortSize reserved .userTask wait.task.id.value := by simpa only [write] using bound
        exact Nat.le_trans prior (Nat.add_le_add_left (cohort_append_monotone reserved member .userTask wait.task.id.value) _)
    | effect wait bindings =>
        change wait.activation ≤ effectActivationCount state wait.elementId +
          reservedCohortSize (reserved ++ [member]) .effect wait.elementId.value
        have prior : wait.activation ≤ effectActivationCount state wait.elementId +
            reservedCohortSize reserved .effect wait.elementId.value := by simpa only [write] using bound
        exact Nat.le_trans prior (Nat.add_le_add_left (cohort_append_monotone reserved member .effect wait.elementId.value) _)
    | message | timer => simp only [write] at bound
  · have same : member = .arm arm := (List.mem_singleton.mp fresh).symm
    subst member
    have allocated := singleton_reservation_arm_allocation program state reserved candidate arm step
    cases write : arm.write with
    | userTask wait =>
        have count : reservedCohortSize (reserved ++ [.arm arm]) .userTask wait.task.id.value =
            reservedCohortSize reserved .userTask wait.task.id.value + 1 := by
          simp [reservedCohortSize, List.filter_append, write, InternalArmingWrite.kind, InternalArmingWrite.elementId]
        simp only [write] at allocated ⊢
        rw [count]
        omega
    | effect wait bindings =>
        have count : reservedCohortSize (reserved ++ [.arm arm]) .effect wait.elementId.value =
            reservedCohortSize reserved .effect wait.elementId.value + 1 := by
          simp [reservedCohortSize, List.filter_append, write, InternalArmingWrite.kind, InternalArmingWrite.elementId]
        simp only [write] at allocated ⊢
        rw [count]
        omega
    | message | timer => simp only [write] at allocated

private theorem reservation_step_anchor_fresh (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (reserved : List InternalOccurrencePatch) (candidate : InternalOperationOccurrence) (arm : InternalArmingPatch)
    (step : reserveOccurrenceMembers? program state reserved [candidate] = some (reserved ++ [.arm arm]))
    (declared : ∀ prior, .arm prior ∈ reserved → ReservedArmDeclared program prior)
    (newDeclared : ReservedArmDeclared program arm) (bounded : ReservedSlotsBounded state reserved) :
    arm.write.occurrence ∉ reserved.filterMap (·.waitOccurrence?) := by
  intro present
  obtain ⟨member, memberPresent, projected⟩ := List.mem_filterMap.mp present
  cases member with
  | token patch => simp [InternalOccurrencePatch.waitOccurrence?] at projected
  | arm prior =>
      have anchorEq : prior.write.occurrence = arm.write.occurrence := Option.some.inj projected
      have priorDeclared := declared prior memberPresent
      have bound := bounded prior memberPresent
      have allocated := singleton_reservation_arm_allocation program state reserved candidate arm step
      cases newWrite : arm.write with
      | userTask newWait =>
          simp only [newWrite] at allocated
          simp only [ReservedArmDeclared, newWrite] at newDeclared
          cases priorWrite : prior.write with
          | userTask priorWait =>
              rw [priorWrite, newWrite] at anchorEq
              have keyEq : priorWait.task.id = newWait.task.id :=
                congrArg TaskDefinitionId.mk (congrArg SemanticId.value (congrArg OccurrenceId.elementId anchorEq))
              have activationEq : priorWait.activation = newWait.activation := congrArg OccurrenceId.activation anchorEq
              have priorBound : priorWait.activation ≤ activationCount state priorWait.task.id +
                  reservedCohortSize reserved .userTask priorWait.task.id.value := by simpa only [priorWrite] using bound
              rw [keyEq, activationEq] at priorBound
              omega
          | effect priorWait bindings =>
              simp only [ReservedArmDeclared, priorWrite] at priorDeclared
              have separate := declared_human_effect_keys program analysis analyzed newWait priorWait newDeclared priorDeclared
              rw [priorWrite, newWrite] at anchorEq
              have same : priorWait.elementId.value = newWait.task.id.value :=
                congrArg (fun id : OccurrenceId => id.elementId.value) anchorEq
              exact separate same.symm
          | message | timer => simp only [ReservedArmDeclared, priorWrite] at priorDeclared
      | effect newWait bindings =>
          simp only [newWrite] at allocated
          simp only [ReservedArmDeclared, newWrite] at newDeclared
          cases priorWrite : prior.write with
          | userTask priorWait =>
              simp only [ReservedArmDeclared, priorWrite] at priorDeclared
              have separate := declared_human_effect_keys program analysis analyzed priorWait newWait priorDeclared newDeclared
              rw [priorWrite, newWrite] at anchorEq
              have same : priorWait.task.id.value = newWait.elementId.value :=
                congrArg (fun id : OccurrenceId => id.elementId.value) anchorEq
              exact separate same
          | effect priorWait priorBindings =>
              rw [priorWrite, newWrite] at anchorEq
              have keyEq : priorWait.elementId = newWait.elementId :=
                congrArg NodeId.mk (congrArg SemanticId.value (congrArg OccurrenceId.elementId anchorEq))
              have activationEq : priorWait.activation = newWait.activation := congrArg OccurrenceId.activation anchorEq
              have priorBound : priorWait.activation ≤ effectActivationCount state priorWait.elementId +
                  reservedCohortSize reserved .effect priorWait.elementId.value := by simpa only [priorWrite] using bound
              rw [keyEq, activationEq] at priorBound
              omega
          | message | timer => simp only [ReservedArmDeclared, priorWrite] at priorDeclared
      | message | timer => simp only [newWrite] at allocated

private theorem reservation_trace_initial_subset (program : Program) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) : reserved ⊆ members := by
  induction trace with
  | nil => exact fun _ member => member
  | cons step tail ih =>
      intro member present
      exact ih (List.mem_append_left _ present)

private theorem reservation_trace_anchors_unique (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (reserved members : List InternalOccurrencePatch) (candidates : List InternalOperationOccurrence)
    (trace : OccurrenceReservationTrace program state reserved candidates members) :
    (∀ arm, .arm arm ∈ members → ReservedArmDeclared program arm) →
      (reserved.filterMap (·.waitOccurrence?)).Nodup → ReservedSlotsBounded state reserved →
        (members.filterMap (·.waitOccurrence?)).Nodup := by
  induction trace with
  | nil => intro _ unique _; exact unique
  | @cons reserved candidate rest current final step tail ih =>
      intro declared unique bounded
      have included := reservation_trace_initial_subset program state (reserved ++ [current]) final rest tail
      have prefixDeclared : ∀ arm, .arm arm ∈ reserved → ReservedArmDeclared program arm :=
        fun arm present => declared arm (included (List.mem_append_left _ present))
      have nextUnique : ((reserved ++ [current]).filterMap (·.waitOccurrence?)).Nodup := by
        rw [List.filterMap_append]
        cases current with
        | token patch => simpa only [List.filterMap_cons, InternalOccurrencePatch.waitOccurrence?, List.filterMap_nil, List.append_nil] using unique
        | arm arm =>
            have fresh := reservation_step_anchor_fresh program analysis analyzed state reserved candidate arm step
              prefixDeclared (declared arm (included (by simp))) bounded
            simp only [List.filterMap_cons, InternalOccurrencePatch.waitOccurrence?, List.filterMap_nil]
            apply List.nodup_append.mpr
            refine ⟨unique, by simp, ?_⟩
            intro old oldMember new newMember same
            have identity : new = arm.write.occurrence := List.mem_singleton.mp newMember
            exact fresh ((same.trans identity) ▸ oldMember)
      exact ih declared nextUnique (reservation_step_slots_bounded program state reserved candidate current step bounded)

/-- Actual member reservation issues unique wait anchors through shared cohort slots and admitted Human/Service identity separation, before batch acceptance. -/
theorem reserved_members_wait_anchors_unique (program : Program) (analysis : ProgramAnalysis)
    (analyzed : analyzeProgram program = some analysis) (state : RuntimeState)
    (candidates : List InternalOperationOccurrence) (members : List InternalOccurrencePatch)
    (reserved : reserveOccurrenceMembers? program state [] candidates = some members) :
    (members.filterMap (·.waitOccurrence?)).Nodup := by
  have trace := reserveOccurrenceMembers_trace program state [] candidates members reserved
  have declared : ∀ arm, .arm arm ∈ members → ReservedArmDeclared program arm := by
    intro arm present
    obtain ⟨_, prepared⟩ := (trace.arm_prepared program state [] members candidates arm present).resolve_left (by simp)
    exact prepared_arm_declared program state arm prepared
  exact reservation_trace_anchors_unique program analysis analyzed state [] members candidates trace declared
    (by simp) (by intro arm present; simp at present)

end BpmnSemantics.SemanticProcess.InternalCommutation
