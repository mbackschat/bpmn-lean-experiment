import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore

/-! # Flow-node occurrence Effect Program validity

This module owns immutable-Program correspondence for Effect waits and incidents together with the private exact bijection between Effect occurrences and Activity-local variable scopes. It does not define Effect execution or incident transitions.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open FlowNodeOccurrenceProgramValidity.Internal

private def effectWaitValid (program : Program) (state : RuntimeState)
    (wait : EffectWait) : Bool :=
  occurrenceOwnerValid state wait.processInstanceId wait.owner wait.elementId wait.activation &&
    (program.operations.filter fun operation =>
      if !operationOwnedBy program operation wait.owner then false
      else match operation with
      | .awaitEffect _ _ _ output effect route =>
          effect.elementId = wait.elementId && effect.descriptor = wait.descriptor &&
            evaluateInputMappings effect.inputMappings = some wait.arguments &&
            effect.outputMappings = wait.outputMappings && output = wait.output &&
            route = wait.bpmnErrorRoute
      | _ => false).length = 1

private def effectLocalScopesExact (state : RuntimeState) : Bool :=
  let waits := state.effectWaits ++ state.effectIncidents.map (·.wait)
  waits.all (fun wait =>
      (waits.filter fun candidate => decide
        (effectWaitOccurrenceId candidate = effectWaitOccurrenceId wait)).length = 1 &&
      match state.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId wait)) with
      | [activity] => activity.bindings = wait.arguments
      | _ => false) &&
    state.variables.activities.all fun activity =>
      (waits.filter fun wait => activityScopeMatches (effectWaitOccurrenceId wait) activity).length = 1

/-- Program correspondence and exact Activity-local scope ownership for Effect waits and incidents. -/
def flowNodeOccurrenceEffectProgramValidity (program : Program) (state : RuntimeState) : Bool :=
  state.effectWaits.all (effectWaitValid program state) &&
    state.effectIncidents.all (fun incident => effectWaitValid program state incident.wait) &&
    effectLocalScopesExact state

theorem flowNodeOccurrenceEffectProgramValidity_frame (program : Program)
    (before after : RuntimeState)
    (scopes : after.scopeOccurrences = before.scopeOccurrences)
    (waits : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = before.effectIncidents)
    (activities : after.variables.activities = before.variables.activities) :
    flowNodeOccurrenceEffectProgramValidity program after =
      flowNodeOccurrenceEffectProgramValidity program before := by
  have waitValidEq : effectWaitValid program after = effectWaitValid program before := by
    funext wait
    unfold effectWaitValid occurrenceOwnerValid flowNodeOccurrenceOwnerLiveUnique
    rw [scopes]
  have localScopesEq : effectLocalScopesExact after = effectLocalScopesExact before := by
    unfold effectLocalScopesExact
    rw [waits, incidents, activities]
  simp [flowNodeOccurrenceEffectProgramValidity, waits, incidents, waitValidEq, localScopesEq]

/-- Every Effect wait and incident stores the same process identity as its live owner. -/
theorem flowNodeOccurrenceEffectProgramValidity_wait_owner_ids (program : Program)
    (state : RuntimeState) (valid : flowNodeOccurrenceEffectProgramValidity program state = true) :
    (∀ wait ∈ state.effectWaits, wait.processInstanceId = wait.owner.processInstanceId) ∧
    (∀ incident ∈ state.effectIncidents,
      incident.wait.processInstanceId = incident.wait.owner.processInstanceId) := by
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true,
    List.all_eq_true] at valid
  refine ⟨?_, ?_⟩
  · intro wait member
    have waitValid := valid.1.1 wait member
    simp [effectWaitValid, occurrenceOwnerValid] at waitValid
    exact waitValid.1.1.2
  · intro incident member
    have waitValid := valid.1.2 incident member
    simp [effectWaitValid, occurrenceOwnerValid] at waitValid
    exact waitValid.1.1.2

private theorem activityScopeMatches_inserted_ne (left right : EffectOccurrenceId)
    (bindings : List VariableBinding) (different : left ≠ right) :
    activityScopeMatches left
      { owner := .effectOccurrence right, bindings } = false := by
  apply Bool.eq_false_iff.mpr
  intro matched
  apply different
  simp only [activityScopeMatches, localDataOwnerMatches,
    decide_eq_true_eq] at matched
  rcases left with ⟨⟨leftProcess⟩, ⟨leftElement⟩, leftActivation⟩
  rcases right with ⟨⟨rightProcess⟩, ⟨rightElement⟩, rightActivation⟩
  simp_all

private theorem effectLocalScopesExact_insert (state : RuntimeState) (inserted : EffectWait)
    (bindings : List VariableBinding) (bindingsEq : bindings = inserted.arguments)
    (freshWaits : ∀ wait ∈ state.effectWaits,
      effectWaitOccurrenceId inserted ≠ effectWaitOccurrenceId wait)
    (freshIncidents : ∀ incident ∈ state.effectIncidents,
      effectWaitOccurrenceId inserted ≠ effectWaitOccurrenceId incident.wait)
    (freshActivities : ∀ activity ∈ state.variables.activities,
      activityScopeMatches (effectWaitOccurrenceId inserted) activity = false)
    (prior : effectLocalScopesExact state = true) :
    effectLocalScopesExact
      { state with
        effectWaits := insertEffectWait inserted state.effectWaits
        variables := addActivityVariableScope state.variables
          (effectWaitOccurrenceId inserted) bindings } = true := by
  let beforeWaits := state.effectWaits ++ state.effectIncidents.map (·.wait)
  let afterWaits := insertEffectWait inserted state.effectWaits ++
    state.effectIncidents.map (·.wait)
  have freshBefore : ∀ wait ∈ beforeWaits,
      effectWaitOccurrenceId inserted ≠ effectWaitOccurrenceId wait := by
    intro wait member
    rcases List.mem_append.mp member with member | member
    · exact freshWaits wait member
    · obtain ⟨incident, incidentMem, rfl⟩ := List.mem_map.mp member
      exact freshIncidents incident incidentMem
  have noPriorMatch : beforeWaits.filter (fun wait => decide
      (effectWaitOccurrenceId wait = effectWaitOccurrenceId inserted)) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member matched
    apply freshBefore wait member
    have same : effectWaitOccurrenceId wait = effectWaitOccurrenceId inserted := by
      simpa only [decide_eq_true_eq] using matched
    exact same.symm
  let insertedActivity : ActivityVariableScope :=
    { owner := .effectOccurrence (effectWaitOccurrenceId inserted), bindings }
  have insertedActivityFilter :
      (insertActivityVariableScope insertedActivity state.variables.activities).filter
          (activityScopeMatches (effectWaitOccurrenceId inserted)) = [insertedActivity] := by
    apply filter_insertActivityVariableScope_eq_singleton
    · simp [insertedActivity, activityScopeMatches, localDataOwnerMatches]
    · exact freshActivities
  have noPriorActivityMatch : beforeWaits.filter (fun wait =>
      activityScopeMatches (effectWaitOccurrenceId wait) insertedActivity) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro wait member matched
    have rejected := activityScopeMatches_inserted_ne
      (effectWaitOccurrenceId wait) (effectWaitOccurrenceId inserted) bindings
      (Ne.symm (freshBefore wait member))
    rw [rejected] at matched
    contradiction
  simp only [effectLocalScopesExact, Bool.and_eq_true] at prior ⊢
  have waitsPrior := List.all_eq_true.mp prior.1
  have activitiesPrior := List.all_eq_true.mp prior.2
  refine ⟨?_, ?_⟩
  · rw [List.all_eq_true]
    intro wait member
    simp only [Bool.and_eq_true]
    change wait ∈ afterWaits at member
    rcases List.mem_append.mp member with insertedMember | incidentMember
    · rw [show insertEffectWait inserted state.effectWaits =
        canonicalInsertBy effectWaitBefore inserted state.effectWaits by rfl,
        mem_canonicalInsertBy] at insertedMember
      rcases insertedMember with rfl | oldMember
      · refine ⟨?_, ?_⟩
        · simp only [decide_eq_true_eq]
          rw [List.filter_append, List.length_append,
            length_filter_insertEffectWait]
          simp only [decide_true, if_true, Nat.one_add]
          rw [Nat.succ_add]
          have noPriorLength := congrArg List.length noPriorMatch
          simp only [beforeWaits, List.filter_append, List.length_append,
            List.length_nil] at noPriorLength
          omega
        · change (match List.filter (activityScopeMatches (effectWaitOccurrenceId wait))
              (insertActivityVariableScope insertedActivity state.variables.activities) with
            | [activity] => decide (activity.bindings = wait.arguments)
            | _ => false) = true
          rw [insertedActivityFilter]
          simp [insertedActivity, bindingsEq]
      · have oldPrior := waitsPrior wait (List.mem_append.mpr (Or.inl oldMember))
        have rejected := activityScopeMatches_inserted_ne
          (effectWaitOccurrenceId wait) (effectWaitOccurrenceId inserted) bindings
          (Ne.symm (freshWaits wait oldMember))
        simpa [afterWaits, beforeWaits, length_filter_insertEffectWait,
          freshWaits wait oldMember, addActivityVariableScope,
          filter_insertActivityVariableScope_of_rejected _ _ rejected] using oldPrior
    · obtain ⟨incident, incidentMem, rfl⟩ := List.mem_map.mp incidentMember
      have incidentPrior := waitsPrior incident.wait
        (List.mem_append.mpr (Or.inr (List.mem_map.mpr ⟨incident, incidentMem, rfl⟩)))
      have rejected := activityScopeMatches_inserted_ne
        (effectWaitOccurrenceId incident.wait) (effectWaitOccurrenceId inserted) bindings
        (Ne.symm (freshIncidents incident incidentMem))
      simpa [afterWaits, beforeWaits, length_filter_insertEffectWait,
        freshIncidents incident incidentMem, addActivityVariableScope,
        filter_insertActivityVariableScope_of_rejected _ _ rejected] using incidentPrior
  · change (insertActivityVariableScope insertedActivity state.variables.activities).all
      (fun activity => decide ((afterWaits.filter fun wait =>
        activityScopeMatches (effectWaitOccurrenceId wait) activity).length = 1)) = true
    rw [all_insertActivityVariableScope]
    simp only [Bool.and_eq_true]
    refine ⟨?_, ?_⟩
    · simp only [decide_eq_true_eq]
      have selfMatch :
          activityScopeMatches (effectWaitOccurrenceId inserted) insertedActivity = true := by
        simp [insertedActivity, activityScopeMatches, localDataOwnerMatches]
      have noPriorActivityLength := congrArg List.length noPriorActivityMatch
      simp only [List.length_nil] at noPriorActivityLength
      rw [List.filter_append, List.length_append, length_filter_insertEffectWait]
      rw [selfMatch]
      simp only [if_true, Nat.one_add]
      rw [Nat.succ_add]
      simpa [beforeWaits, List.filter_append] using noPriorActivityLength
    · rw [List.all_eq_true]
      intro activity member
      have activityPrior := activitiesPrior activity member
      simpa [afterWaits, beforeWaits, length_filter_insertEffectWait,
        freshActivities activity member] using activityPrior

/-- Inserting one exact ordinary Effect wait and its matching Activity-local scope preserves the
Effect-family Program correspondence. -/
theorem flowNodeOccurrenceEffectProgramValidity_insertOrdinaryEffect (program : Program)
    (state : RuntimeState) (id : OperationId) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (wait : EffectWait) (bindings : List VariableBinding)
    (prior : flowNodeOccurrenceEffectProgramValidity program state = true)
    (declarers : effectWaitDeclarers program wait.elementId =
      [.awaitEffect id origin input wait.output effect route])
    (declared : declaredByExactlyOneOwnedOperation program
      (effectWaitDeclarers program wait.elementId) wait.owner = true)
    (live : flowNodeOccurrenceOwnerLiveUnique state wait.owner = true)
    (processId : !wait.processInstanceId.value.isEmpty = true)
    (elementId : !wait.elementId.value.isEmpty = true) (positive : wait.activation > 0)
    (processOwner : wait.processInstanceId = wait.owner.processInstanceId)
    (originElement : origin.elementId = wait.elementId)
    (effectElement : effect.elementId = wait.elementId)
    (descriptor : effect.descriptor = wait.descriptor)
    (arguments : evaluateInputMappings effect.inputMappings = some wait.arguments)
    (outputMappings : effect.outputMappings = wait.outputMappings)
    (routeEq : route = wait.bpmnErrorRoute)
    (bindingsEq : bindings = wait.arguments)
    (aligned : ∀ candidateId candidateOrigin candidateInput candidateOutput candidateEffect
        candidateRoute,
      .awaitEffect candidateId candidateOrigin candidateInput candidateOutput candidateEffect
          candidateRoute ∈ program.operations →
        candidateOrigin.elementId = candidateEffect.elementId)
    (freshWaits : ∀ old ∈ state.effectWaits,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId old)
    (freshIncidents : ∀ incident ∈ state.effectIncidents,
      effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId incident.wait)
    (freshActivities : ∀ activity ∈ state.variables.activities,
      activityScopeMatches (effectWaitOccurrenceId wait) activity = false) :
    flowNodeOccurrenceEffectProgramValidity program
      { state with
        effectWaits := insertEffectWait wait state.effectWaits
        variables := addActivityVariableScope state.variables
          (effectWaitOccurrenceId wait) bindings } = true := by
  subst route
  let after : RuntimeState :=
    { state with
      effectWaits := insertEffectWait wait state.effectWaits
      variables := addActivityVariableScope state.variables
        (effectWaitOccurrenceId wait) bindings }
  have owned := operationOwnedBy_of_exact_declaration program
    (.awaitEffect id origin input wait.output effect wait.bpmnErrorRoute) wait.owner _ declarers
      declared
  have operationCount :
      (program.operations.filter fun operation =>
        operationOwnedBy program operation wait.owner && match operation with
        | .awaitEffect _ _ _ output candidate candidateRoute =>
            candidate.elementId = wait.elementId && candidate.descriptor = wait.descriptor &&
              evaluateInputMappings candidate.inputMappings = some wait.arguments &&
              candidate.outputMappings = wait.outputMappings && output = wait.output &&
              candidateRoute = wait.bpmnErrorRoute
        | _ => false).length = 1 := by
    calc
      _ = (effectWaitDeclarers program wait.elementId).length := by
        apply congrArg List.length
        unfold effectWaitDeclarers
        apply List.filter_congr
        intro operation member
        have only : operation ∈ effectWaitDeclarers program wait.elementId ↔
            operation = .awaitEffect id origin input wait.output effect wait.bpmnErrorRoute := by
          rw [declarers]
          simp
        by_cases familyMember : operation ∈ effectWaitDeclarers program wait.elementId
        · have operationEq := only.mp familyMember
          subst operation
          simp [owned, originElement, effectElement, descriptor, arguments, outputMappings]
        · cases operation with
          | awaitEffect candidateId candidateOrigin candidateInput candidateOutput candidateEffect
              candidateRoute =>
              have different : candidateEffect.elementId ≠ wait.elementId := by
                intro same
                apply familyMember
                simp [effectWaitDeclarers, member,
                  aligned candidateId candidateOrigin candidateInput candidateOutput candidateEffect
                    candidateRoute member,
                  same]
              have originDifferent : candidateOrigin.elementId ≠ wait.elementId := by
                rw [aligned candidateId candidateOrigin candidateInput candidateOutput
                  candidateEffect candidateRoute member]
                exact different
              simp [different, originDifferent]
          | _ => simp
      _ = 1 := by simpa [effectWaitDeclarers] using congrArg List.length declarers
  have newValid : effectWaitValid program after wait = true := by
    simp_all [effectWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique, after]
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at prior ⊢
  obtain ⟨⟨waits, incidents⟩, localScopes⟩ := prior
  have waitsAfter : after.effectWaits.all (effectWaitValid program after) = true := by
    rw [show after.effectWaits = insertEffectWait wait state.effectWaits by rfl,
      show insertEffectWait wait state.effectWaits =
        canonicalInsertBy effectWaitBefore wait state.effectWaits by rfl,
      all_canonicalInsertBy]
    simp only [Bool.and_eq_true]
    refine ⟨newValid, ?_⟩
    simpa [effectWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using waits
  have incidentsAfter : after.effectIncidents.all (fun incident =>
      effectWaitValid program after incident.wait) = true := by
    simpa [effectWaitValid, occurrenceOwnerValid, flowNodeOccurrenceOwnerLiveUnique,
      after] using incidents
  exact ⟨⟨waitsAfter, incidentsAfter⟩,
    effectLocalScopesExact_insert state wait bindings bindingsEq freshWaits freshIncidents
      freshActivities localScopes⟩

end BpmnSemantics.SemanticProcess
