import BpmnSemantics.SemanticProcess.ActivityDataInputOutputActivationRuntimeStatePreservation

/-! # Composed Activity-data completion runtime-state preservation

Completing the joined User Task removes one wait, Activity record, and Activity-local input scope,
routes its output binding, and preserves the aggregate runtime-state predicate.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem all_occursOnce_erase [BEq α] [LawfulBEq α] (same : α → α → Bool)
    (reflexive : ∀ value, same value value = true) (removed : α) (values : List α)
    (valid : values.all (occursOnce same values) = true) :
    (values.erase removed).all (occursOnce same (values.erase removed)) = true := by
  simp only [List.all_eq_true] at valid ⊢
  intro value member
  have priorMember : value ∈ values := List.mem_of_mem_erase member
  have prior := valid value priorMember
  simp only [occursOnce, decide_eq_true_eq] at prior ⊢
  have retained : value ∈ (values.erase removed).filter (same value) :=
    List.mem_filter.mpr ⟨member, reflexive value⟩
  have filteredSublist : List.Sublist ((values.erase removed).filter (same value))
      (values.filter (same value)) := List.erase_sublist.filter _
  have upper : ((values.erase removed).filter (same value)).length ≤ 1 := by
    rw [← prior]
    exact filteredSublist.length_le
  exact Nat.le_antisymm upper (List.length_pos_of_mem retained)

private theorem all_occursOnce_filter (same : α → α → Bool)
    (self : ∀ value, same value value = true) (values : List α) (keep : α → Bool)
    (unique : values.all (occursOnce same values) = true) :
    (values.filter keep).all (occursOnce same (values.filter keep)) = true := by
  simp only [List.all_eq_true] at unique ⊢
  intro value member
  have originalMember : value ∈ values := (List.mem_filter.mp member).1
  have original := unique value originalMember
  simp only [occursOnce, decide_eq_true_eq] at original ⊢
  have sublist : List.Sublist
      ((values.filter keep).filter (same value))
      (values.filter (same value)) := by
    apply List.Sublist.trans (l₂ := (values.filter (same value)).filter keep)
    · simp [List.filter_filter, Bool.and_comm]
    · exact List.filter_sublist
  have positive : 0 < ((values.filter keep).filter (same value)).length := by
    apply List.length_pos_of_mem
    exact List.mem_filter.mpr ⟨member, self value⟩
  have upper := sublist.length_le
  rw [original] at upper
  exact Nat.le_antisymm upper positive

private theorem all_erase [BEq α] [LawfulBEq α] (predicate : α → Bool)
    (removed : α) (values : List α) (valid : values.all predicate = true) :
    (values.erase removed).all predicate = true := by
  exact List.all_eq_true.mpr fun value member =>
    List.all_eq_true.mp valid value (List.mem_of_mem_erase member)

private theorem orderedBy_erase [BEq α] [LawfulBEq α] (before : α → α → Bool)
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (removed : α) : ∀ values : List α,
    orderedBy before values = true → orderedBy before (values.erase removed) = true := by
  intro values
  induction values with
  | nil => intro _; rfl
  | cons head tail ih =>
      intro ordered
      by_cases removedHead : removed = head
      · subst removed
        rw [List.erase_cons_head]
        cases tail with
        | nil => rfl
        | cons next rest =>
            simp only [orderedBy, Bool.and_eq_true] at ordered
            exact ordered.2
      · rw [List.erase_cons_tail (by simpa using Ne.symm removedHead)]
        cases tail with
        | nil => rfl
        | cons next rest =>
            simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
            have tailOrdered := ih ordered.2
            cases erasedEq : (next :: rest).erase removed with
            | nil => rfl
            | cons retained more =>
                simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
                refine ⟨?_, ?_⟩
                · exact orderedBy_bound compose next rest head ordered.2 ordered.1 retained
                    (List.mem_of_mem_erase (by rw [erasedEq]; simp))
                · simpa [erasedEq] using tailOrdered

private def completionLexStep [DecidableEq α] (less : α → α → Bool)
    (left right : α) (rest : Bool) : Bool :=
  if left ≠ right then less left right else rest

private theorem completionLexStep_false_iff [DecidableEq α] (less : α → α → Bool)
    (left right : α) (rest : Bool) : completionLexStep less left right rest = false ↔
      (if left = right then rest = false else less left right = false) := by
  unfold completionLexStep
  by_cases same : left = right <;> simp [same]

private theorem completionLexStep_compose [DecidableEq α] (less : α → α → Bool)
    (asymm : ∀ left right, less left right = true → less right left = false)
    (total : ∀ left right, left ≠ right → less left right = true ∨ less right left = true)
    (trans : ∀ a b c, less a b = true → less b c = true → less a c = true)
    (a b c : α) (ba cb ca : Bool)
    (fall : ba = false → cb = false → ca = false) :
    completionLexStep less b a ba = false → completionLexStep less c b cb = false →
      completionLexStep less c a ca = false := by
  rw [completionLexStep_false_iff, completionLexStep_false_iff,
    completionLexStep_false_iff]
  intro first second
  by_cases baEq : b = a
  · subst b
    by_cases caEq : c = a
    · subst c
      simp_all
    · simp only [caEq, if_false] at second ⊢
      exact second
  · simp only [baEq, if_false] at first
    by_cases cbEq : c = b
    · subst c
      simp_all
    · simp only [cbEq, if_false] at second
      by_cases caEq : c = a
      · subst c
        exfalso
        rcases total a b (fun same => baEq same.symm) with forward | backward
        · rw [second] at forward
          contradiction
        · rw [first] at backward
          contradiction
      · simp only [caEq, if_false]
        have ab : less a b = true := by
          rcases total a b (fun same => baEq same.symm) with forward | backward
          · exact forward
          · rw [first] at backward
            contradiction
        have bc : less b c = true := by
          rcases total b c (fun same => cbEq same.symm) with forward | backward
          · exact forward
          · rw [second] at backward
            contradiction
        exact asymm a c (trans a b c ab bc)

private def completionStringBefore (left right : String) : Bool := decide (left < right)

private theorem completionString_total (left right : String) :
    left ≠ right → left < right ∨ right < left := by
  intro different
  by_cases forward : left < right
  · exact Or.inl forward
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using forward) (Ne.symm different))

private theorem completionStringBefore_asymm (left right : String) :
    completionStringBefore left right = true → completionStringBefore right left = false := by
  simp only [completionStringBefore, decide_eq_true_eq, decide_eq_false_iff_not]
  exact String.lt_asymm

private theorem completionStringBefore_total (left right : String) (different : left ≠ right) :
    completionStringBefore left right = true ∨ completionStringBefore right left = true := by
  simpa [completionStringBefore] using completionString_total left right different

private theorem completionStringBefore_trans (a b c : String) :
    completionStringBefore a b = true → completionStringBefore b c = true →
      completionStringBefore a c = true := by
  simp only [completionStringBefore, decide_eq_true_eq]
  exact String.lt_trans

private def completionTripleBefore (process element : α → String) (activation : α → Nat)
    (left right : α) : Bool :=
  completionLexStep completionStringBefore (process left) (process right)
    (completionLexStep completionStringBefore (element left) (element right)
      (decide (activation left < activation right)))

private theorem completionTripleBefore_compose (process element : α → String)
    (activation : α → Nat) (a b c : α) :
    completionTripleBefore process element activation b a = false →
      completionTripleBefore process element activation c b = false →
      completionTripleBefore process element activation c a = false := by
  unfold completionTripleBefore
  refine completionLexStep_compose _ completionStringBefore_asymm completionStringBefore_total
    completionStringBefore_trans _ _ _ _ _ _ ?_
  refine completionLexStep_compose _ completionStringBefore_asymm completionStringBefore_total
    completionStringBefore_trans _ _ _ _ _ _ ?_
  intro first second
  simp only [decide_eq_false_iff_not] at *
  omega

private theorem localEffectOwnerBefore_compose (a b c : EffectOccurrenceId) :
    localEffectOwnerBefore b a = false → localEffectOwnerBefore c b = false →
      localEffectOwnerBefore c a = false := by
  simpa [localEffectOwnerBefore, completionTripleBefore, completionLexStep,
    completionStringBefore] using
    (completionTripleBefore_compose (·.processInstanceId.value) (·.elementId.value)
      (·.activation) a b c)

private theorem localActivityOwnerBefore_compose (a b c : ActivityOccurrenceId) :
    localActivityOwnerBefore b a = false → localActivityOwnerBefore c b = false →
      localActivityOwnerBefore c a = false := by
  simpa [localActivityOwnerBefore, completionTripleBefore, completionLexStep,
    completionStringBefore] using
    (completionTripleBefore_compose (·.processInstanceId.value) (·.activityElementId.value)
      (·.activation) a b c)

private theorem localDataOwnerBefore_compose (a b c : LocalDataOwner) :
    localDataOwnerBefore b a = false → localDataOwnerBefore c b = false →
      localDataOwnerBefore c a = false := by
  cases a with
  | effectOccurrence a =>
      cases b with
      | effectOccurrence b =>
          cases c with
          | effectOccurrence c => exact localEffectOwnerBefore_compose a b c
          | activityOccurrence c => simp [localDataOwnerBefore]
      | activityOccurrence b => cases c <;> simp [localDataOwnerBefore]
  | activityOccurrence a =>
      cases b with
      | effectOccurrence b => cases c <;> simp [localDataOwnerBefore]
      | activityOccurrence b =>
          cases c with
          | effectOccurrence c => simp [localDataOwnerBefore]
          | activityOccurrence c => exact localActivityOwnerBefore_compose a b c

private theorem taskIdNamesWait_as_decisions (task : OccurrenceId) (wait : UserTaskWait) :
    taskIdNamesWait task wait =
      (decide (wait.processInstanceId = task.processInstanceId) &&
        decide (wait.task.id.value = task.elementId.value) &&
          decide (wait.activation = task.activation)) := by
  apply Bool.eq_iff_iff.mpr
  simp only [taskIdNamesWait, Bool.and_eq_true, beq_iff_eq, decide_eq_true_eq]
  constructor
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩
  · rintro ⟨⟨process, element⟩, activation⟩
    exact ⟨⟨process.symm, element.symm⟩, activation.symm⟩

theorem dataInputOutputCompletionStep_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState)
    (profile : program.identity.semanticProfile = activityDataInputOutputUserTaskProfileId)
    (capabilities : programProfileCapabilitiesValid program = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (transition : DataInputOutputCompletionStep program before after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  cases transition
  case complete =>
      rename_i instanceId processInstanceId taskId activation submittedValues contract filled
        running declared available live success routed
      obtain ⟨runningInstance, contract', filled', task, record, scope, variables, runningFound,
        declared', available', liveFound, joined, scopeFound, removed, handlers, waitsAfter,
        recordsAfter, variablesAfter⟩ := dataInputOutputCompletionJoin success
      have contractEq : contract' = contract := Option.some.inj (declared'.symm.trans declared)
      subst contract'
      have filledEq : filled' = filled := Option.some.inj (available'.symm.trans available)
      subst filled'
      have valid : dataInputOutputRuntimeJoinValid program contract task record = true := by
        cases validEq : dataInputOutputRuntimeJoinValid program contract task record
        · unfold completeDataInputOutputUserTask? at success
          simp [runningFound, declared, available, liveFound, joined, validEq] at success
        · rfl
      unfold completeDataInputOutputUserTask? at success
      simp [runningFound, declared, available, liveFound, joined, valid, scopeFound, removed] at success
      let successor : RuntimeState :=
        { before with
          waits := before.waits.erase task
          tokens := addToken before.tokens task.output task.owner
          activityOccurrences := before.activityOccurrences.filter fun candidate =>
            !sameActivityOccurrence candidate record
          variables :=
            { variables with
              process :=
                { bindings := mergeProcessVariableBindings variables.process.bindings
                    [associatedProcessBinding contract.directOutput filled] } } }
      have successorEq : after = successor := by
        exact (by simpa [successor] using success.2.symm)
      subst after
      change runtimeStateWellFormed program expectedInstanceId successor = true
      have taskFacts := dataInputOutputTaskWait_facts liveFound
      obtain ⟨taskMember, _, taskIdEq, _⟩ := taskFacts
      obtain ⟨recordMember, body, bodyEq, bodyNames⟩ :=
        activityOccurrenceForTaskWait_sound joined
      obtain ⟨contractTaskEq, origin, operationMember⟩ :=
        dataInputOutputTaskContract_facts declared
      simp only [dataInputOutputRuntimeJoinValid, Bool.and_eq_true,
        decide_eq_true_eq] at valid
      obtain ⟨⟨⟨⟨⟨⟨outputEq, operationScopeEq⟩, taskOwnerIdentity⟩,
        recordOwnerEq⟩, recordOwnerIdentity⟩, recordElementEq⟩, taskNameEq⟩ := valid
      simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
      have claims := wellFormed.2.1.1.1
      have retention := wellFormed.2.1.1.2
      have snapshots := wellFormed.2.1.2
      have execution := wellFormed.2.2
      obtain ⟨aggregate, lifecycle⟩ := wellFormed.1
      obtain ⟨aggregate, notExhausted⟩ := aggregate
      obtain ⟨aggregate, controllerIds⟩ := aggregate
      obtain ⟨aggregate, parallelBindings⟩ := aggregate
      obtain ⟨aggregate, sequentialBindings⟩ := aggregate
      obtain ⟨aggregate, controllers⟩ := aggregate
      obtain ⟨aggregate, activityIds⟩ := aggregate
      obtain ⟨aggregate, attachedMessages⟩ := aggregate
      obtain ⟨aggregate, attachedTimers⟩ := aggregate
      obtain ⟨aggregate, bodies⟩ := aggregate
      obtain ⟨aggregate, order⟩ := aggregate
      obtain ⟨aggregate, hidden⟩ := aggregate
      obtain ⟨aggregate, declarations⟩ := aggregate
      obtain ⟨aggregate, bounds⟩ := aggregate
      obtain ⟨aggregate, identities⟩ := aggregate
      obtain ⟨aggregate, owners⟩ := aggregate
      obtain ⟨aggregate, incidents⟩ := aggregate
      obtain ⟨position, races⟩ := aggregate
      have structural : programWellFormed program = true := by
        simp only [runtimePositionValid, Bool.and_eq_true] at position
        exact position.1.1
      have operationIdsUnique :
          (program.operations.map (fun operation => operation.id)).Nodup := by
        apply activityDataInputOutput_nodup_of_string_projection_nodup _
          (fun operationId => operationId.value)
        rw [List.map_map]
        exact strictlySortedStrings_nodup _
          (programWellFormed_operationIdsSorted program structural)
      have placeIdsUnique :
          (program.controlPlaces.map (fun place => place.id)).Nodup := by
        apply activityDataInputOutput_nodup_of_string_projection_nodup _
          (fun placeId => placeId.value)
        rw [List.map_map]
        exact strictlySortedStrings_nodup _
          (programWellFormed_controlPlaceIdsSorted program structural)
      let operation := SemanticOperation.awaitDataInputOutputUserTask contract.operationId origin
        contract.input contract.output contract.taskId contract.taskName contract.directInput
        contract.directOutput
      obtain ⟨operationScope, declaredOutput, operationOwner, outputOwner, outputDeclared⟩ :=
        programGraphWellFormed_operationControlPlaceScope program operation contract.output
          (programWellFormed_graph program structural) operationIdsUnique placeIdsUnique
          operationMember (by simp [operation, operationControlPlacesShareOwner]) (by
            change contract.output ∈ [contract.input] ++ [contract.output]
            simp)
      have ownerScopeEq : operationScope = task.owner.definitionScopeId := by
        unfold operationOwningScope? at operationScopeEq
        change program.operationScopes.filter (fun ownership =>
          decide (ownership.operationId = contract.operationId)) =
            [{ operationId := contract.operationId, scopeId := operationScope }] at operationOwner
        rw [operationOwner] at operationScopeEq
        simpa using Option.some.inj operationScopeEq
      simp only [waitOwnersLive, Bool.and_eq_true] at owners
      have ownerLive : exactLiveOccurrence before task.owner = true :=
        List.all_eq_true.mp owners.1.1.1.1.1.1.1.1 task taskMember
      have positionAfter : runtimePositionValid program expectedInstanceId successor = true := by
        let framed : RuntimeState := { successor with tokens := before.tokens }
        have framedPosition : runtimePositionValid program expectedInstanceId framed = true := position
        have framedOwnerLive : exactLiveOccurrence framed task.owner = true := ownerLive
        have added := runtimePositionValid_addToken program expectedInstanceId framed
          contract.output task.owner framedPosition framedOwnerLive ⟨declaredOutput, outputDeclared⟩
          (by simpa [ownerScopeEq] using outputOwner)
        simpa [framed, successor, outputEq] using added
      have processFrame := removeActivityOccurrenceVariableScope_preserves_process removed
      have activityFrame : variables.activities = before.variables.activities.filter
          (fun candidate => !activityOccurrenceScopeMatches (activityOwnerForRecord record) candidate) := by
        unfold removeActivityOccurrenceVariableScope at removed
        split at removed
        · cases removed; rfl
        · contradiction
      have racesAfter : eventRaceAssociationsValid successor = true := by
        simpa [successor, eventRaceAssociationsValid] using races
      have effectScopeFrame (effectId : EffectOccurrenceId) :
          variables.activities.filter (activityScopeMatches effectId) =
            before.variables.activities.filter (activityScopeMatches effectId) := by
        rw [activityFrame]
        simp only [List.filter_filter]
        apply List.filter_congr
        intro candidate _
        cases ownerEq : candidate.owner with
        | effectOccurrence owner =>
            simp [activityScopeMatches, activityOccurrenceScopeMatches,
              localDataOwnerMatches, ownerEq]
        | activityOccurrence owner =>
            simp [activityScopeMatches, activityOccurrenceScopeMatches, localDataOwnerMatches,
              ownerEq]
      have incidentsAfter : effectIncidentAssociationsValid successor = true := by
        simp only [effectIncidentAssociationsValid] at incidents ⊢
        cases incidentsEq : before.effectIncidents with
        | nil => simp
        | cons incident rest =>
            cases rest with
            | cons next tail => simp_all
            | nil =>
                simp only [incidentsEq] at incidents ⊢
                change effectIncidentAssociationValid successor incident = true
                change effectIncidentAssociationValid before incident = true at incidents
                simpa [effectIncidentAssociationValid, effectWaitOwnerAssociationValid,
                  successor, effectScopeFrame] using incidents
      have ownersAfter : waitOwnersLive successor = true := by
        simp only [waitOwnersLive, Bool.and_eq_true] at ⊢
        refine ⟨⟨⟨⟨⟨⟨⟨⟨?_, owners.1.1.1.1.1.1.1.2⟩, owners.1.1.1.1.1.1.2⟩,
          owners.1.1.1.1.1.2⟩, owners.1.1.1.1.2⟩, owners.1.1.1.2⟩, owners.1.1.2⟩,
          owners.1.2⟩, ?_⟩
        · exact all_erase _ _ _ owners.1.1.1.1.1.1.1.1
        · exact all_filter _ _ _ owners.2
      have identitiesAfter : waitIdentitiesUnique successor = true := by
        simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
        exact ⟨⟨⟨all_occursOnce_erase userTaskWaitKeyMatches
          (fun wait => by simp [userTaskWaitKeyMatches]) task before.waits identities.1.1.1,
          identities.1.1.2⟩, identities.1.2⟩, identities.2⟩
      have boundsAfter : runtimeStateIdentityBound successor = true := by
        simp only [runtimeStateIdentityBound, Bool.and_eq_true] at bounds ⊢
        exact ⟨⟨all_erase _ _ _ bounds.1.1, bounds.1.2⟩,
          all_filter _ _ _ bounds.2⟩
      have declarationsAfter : waitDeclarationsValid program expectedInstanceId successor = true := by
        simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
        have taskDeclarations :
            ((successor.waits.filter fun wait =>
              decide (wait.processInstanceId = expectedInstanceId)).all fun wait =>
                declaredByExactlyOneOwnedOperation program
                  (userTaskWaitDeclarers program wait.task.id) wait.owner) = true := by
          simp only [successor, List.all_eq_true]
          intro wait member
          exact List.all_eq_true.mp declarations.1.1.1.1 wait
            ((List.erase_sublist.filter _).mem member)
        exact ⟨⟨⟨⟨taskDeclarations, declarations.1.1.1.2⟩,
          declarations.1.1.2⟩, declarations.1.2⟩, declarations.2⟩
      have hiddenAfter : hiddenRecordDeclarationsValid program successor = true := by
        simpa [successor, hiddenRecordDeclarationsValid] using hidden
      have activityCompose : ∀ a b c : ActivityOccurrence,
          activityOccurrenceBefore b a = false → activityOccurrenceBefore c b = false →
            activityOccurrenceBefore c a = false := by
        intro a b c
        exact completionTripleBefore_compose (·.processInstanceId.value)
          (·.activityElementId.value) (·.activation) a b c
      have localCompose : ∀ a b c : ActivityVariableScope,
          activityVariableScopeBefore b a = false →
            activityVariableScopeBefore c b = false →
            activityVariableScopeBefore c a = false := by
        rintro ⟨a, _⟩ ⟨b, _⟩ ⟨c, _⟩
        exact localDataOwnerBefore_compose a b c
      have orderAfter : canonicalCollectionOrder successor = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true] at order ⊢
        obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, messageOrder⟩,
          timerOrder⟩, effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
          effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
          callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩ := order
        refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨?_, activationOrder⟩, messageOrder⟩, timerOrder⟩,
          effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
          effectActivationOrder⟩, ?_⟩, selectionOrder⟩, raceOrder⟩, callOrder⟩,
          ?_⟩, sequentialOrder⟩, parallelOrder⟩
        · exact orderedBy_erase userTaskWaitBefore userTaskWaitBefore_compose task before.waits
            taskOrder
        · simpa [successor, activityFrame] using
            orderedBy_filter localCompose _ _ activityVariableOrder
        · exact orderedBy_filter activityCompose _ _ activityOrder
      have claimsAfter : activityBodyClaimsUnique successor.activityOccurrences = true :=
        activityBodyClaimsUnique_filter before.activityOccurrences _ claims
      have bodiesAfter : activityRecordsOwnLiveWork successor = true := by
        simp only [activityRecordsOwnLiveWork, List.all_eq_true]
        intro candidate candidateAfter
        obtain ⟨candidateMember, candidateKept⟩ := List.mem_filter.mp candidateAfter
        have different : candidate ≠ record := by
          intro same; subst candidate; simp [sameActivityOccurrence] at candidateKept
        have disjoint := activityBodyClaimsUnique_pair claims candidateMember recordMember different
        have claimNotErased : ∀ claimed ∈ activityBodyTaskClaims candidate.body,
            taskIdNamesWait claimed task = false := by
          intro claimed claimedMember
          apply Bool.eq_false_iff.mpr
          intro claimedNames
          have same := taskIdNamesWait_injective claimedNames bodyNames
          subst claimed
          have bodyMember : body ∈ activityBodyTaskClaims record.body := by
            cases shape : record.body <;>
              simp_all [activityBodyTask?, activityBodyTaskClaims]
          exact activityBodyClaimsDisjoint_no_shared_task disjoint claimedMember bodyMember
        have waitFrame (claimed : OccurrenceId)
            (claimedMember : claimed ∈ activityBodyTaskClaims candidate.body) :
            (before.waits.erase task).filter (taskIdNamesWait claimed) =
              before.waits.filter (taskIdNamesWait claimed) := by
          have absent : task ∉ before.waits.filter (taskIdNamesWait claimed) := by
            simp [claimNotErased claimed claimedMember]
          rw [← List.erase_filter, List.erase_of_not_mem absent]
        have prior := List.all_eq_true.mp bodies candidate candidateMember
        simp only [Bool.and_eq_true] at prior ⊢
        have taskOwnersAfter : activityTaskBodyOwnersAgree successor candidate = true := by
          cases shape : candidate.body with
          | childScope scope => simp [activityTaskBodyOwnersAgree, shape]
          | userTask claimed =>
              simp only [activityTaskBodyOwnersAgree, shape, successor]
              rw [waitFrame claimed (by simp [activityBodyTaskClaims, shape])]
              simpa [activityTaskBodyOwnersAgree, shape] using prior.1.1.2
          | parallelUserTasks first rest =>
              simp only [activityTaskBodyOwnersAgree, shape, List.all_eq_true] at ⊢
              intro claimed claimedMember
              simp only [successor]
              rw [waitFrame claimed (by simpa [activityBodyTaskClaims, shape] using claimedMember)]
              have priorOwners := prior.1.1.2
              simp only [activityTaskBodyOwnersAgree, shape, List.all_eq_true] at priorOwners
              exact priorOwners claimed claimedMember
        refine ⟨⟨⟨?_, taskOwnersAfter⟩, by simpa [successor] using prior.1.2⟩,
          by simpa [successor] using prior.2⟩
        cases shape : candidate.body with
        | childScope scope =>
            simpa [activityBodyLive, exactLiveOccurrence, successor, shape] using prior.1.1.1
        | userTask claimed =>
            simp only [activityBodyLive, shape, decide_eq_true_eq] at prior ⊢
            simp only [successor]
            rw [show (fun wait : UserTaskWait =>
                decide (wait.processInstanceId = claimed.processInstanceId) &&
                  decide (wait.task.id.value = claimed.elementId.value) &&
                    decide (wait.activation = claimed.activation)) = taskIdNamesWait claimed by
              funext wait; exact (taskIdNamesWait_as_decisions claimed wait).symm]
            change ((before.waits.erase task).filter (taskIdNamesWait claimed)).length = 1
            rw [waitFrame claimed (by simp [activityBodyTaskClaims, shape])]
            rw [show taskIdNamesWait claimed = (fun wait : UserTaskWait =>
                decide (wait.processInstanceId = claimed.processInstanceId) &&
                  decide (wait.task.id.value = claimed.elementId.value) &&
                    decide (wait.activation = claimed.activation)) by
              funext wait; exact taskIdNamesWait_as_decisions claimed wait]
            exact prior.1.1.1
        | parallelUserTasks first rest =>
            simp only [activityBodyLive, shape, List.all_eq_true, decide_eq_true_eq] at prior ⊢
            intro claimed claimedMember
            simp only [successor]
            rw [show (fun wait : UserTaskWait =>
                decide (wait.processInstanceId = claimed.processInstanceId) &&
                  decide (wait.task.id.value = claimed.elementId.value) &&
                    decide (wait.activation = claimed.activation)) = taskIdNamesWait claimed by
              funext wait; exact (taskIdNamesWait_as_decisions claimed wait).symm]
            change ((before.waits.erase task).filter (taskIdNamesWait claimed)).length = 1
            rw [waitFrame claimed (by simpa [activityBodyTaskClaims, shape] using claimedMember)]
            rw [show taskIdNamesWait claimed = (fun wait : UserTaskWait =>
                decide (wait.processInstanceId = claimed.processInstanceId) &&
                  decide (wait.task.id.value = claimed.elementId.value) &&
                    decide (wait.activation = claimed.activation)) by
              funext wait; exact taskIdNamesWait_as_decisions claimed wait]
            exact prior.1.1.1 claimed claimedMember
      have attachedTimersAfter : attachedTimersUnambiguous successor = true := by
        simp only [attachedTimersUnambiguous, List.all_eq_true, decide_eq_true_eq] at attachedTimers ⊢
        intro wait waitMember
        have subset : List.Sublist
            (successor.activityOccurrences.filter fun candidate =>
              anyTimerIdNamesWait candidate.timerHandlerOccurrences wait)
            (before.activityOccurrences.filter fun candidate =>
              anyTimerIdNamesWait candidate.timerHandlerOccurrences wait) := by
          exact List.filter_sublist.filter _
        exact Nat.le_trans subset.length_le (attachedTimers wait waitMember)
      have attachedMessagesAfter : attachedMessagesUnambiguous successor = true := by
        simp only [attachedMessagesUnambiguous, List.all_eq_true,
          decide_eq_true_eq] at attachedMessages ⊢
        intro candidate candidateAfter message messageMember
        have candidateMember := (List.mem_filter.mp candidateAfter).1
        have subset : List.Sublist
            (successor.activityOccurrences.filter fun current =>
              current.messageHandlerOccurrences.contains message)
            (before.activityOccurrences.filter fun current =>
              current.messageHandlerOccurrences.contains message) := by
          exact List.filter_sublist.filter _
        exact Nat.le_trans subset.length_le
          (attachedMessages candidate candidateMember message messageMember)
      have activityIdsAfter : activityIdentitiesUnique successor = true :=
        all_occursOnce_filter sameActivityOccurrence
          (fun candidate => by simp [sameActivityOccurrence]) before.activityOccurrences _ activityIds
      have admitted := capabilities
      simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at admitted
      have noSequential := admitted.1.1
      simp [programSequentialMultiInstanceProfileMatches, profile,
        activityDataInputOutputUserTaskProfileId, sequentialMultiInstanceUserTaskProfileId]
        at noSequential
      have noSequentialOperation : ∀ operation ∈ program.operations,
          match operation with | .awaitSequentialMultiInstanceUserTask .. => False | _ => True := by
        intro candidate member
        have absent := noSequential candidate member
        cases candidate <;> simp_all
      have noSequentialControllers := sequential_controllers_absent program before
        noSequentialOperation sequentialBindings
      have parallelFamily := admitted.1.2
      simp [programParallelMultiInstanceProfileMatches, profile,
        activityDataInputOutputUserTaskProfileId, parallelMultiInstanceUserTaskProfileId]
        at parallelFamily
      have noParallelControllers :=
        activityDataInputOutput_parallelControllers_absent_of_forbidden program before
        parallelFamily parallelBindings
      have controllersAfter : controllersOwnLiveActivity successor = true := by
        simp [controllersOwnLiveActivity, successor, noSequentialControllers]
      have sequentialBindingsAfter : sequentialMultiInstanceProgramBindingsValid program
          successor = true := by
        apply sequential_bindings_of_no_sequential_operation program successor noSequentialOperation
        simp [successor, noSequentialControllers]
      have parallelBindingsAfter : parallelMultiInstanceProgramBindingsValid program successor = true := by
        exact activityDataInputOutput_parallelBindings_of_forbidden program successor parallelFamily
          (by simpa [successor] using noParallelControllers)
      have lifecycleAfter : (match successor.control with
          | .notStarted => notStartedStateEmpty successor | _ => true) = true := by
        simp [successor, running]
      have retentionAfter : compensationActivityRetentionStateValid program successor = true := by
        change compensationActivityRetentionStateValid program before = true
        exact retention
      have snapshotsAfter :
          compensationEventSubProcessSnapshotStateValid program successor = true := by
        change compensationEventSubProcessSnapshotStateValid program before = true
        exact snapshots
      have executionAfter : compensationExecutionStateValid program successor = true := by
        rw [compensationExecutionStateValid_running_frame program before successor instanceId
          running rfl rfl rfl rfl rfl rfl]
        exact execution
      simp only [runtimeStateWellFormed, Bool.and_eq_true]
      exact ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨positionAfter, racesAfter⟩,
        incidentsAfter⟩, ownersAfter⟩, identitiesAfter⟩, boundsAfter⟩, declarationsAfter⟩,
        hiddenAfter⟩, orderAfter⟩, bodiesAfter⟩, attachedTimersAfter⟩,
        attachedMessagesAfter⟩, activityIdsAfter⟩, controllersAfter⟩,
        sequentialBindingsAfter⟩, parallelBindingsAfter⟩,
        by simpa [successor, controllerIdentitiesUnique] using controllerIds⟩,
        by simpa [successor, controllersNotExhausted] using notExhausted⟩, lifecycleAfter⟩,
        ⟨⟨⟨claimsAfter, retentionAfter⟩, snapshotsAfter⟩, executionAfter⟩⟩

end BpmnSemantics.SemanticProcess
