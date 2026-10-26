module

public import BpmnSemantics.SemanticProcess.SerialBusinessTaskLifecycleProofs
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleFrameProofs

/-! The exact serial suffix and root frame discharge the runtime ingress validator.
This derived guard is separate from command progress and its scheduled closure assembly. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.SerialBusinessTask

/-- Canonical issuance and the foreign-family frame close the remaining conjuncts of the actual ingress validator. -/
theorem ordered_suffix_runtime_guard (program : Program) (analysis : Analysis) (state : RuntimeState)
    (owner : ScopeOccurrenceId) (wellFormed : programWellFormed program = true)
    (analyzed : programAnalysis program = some analysis) (nonempty : owner.processInstanceId.value ≠ "")
    (root : DeclaredRoot program owner) (framed : RootFrame owner state)
    (indexed : AtOrderedSuffix program analysis state) : runtimeStateWellFormed program owner.processInstanceId state = true := by
  have positionValid := ordered_suffix_position_guard program analysis state owner wellFormed analyzed nonempty root framed indexed
  have declarations := (ordered_suffix_wait_guards program analysis state owner wellFormed root framed indexed).2
  obtain ⟨retention, snapshots, compensation, _⟩ := program_analysis_declarations_absent program analysis analyzed
  have allowed := program_analysis_operations_allowed program analysis analyzed
  have sequential : program.operations.all (sequentialMultiInstanceOperationBindingComplete program state) = true := by
    apply List.all_eq_true.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed, sequentialMultiInstanceOperationBindingComplete]
  have compensationDeclaration : compensationExecutionDeclarationValid program = true := by
    simp only [compensationExecutionDeclarationValid, compensation, Bool.not_eq_true', List.any_eq_false]
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed]
  have repeated : sequentialScopeStateValid program state = true := by
    have noRepeated : program.operations.filterMap sequentialScopeEntry? = [] := by
      apply List.filterMap_eq_nil_iff.mpr
      intro operation member
      have selected := allowed operation member
      cases operation <;> simp_all [OperationAllowed, sequentialScopeEntry?]
    have foreign := framed.2.2.2.2.1
    simp_all [ForeignRuntimeEmpty, sequentialScopeStateValid]
  have parallel : parallelMultiInstanceProgramBindingsValid program state = true := by
    unfold parallelMultiInstanceProgramBindingsValid
    have empty : state.parallelMultiInstanceControllers = [] := by
      have foreign := framed.2.2.2.2.1
      simp_all [ForeignRuntimeEmpty]
    simp only [empty, List.all_nil, Bool.true_and, parallelMultiInstanceControllersOrdered]
    apply List.all_eq_true.mpr
    intro operation member
    have selected := allowed operation member
    cases operation <;> simp_all [OperationAllowed, ParallelMultiInstanceArm.ofOperation?]
  obtain ⟨_, _, _, position, _⟩ := indexed
  obtain ⟨tokensOwned, humansOwned, effectsOwned, life, foreign, issued⟩ := framed
  cases position <;> rcases life with ⟨running, scopes⟩ | ⟨completed, scopes, noTokens, noHumans, noEffects, pending⟩
  all_goals
    simp_all [runtimeStateWellFormed, frontierFields, ForeignRuntimeEmpty, IssuanceFrame,
      eventRaceAssociationsValid, effectIncidentAssociationsValid, waitOwnersLive, exactLiveOccurrence,
      waitIdentitiesUnique, occursOnce, userTaskWaitKeyMatches, effectWaitKeyMatches,
      runtimeStateIdentityBound, hiddenRecordDeclarationsValid, canonicalCollectionOrder, orderedBy,
      activityRecordsOwnLiveWork, attachedTimersUnambiguous, attachedMessagesUnambiguous,
      activityIdentitiesUnique, controllersOwnLiveActivity, sequentialMultiInstanceProgramBindingsValid,
      sequentialMultiInstanceControllerProgramBindingsValid, controllerIdentitiesUnique,
      controllersNotExhausted, activityBodyClaimsUnique, parallelMultiInstanceControllersOrdered,
      compensationActivityRetentionStateValid, compensationActivityRetentionDeclarationValid,
      compensationEventSubProcessSnapshotStateValid, compensationEventSubProcessSnapshotDeclarationValid,
      compensationExecutionStateValid]

end BpmnSemantics.SemanticProcess.SerialBusinessTask
