import BpmnSemantics.SemanticProcess.RepeatableSubscriptionAdmission
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleProofs

/-! The subscription proposal's depth-one forest and Call exclusion align live owners with
the hosting Process through existing projection validity, without a reachability premise. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- The selected subscription profile excludes Call Activities. A projectable predecessor
therefore cannot carry a Call association, even when it is not assumed source-reachable. -/
theorem subscription_projectable_no_called_record (program : Program) (state : RuntimeState)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) : False := by
  obtain ⟨id, origin, input, process, root, entry, returned, declared, _⟩ :=
    flowNodeOccurrenceStructuralProgramValidity_call_declarer program state record structural member
  have allowed := repeatableSubscriptionProgramGraph_operation program admitted _ declared
  contradiction

/-- Under depth-one subscription admission, every projectable live owner belongs to the
hosting Process. This is derived from the existing scope/Call validator, not reachability. -/
theorem subscription_projectable_owner_instance (program : Program) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (hosting : SemanticId)
    (admitted : repeatableSubscriptionProgramGraph program = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (running : state.control = .running hosting)
    (live : exactLiveOccurrence state owner = true) :
    owner.processInstanceId = hosting := by
  obtain ⟨unique, root, rootMember, rootParent, shapes⟩ :=
    repeatableSubscriptionProgramGraph_scope_forest program admitted
  have rootSingleton := filter_eq_singleton_of_key_nodup program.definitionScopes (·.id)
    (fun scope => decide (scope.id = root.id)) root unique rootMember (by simp)
    (fun scope _ selected => of_decide_eq_true selected)
  have rootDefinition (definition : DefinitionScope) (member : definition ∈ program.definitionScopes)
      (same : definition.id = root.id) : definition = root := by
    have present : definition ∈ program.definitionScopes.filter (fun scope => decide (scope.id = root.id)) :=
      List.mem_filter.mpr ⟨member, by simp [same]⟩
    rw [rootSingleton] at present
    exact List.mem_singleton.mp present
  have parentless (current : ScopeOccurrenceId) (currentLive : exactLiveOccurrence state current = true)
      (definition : DefinitionScope) (member : definition ∈ program.definitionScopes)
      (same : definition.id = current.definitionScopeId) (noParent : definition.parentScopeId = none) :
      current.processInstanceId = hosting := by
    rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding
        program state current hosting structural running currentLive with nested | host | called
    · obtain ⟨occurrence, parent, declared, _, _, _, declaredMember, declaredId, declaredParent, _⟩ := nested
      have selected := filter_eq_singleton_of_key_nodup program.definitionScopes (·.id)
        (fun scope => decide (scope.id = definition.id)) definition unique member (by simp)
        (fun scope _ accepted => of_decide_eq_true accepted)
      have present : declared ∈ program.definitionScopes.filter (fun scope => decide (scope.id = definition.id)) :=
        List.mem_filter.mpr ⟨declaredMember, by simp [declaredId, same]⟩
      rw [selected] at present
      have equal := List.mem_singleton.mp present
      simp [equal, noParent] at declaredParent
    · exact host.1
    · obtain ⟨record, _, member, _⟩ := called
      exact False.elim (subscription_projectable_no_called_record program state admitted structural record member)
  rcases flowNodeOccurrenceStructuralProgramValidity_live_owner_process_binding
      program state owner hosting structural running live with nested | host | called
  · obtain ⟨occurrence, parent, definition, _, _, _, member, same, parentEq, processEq, parentLive⟩ := nested
    rcases shapes definition member with rootId | child
    · have equal := rootDefinition definition member rootId
      simp [equal, rootParent] at parentEq
    · have parentId : parent.definitionScopeId = root.id := Option.some.inj (parentEq.symm.trans child)
      have exactParent : exactLiveOccurrence state parent = true := parentLive
      exact processEq.symm.trans (parentless parent exactParent root rootMember parentId.symm rootParent)
  · exact host.1
  · obtain ⟨record, _, member, _⟩ := called
    exact False.elim (subscription_projectable_no_called_record program state admitted structural record member)

end BpmnSemantics.SemanticProcess.InternalCommutation
