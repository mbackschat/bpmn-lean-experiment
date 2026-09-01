import BpmnSemantics.SemanticProcess.MessageKeyCorrelation
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.CollectionOrder

/-! # Message key-correlation preservation laws

This module states the quantified state-frame laws of exact target delivery. Complete
`runtimeStateWellFormed` preservation additionally depends on the correlated operation's graph and
wait-declaration cases, which are integrated by their existing exhaustive owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem nodup_of_value_nodup (values : List α) (value : α → String)
    (valid : (values.map value).Nodup) : values.Nodup := by
  induction values with
  | nil => simp
  | cons head tail ih =>
      obtain ⟨fresh, rest⟩ := List.nodup_cons.mp valid
      apply List.nodup_cons.mpr
      refine ⟨?_, ih rest⟩
      intro member
      exact fresh (List.mem_map.mpr ⟨head, member, rfl⟩)

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

private theorem messageWaitBefore_compose (a b c : MessageWait) :
    messageWaitBefore b a = false → messageWaitBefore c b = false →
      messageWaitBefore c a = false := by
  rcases a with ⟨processA, ownerA, elementA, activationA, channelA, outputA⟩
  rcases b with ⟨processB, ownerB, elementB, activationB, channelB, outputB⟩
  rcases c with ⟨processC, ownerC, elementC, activationC, channelC, outputC⟩
  rcases ownerA with ⟨ownerProcessA, ownerScopeA, ownerActivationA⟩
  rcases ownerB with ⟨ownerProcessB, ownerScopeB, ownerActivationB⟩
  rcases ownerC with ⟨ownerProcessC, ownerScopeC, ownerActivationC⟩
  rcases processA with ⟨processA⟩
  rcases processB with ⟨processB⟩
  rcases processC with ⟨processC⟩
  rcases elementA with ⟨elementA⟩
  rcases elementB with ⟨elementB⟩
  rcases elementC with ⟨elementC⟩
  rcases ownerProcessA with ⟨ownerProcessA⟩
  rcases ownerProcessB with ⟨ownerProcessB⟩
  rcases ownerProcessC with ⟨ownerProcessC⟩
  rcases ownerScopeA with ⟨ownerScopeA⟩
  rcases ownerScopeB with ⟨ownerScopeB⟩
  rcases ownerScopeC with ⟨ownerScopeC⟩
  simp only [messageWaitBefore, waitOccurrenceBefore, scopeOwnerBefore]
  grind

/-- Correlated delivery never materializes either the received payload or a hidden key binding. -/
theorem deliverCorrelatedPayloadMessage_preserves_variables
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    after.variables = before.variables := by
  have step := deliverCorrelatedPayloadMessage_sound program before after delivery success
  cases step
  rfl

/-- Success is possible only after rechecking every selected target and payload identity. -/
theorem deliverCorrelatedPayloadMessage_revalidates_exact_target
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    ∃ candidate,
      projectCorrelatedMessageCandidate program before = some candidate ∧
      delivery.ingressOrdinal > 0 ∧ candidate.address = delivery.address ∧
      candidate.subscriptionId = delivery.subscriptionId ∧
      candidate.correlationPropertyId = delivery.correlationPropertyId ∧
      candidate.processPropertyId = delivery.processPropertyId ∧
      candidate.key = delivery.payload := by
  have step := deliverCorrelatedPayloadMessage_sound program before after delivery success
  cases step with
  | commit candidate wait projected rechecked selected ordinary unattached =>
      exact ⟨candidate, projected,
        (correlatedDeliveryRechecks_exact candidate delivery).mp rechecked⟩

/-- Every successful delivery withdraws the exact reprojected wait and produces its outgoing token. -/
theorem deliverCorrelatedPayloadMessage_exact_rewrite
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    ∃ candidate wait,
      projectCorrelatedMessageCandidate program before = some candidate ∧
      candidate.subscriptionId = delivery.subscriptionId ∧
      currentCorrelatedMessageWaitForCandidate? program before candidate = some wait ∧
      after.messageWaits = before.messageWaits.erase wait ∧
      after.tokens = addToken before.tokens wait.output wait.owner := by
  have step := deliverCorrelatedPayloadMessage_sound program before after delivery success
  cases step with
  | commit candidate wait projected rechecked selected ordinary unattached =>
      simp only [correlatedDeliveryRechecks, Bool.and_eq_true,
        decide_eq_true_eq] at rechecked
      exact ⟨candidate, wait, projected, rechecked.1.1.1.2, selected, rfl, rfl⟩

/-- A different wait remains present; exact target delivery cannot withdraw or retarget it. -/
theorem deliverCorrelatedPayloadMessage_preserves_nonselected_wait
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) (other : MessageWait)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after)
    (different : ¬ correlatedWaitOccurrenceMatches delivery.subscriptionId other = true) :
    other ∈ after.messageWaits ↔ other ∈ before.messageWaits := by
  obtain ⟨candidate, wait, projected, subscriptionEq, selected, waitsEq, _tokensEq⟩ :=
    deliverCorrelatedPayloadMessage_exact_rewrite program before after delivery success
  obtain ⟨id, origin, input, output, message, correlationKeyId, correlationPropertyId,
      payloadSelector, processPropertySelector, operationEq, selectedEq, waitMatches⟩ :=
    currentCorrelatedMessageWaitForCandidate?_facts program before candidate wait selected
  have deliveryWaitMatches :
      correlatedWaitOccurrenceMatches delivery.subscriptionId wait = true := by
    rw [← subscriptionEq]
    exact waitMatches
  have otherNe : other ≠ wait := by
    intro same
    subst other
    exact different deliveryWaitMatches
  rw [waitsEq]
  simp [otherNe]

/-- Apart from the exact wait withdrawal and outgoing-token insertion, every RuntimeState field is
preserved byte-for-byte. -/
theorem deliverCorrelatedPayloadMessage_preserves_non_target_state
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    { after with messageWaits := before.messageWaits, tokens := before.tokens } = before := by
  have step := deliverCorrelatedPayloadMessage_sound program before after delivery success
  cases step
  rfl

/-- A failed stale or mismatched target preserves the exact state when refusal is interpreted as the
command boundary's no-transition result. -/
theorem deliverCorrelatedPayloadMessage_refusal_preserves_exact_state
    (program : Program) (state : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (refused : deliverCorrelatedPayloadMessage program state delivery = none) :
    (deliverCorrelatedPayloadMessage program state delivery).getD state = state := by
  simp [refused]

/-- Changing the current Process Property after projection cannot cause delivery to another wait:
the evaluator either reprojects the selected occurrence or refuses. -/
theorem deliverCorrelatedPayloadMessage_never_retargets
    (program : Program) (before after : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    ∃ candidate,
      projectCorrelatedMessageCandidate program before = some candidate ∧
      candidate.subscriptionId = delivery.subscriptionId := by
  obtain ⟨candidate, _wait, projected, subscriptionEq, _selected, _waitsEq, _tokensEq⟩ :=
    deliverCorrelatedPayloadMessage_exact_rewrite program before after delivery success
  exact ⟨candidate, projected, subscriptionEq⟩

theorem deliverCorrelatedPayloadMessage_preserves_runtimeStateWellFormed
    (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (profile : program.identity.semanticProfile = messageKeyCorrelationProfileId)
    (structural : programWellFormed program = true)
    (_capabilities : programProfileCapabilitiesValid program = true)
    (wellFormed : runtimeStateWellFormed program expectedInstanceId before = true)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    runtimeStateWellFormed program expectedInstanceId after = true := by
  have semanticStep := deliverCorrelatedPayloadMessage_sound program before after delivery success
  cases semanticStep with
  | commit candidate wait projected rechecked selected ordinary unattached =>
      obtain ⟨id, origin, input, output, message, correlationKeyId, correlationPropertyId,
        payloadSelector, processPropertySelector, operationEq, selectedEq, occurrence⟩ :=
        currentCorrelatedMessageWaitForCandidate?_facts program before candidate wait selected
      obtain ⟨waitMember, processInstanceEq, ownerInstanceEq, elementEq, outputEq, channelEq,
        declarers, ownerScope⟩ := selectedCorrelatedMessageWait?_facts program before
          candidate.processInstanceId
          (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
            correlationPropertyId payloadSelector processPropertySelector) message output wait
            selectedEq
      subst output
      have operationMember :
          .awaitCorrelatedPayloadMessage id origin input wait.output message correlationKeyId
            correlationPropertyId payloadSelector processPropertySelector ∈ program.operations := by
        have member :
            .awaitCorrelatedPayloadMessage id origin input wait.output message correlationKeyId
              correlationPropertyId payloadSelector processPropertySelector ∈
                messageWaitDeclarers program wait.elementId := by
          rw [declarers]
          simp
        exact (List.mem_filter.mp member).1
      have operationValuesNodup := strictlySortedStrings_nodup _
        (programWellFormed_operationIdsSorted program structural)
      have placeValuesNodup := strictlySortedStrings_nodup _
        (programWellFormed_controlPlaceIdsSorted program structural)
      have operationIdsUnique : (program.operations.map (fun current => current.id)).Nodup :=
        nodup_of_value_nodup _ (fun operationId => operationId.value) (by
          rw [List.map_map]
          exact operationValuesNodup)
      have placeIdsUnique : (program.controlPlaces.map (fun place => place.id)).Nodup :=
        nodup_of_value_nodup _ (fun placeId => placeId.value) (by
          rw [List.map_map]
          exact placeValuesNodup)
      obtain ⟨operationScope, declaredOutput, operationScopeBinding, outputOwner,
        outputDeclared⟩ := programGraphWellFormed_operationControlPlaceScope program
          (.awaitCorrelatedPayloadMessage id origin input wait.output message correlationKeyId
            correlationPropertyId payloadSelector processPropertySelector) wait.output
          (programWellFormed_graph program structural) operationIdsUnique placeIdsUnique
          operationMember rfl
          (awaitCorrelatedPayloadMessage_output_mem_operationControlPlaces id origin input
            wait.output message correlationKeyId correlationPropertyId payloadSelector
              processPropertySelector)
      have operationScopeEq : operationScope = wait.owner.definitionScopeId := by
        unfold operationOwningScope? at ownerScope
        rw [operationScopeBinding] at ownerScope
        exact Option.some.inj ownerScope
      let framed : RuntimeState :=
        { before with messageWaits := before.messageWaits.erase wait }
      let settled : RuntimeState :=
        { framed with tokens := addToken framed.tokens wait.output wait.owner }
      change runtimeStateWellFormed program expectedInstanceId settled = true
      simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
      have claims := wellFormed.2.1.1
      have retention := wellFormed.2.1.2
      have snapshots := wellFormed.2.2
      have capabilities := _capabilities
      simp only [programProfileCapabilitiesValid, Bool.and_eq_true] at capabilities
      have parallelFamily := capabilities.1.2
      simp [programParallelMultiInstanceProfileMatches, profile, messageKeyCorrelationProfileId,
        parallelMultiInstanceUserTaskProfileId] at parallelFamily
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
      simp only [waitOwnersLive, Bool.and_eq_true] at owners
      obtain ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, messageOwners⟩, timerOwners⟩, effectOwners⟩,
        incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩,
        activityOwners⟩ := owners
      have ownerLive : exactLiveOccurrence before wait.owner = true := by
        exact List.all_eq_true.mp messageOwners wait waitMember
      have framedPosition : runtimePositionValid program expectedInstanceId framed = true := by
        exact position
      have positionAdded := runtimePositionValid_addToken program expectedInstanceId framed
        wait.output wait.owner framedPosition ownerLive ⟨declaredOutput, outputDeclared⟩ (by
          simpa [operationScopeEq] using outputOwner)
      have positionAfter : runtimePositionValid program expectedInstanceId settled = true :=
        positionAdded
      have racesAfter : eventRaceAssociationsValid settled = true := by
        simp only [eventRaceAssociationsValid, List.all_eq_true] at races ⊢
        intro race raceMember
        have prior := races race raceMember
        have rejected : eventRaceHasMessage race wait = false :=
          Bool.eq_false_iff.mpr ((List.any_eq_false.mp ordinary) race raceMember)
        have waitAbsent : wait ∉ before.messageWaits.filter (eventRaceHasMessage race) := by
          simp [rejected]
        have messageFrame : (before.messageWaits.erase wait).filter
            (eventRaceHasMessage race) = before.messageWaits.filter
              (eventRaceHasMessage race) := by
          rw [← List.erase_filter, List.erase_of_not_mem waitAbsent]
        simpa [settled, framed, messageFrame] using prior
      have incidentsAfter : effectIncidentAssociationsValid settled = true := by
        exact (effectIncidentAssociationsValid_frame before settled rfl rfl rfl rfl rfl).trans
          incidents
      have ownersAfter : waitOwnersLive settled = true := by
        simp only [waitOwnersLive, Bool.and_eq_true] at ⊢
        refine ⟨⟨⟨⟨⟨⟨⟨⟨taskOwners, ?_⟩, timerOwners⟩, effectOwners⟩,
          incidentOwners⟩, selectionOwners⟩, raceOwners⟩, callOwners⟩, activityOwners⟩
        simp only [settled, framed, List.all_eq_true]
        intro retained retainedMember
        exact List.all_eq_true.mp messageOwners retained (List.mem_of_mem_erase retainedMember)
      have identitiesAfter : waitIdentitiesUnique settled = true := by
        simp only [waitIdentitiesUnique, Bool.and_eq_true] at identities ⊢
        obtain ⟨⟨⟨taskIdentities, messageIdentities⟩, timerIdentities⟩,
          effectIdentities⟩ := identities
        refine ⟨⟨⟨taskIdentities, ?_⟩, timerIdentities⟩, effectIdentities⟩
        have retainedIdentities := all_occursOnce_erase messageWaitKeyMatches
          (fun value => by simp [messageWaitKeyMatches]) wait before.messageWaits
            messageIdentities
        simpa [settled, framed] using retainedIdentities
      have boundsAfter : runtimeStateIdentityBound settled = true := by
        simpa [settled, framed, runtimeStateIdentityBound, activationCount,
          timerActivationCount, activityActivationCount] using bounds
      have declarationsAfter : waitDeclarationsValid program expectedInstanceId settled = true := by
        simp only [waitDeclarationsValid, Bool.and_eq_true] at declarations ⊢
        refine ⟨⟨⟨⟨declarations.1.1.1.1, ?_⟩, declarations.1.1.2⟩,
          declarations.1.2⟩, declarations.2⟩
        simp only [settled, framed, List.all_eq_true] at ⊢
        intro retained retainedMember
        obtain ⟨member, sameInstance⟩ := List.mem_filter.mp retainedMember
        exact List.all_eq_true.mp declarations.1.1.1.2 retained
          (List.mem_filter.mpr ⟨List.mem_of_mem_erase member, sameInstance⟩)
      have hiddenAfter : hiddenRecordDeclarationsValid program settled = true := by
        simpa [settled, framed, hiddenRecordDeclarationsValid] using hidden
      have orderAfter : canonicalCollectionOrder settled = true := by
        simp only [canonicalCollectionOrder, Bool.and_eq_true] at order ⊢
        obtain ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, messageOrder⟩,
          timerOrder⟩, effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
          effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
          callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩ := order
        refine ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨taskOrder, activationOrder⟩, ?_⟩, timerOrder⟩,
          effectOrder⟩, messageActivationOrder⟩, timerActivationOrder⟩,
          effectActivationOrder⟩, activityVariableOrder⟩, selectionOrder⟩, raceOrder⟩,
          callOrder⟩, activityOrder⟩, sequentialOrder⟩, parallelOrder⟩
        simpa [settled, framed] using orderedBy_erase messageWaitBefore
          messageWaitBefore_compose wait before.messageWaits messageOrder
      have bodiesAfter : activityRecordsOwnLiveWork settled = true := by
        simp only [settled, framed, activityRecordsOwnLiveWork, List.all_eq_true,
          Bool.and_eq_true, List.any_eq_true, decide_eq_true_eq] at bodies ⊢
        intro record recordMember
        obtain ⟨⟨bodyLive, timersLive⟩, messagesLive⟩ := bodies record recordMember
        refine ⟨⟨bodyLive, timersLive⟩, ?_⟩
        intro message messageMember
        obtain ⟨candidate, candidateMember, candidateNames, candidateOwner⟩ :=
          messagesLive message messageMember
        have recordUnattached := List.any_eq_false.mp unattached record recordMember
        have messageUnattached := List.any_eq_false.mp
          (Bool.eq_false_iff.mpr recordUnattached) message messageMember
        have candidateDifferent : candidate ≠ wait := by
          intro equal
          subst candidate
          simp [messageUnattached] at candidateNames
        exact ⟨candidate, by simpa [candidateDifferent] using candidateMember,
          candidateNames, candidateOwner⟩
      have attachedTimersAfter : attachedTimersUnambiguous settled = true := by
        simpa [settled, framed, attachedTimersUnambiguous] using attachedTimers
      have attachedMessagesAfter : attachedMessagesUnambiguous settled = true := by
        simpa [settled, framed, attachedMessagesUnambiguous] using attachedMessages
      have activityIdsAfter : activityIdentitiesUnique settled = true := by
        simpa [settled, framed, activityIdentitiesUnique] using activityIds
      have controllersAfter : controllersOwnLiveActivity settled = true := by
        simpa [settled, framed, controllersOwnLiveActivity, activityBodyLive,
          exactLiveOccurrence] using controllers
      have sequentialBindingsAfter :
          sequentialMultiInstanceProgramBindingsValid program settled = true := by
        simpa [settled, framed, sequentialMultiInstanceProgramBindingsValid,
          sequentialMultiInstanceControllerProgramBindingsValid,
          sequentialMultiInstanceControllerProgramBindingValid,
          sequentialMultiInstanceOperationBindingComplete, activityBodyLive,
          exactLiveOccurrence] using sequentialBindings
      have parallelBindingsAfter :
          parallelMultiInstanceProgramBindingsValid program settled = true := by
        have controllersEmpty : before.parallelMultiInstanceControllers = [] := by
          apply List.eq_nil_iff_forall_not_mem.mpr
          intro controller member
          have facts := parallelMultiInstanceProgramBindingsValid_controller_facts program before
            controller parallelBindings member
          obtain ⟨entry, arm, record, timer, timerWait, childWaits, pendingTask, pendingWait,
            recordExact, operationExact, projects, remaining⟩ := facts.witnesses
          have selectedEntry : entry ∈ program.operations.filter (fun operation =>
              match ParallelMultiInstanceArm.ofOperation? operation with
              | some candidate =>
                  candidate.taskId.value == controller.id.activityElementId.value
              | none => false) := by
            exact operationExact.symm ▸ (by simp)
          have entryMember := (List.mem_filter.mp selectedEntry).1
          have forbidden := parallelFamily entry entryMember
          cases entry <;>
            simp [ParallelMultiInstanceArm.ofOperation?] at projects
          simp at forbidden
        unfold parallelMultiInstanceProgramBindingsValid at parallelBindings ⊢
        simp only [settled, framed, controllersEmpty, List.all_nil, Bool.true_and]
        simpa only [controllersEmpty, List.all_nil, Bool.true_and] using parallelBindings
      have controllerIdsAfter : controllerIdentitiesUnique settled = true := by
        simpa [settled, framed, controllerIdentitiesUnique] using controllerIds
      have notExhaustedAfter : controllersNotExhausted settled = true := by
        simpa [settled, framed, controllersNotExhausted] using notExhausted
      have lifecycleAfter : (match settled.control with
          | .notStarted => notStartedStateEmpty settled
          | _ => true) = true := by
        cases controlEq : before.control <;> simp_all [settled, framed, notStartedStateEmpty]
      have claimsAfter : activityBodyClaimsUnique settled.activityOccurrences = true := by
        simpa [settled, framed] using claims
      have retentionAfter : compensationActivityRetentionStateValid program settled = true := by
        change compensationActivityRetentionStateValid program before = true
        exact retention
      have snapshotsAfter : compensationEventSubProcessSnapshotStateValid program settled = true := by
        change compensationEventSubProcessSnapshotStateValid program before = true
        exact snapshots
      simp only [runtimeStateWellFormed, Bool.and_eq_true]
      refine ⟨?_, ⟨⟨claimsAfter, retentionAfter⟩, snapshotsAfter⟩⟩
      refine ⟨?_, lifecycleAfter⟩
      refine ⟨?_, notExhaustedAfter⟩
      refine ⟨?_, controllerIdsAfter⟩
      refine ⟨?_, parallelBindingsAfter⟩
      refine ⟨?_, sequentialBindingsAfter⟩
      refine ⟨?_, controllersAfter⟩
      refine ⟨?_, activityIdsAfter⟩
      refine ⟨?_, attachedMessagesAfter⟩
      refine ⟨?_, attachedTimersAfter⟩
      refine ⟨?_, bodiesAfter⟩
      refine ⟨?_, orderAfter⟩
      refine ⟨?_, hiddenAfter⟩
      refine ⟨?_, declarationsAfter⟩
      refine ⟨?_, boundsAfter⟩
      refine ⟨?_, identitiesAfter⟩
      refine ⟨?_, ownersAfter⟩
      refine ⟨?_, incidentsAfter⟩
      exact ⟨positionAfter, racesAfter⟩

end BpmnSemantics.SemanticProcess
