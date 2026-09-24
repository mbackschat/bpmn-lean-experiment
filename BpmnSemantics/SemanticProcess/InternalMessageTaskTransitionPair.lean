import BpmnSemantics.SemanticProcess.InternalMessageTaskScopeFrames
import BpmnSemantics.SemanticProcess.InternalMessageTaskEndPairs
import BpmnSemantics.SemanticProcess.InternalSubscriptionPairExclusions
import BpmnSemantics.SemanticProcess.InternalMessageTaskRegionalCommutation

/-! The subscription proof-domain amendment requires complete Message-host pairs with ordinary
waits, local control, child entry, None End and regional retirement. Admission excludes other families. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem prepared_message_task_transition_pair (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (contract : InternalMessageTaskContract)
    (message : InternalMessageTaskPatch) (other : PreparedInternalTransition)
    (programValid : programWellFormed program = true)
    (stateValid : runtimeStateWellFormed program instanceId state = true)
    (messageFound : (PreparedInternalTransition.messageTask contract message).Prepared program state)
    (otherFound : other.Prepared program state)
    (canonical : canonicalCollectionOrder state = true)
    (independent : (PreparedInternalTransition.messageTask contract message).Independent other) :
    other.Prepared program (applyInternalMessageTaskPatch state message) ∧
      (PreparedInternalTransition.messageTask contract message).Prepared program (other.apply program state) ∧
      other.apply program (applyInternalMessageTaskPatch state message) =
        applyInternalMessageTaskPatch (other.apply program state) message := by
  cases other with
  | timerTask timerContract patch =>
      have same := prepared_subscription_boundaries_same program state
        (.messageTask contract message) (.timerTask timerContract patch) messageFound.1 messageFound otherFound
        (by cases kind : contract.kind <;> simp [PreparedInternalTransition.operation,
          InternalMessageTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
        (by cases kind : timerContract.kind <;> simp [PreparedInternalTransition.operation,
          InternalTimerTaskContract.operation, kind, repeatableSubscriptionBoundaryOperation])
      cases kind : contract.kind <;> cases timerKind : timerContract.kind <;>
        simp [PreparedInternalTransition.operation, InternalMessageTaskContract.operation,
          InternalTimerTaskContract.operation, kind, timerKind] at same
  | messageTask otherContract patch =>
      exact False.elim (prepared_message_task_pair_dependent program state contract otherContract
        message patch messageFound otherFound independent)
  | boundedScope scopeContract scope =>
      exact False.elim (prepared_message_bounded_scope_impossible program state contract message
        scopeContract scope messageFound otherFound)
  | arming arm =>
      cases arm with
      | ordinary operation patch =>
          have pair := prepared_message_task_ordinary_pair_commutes program state contract message operation patch
            messageFound.2 otherFound canonical independent
          exact ⟨pair.2.1, ⟨messageFound.1, pair.1⟩, pair.2.2⟩
      | data dataContract patch =>
          exact False.elim (prepared_subscription_data_impossible program state dataContract patch messageFound.1 otherFound)
  | localControl control =>
      have pair := prepared_message_task_local_control_pair program state control.operation control contract message
        otherFound messageFound.2 canonical independent
      exact ⟨pair.2.1, ⟨messageFound.1, pair.1⟩, pair.2.2.symm⟩
  | scopeCreation creation =>
      have pair := prepared_message_task_scope_creation_pair program state contract message creation.selection.operation creation
        messageFound.2 otherFound canonical independent
      exact ⟨pair.2.1, ⟨messageFound.1, pair.1⟩, pair.2.2.symm⟩
  | ordinaryEnd ending =>
      have pair := prepared_message_task_end_pair_commutes program state ending.operation ending contract message
        otherFound messageFound.2 independent
      exact ⟨pair.1, ⟨messageFound.1, pair.2.1⟩, pair.2.2.symm⟩
  | mergeInput merge =>
      exact False.elim (prepared_subscription_merge_impossible program state merge messageFound.1 otherFound)
  | regional regional =>
      have running := (preparedMessageTask_owner_facts program state contract message messageFound.2).2.2
      have same := runtimePositionValid_running_instance program instanceId message.arm.runtimeInstanceId state
        (runtimeStateWellFormed_position program instanceId state stateValid) running
      have valid : runtimeStateWellFormed program message.arm.runtimeInstanceId state = true := by
        simpa only [same] using stateValid
      obtain ⟨regionalFrame, after, applied, messageFrame, commute⟩ :=
        prepared_regional_message_task_pair_commutes program state regional.selection.operation regional contract message
          messageFound.1.2.2 programValid valid otherFound messageFound.2
          (PreparedInternalTransition.independent_symm independent)
      refine ⟨regionalFrame, ⟨messageFound.1, ?_⟩, ?_⟩
      · simpa only [PreparedInternalTransition.apply, applied, Option.getD_some] using messageFrame
      · simp only [PreparedInternalTransition.apply, applied, commute, Option.getD_some]

end BpmnSemantics.SemanticProcess.InternalCommutation
