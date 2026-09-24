import BpmnSemantics.SemanticProcess.InternalRegionalPairExecutionFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairOwnershipFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairPublicationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairCancellationFrame
import BpmnSemantics.SemanticProcess.InternalRegionalPairMixedFields
import BpmnSemantics.SemanticProcess.InternalLocalControlRegionPatch

/-! Complete regional pairs compose the existing preparation, execution, validity, and publication laws. Canonical token order and additive end counts are proved separately from retained-field removal before reconstructing literal RuntimeState equality. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

private structure RegionalPairExecutionSquare (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional) : Prop where
  leftApplied : applyPreparedInternalRegional? program before left = some afterLeft
  rightApplied : applyPreparedInternalRegional? program before right = some afterRight
  rightAfterLeft : prepareInternalRegional? program afterLeft rightOperation = some right
  leftAfterRight : prepareInternalRegional? program afterRight leftOperation = some left
  lrApplied : applyPreparedInternalRegional? program afterLeft right = some finalLR
  rlApplied : applyPreparedInternalRegional? program afterRight left = some finalRL
  leftValid : runtimeStateWellFormed program hosting afterLeft = true
  rightValid : runtimeStateWellFormed program hosting afterRight = true
  lrValid : runtimeStateWellFormed program hosting finalLR = true
  rlValid : runtimeStateWellFormed program hosting finalRL = true
  leftRunning : afterLeft.control = .running hosting
  rightRunning : afterRight.control = .running hosting
  lrRunning : finalLR.control = .running hosting
  rlRunning : finalRL.control = .running hosting

private theorem regional_pair_execution_square (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    ∃ afterLeft afterRight finalLR finalRL,
      RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
        leftOperation rightOperation left right := by
  have symmetric := regionalStateFootprintsIndependent_symmetric _ _ independent
  have leftFootprint := (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.2.2.1
  have rightFootprint := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.2.1
  have noLeftControl := regional_pair_read_key_not_written _ _ independent _
    (regionalStateFootprint_control_read before right.selection right.region right.footprint hosting running rightFootprint)
  have noRightControl := regional_pair_read_key_not_written _ _ symmetric _
    (regionalStateFootprint_control_read before left.selection left.region left.footprint hosting running leftFootprint)
  obtain ⟨afterLeft, leftApplied, leftValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program before hosting leftOperation left valid leftFound
  obtain ⟨afterRight, rightApplied, rightValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program before hosting rightOperation right valid rightFound
  have leftRunning := (preparedRegional_control_preserved_of_no_write program before afterLeft hosting
    leftOperation left valid running leftFound leftApplied noLeftControl).trans running
  have rightRunning := (preparedRegional_control_preserved_of_no_write program before afterRight hosting
    rightOperation right valid running rightFound rightApplied noRightControl).trans running
  have rightAfterLeft := prepareInternalRegional_after_independent_regional program before afterLeft hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent leftApplied
  have leftAfterRight := prepareInternalRegional_after_independent_regional program before afterRight hosting
    rightOperation leftOperation right left valid running rightFound leftFound symmetric rightApplied
  obtain ⟨finalLR, lrApplied, lrValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program afterLeft hosting rightOperation right leftValid rightAfterLeft
  obtain ⟨finalRL, rlApplied, rlValid⟩ := preparedRegional_preserves_runtimeStateWellFormed
    program afterRight hosting leftOperation left rightValid leftAfterRight
  have lrRunning := (preparedRegional_control_preserved_of_no_write program afterLeft finalLR hosting
    rightOperation right leftValid leftRunning rightAfterLeft lrApplied noRightControl).trans leftRunning
  have rlRunning := (preparedRegional_control_preserved_of_no_write program afterRight finalRL hosting
    leftOperation left rightValid rightRunning leftAfterRight rlApplied noLeftControl).trans rightRunning
  exact ⟨afterLeft, afterRight, finalLR, finalRL, leftApplied, rightApplied, rightAfterLeft, leftAfterRight,
    lrApplied, rlApplied, leftValid, rightValid, lrValid, rlValid, leftRunning, rightRunning, lrRunning, rlRunning⟩

private theorem prepared_return_fields (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (record : CalledProcessOccurrence)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (kind : prepared.selection.kind = .returning record) :
    after = { removeCalledProcessTree before record with tokens := after.tokens } := by
  have update := preparedRegional_execution_fields program before after hosting operation prepared valid running afterRunning found applied
  cases operation <;> simp only [kind] at update <;> try contradiction
  rw [update]

private theorem prepared_completion_fields (program : Program) (before after : RuntimeState)
    (hosting : SemanticId) (operation : SemanticOperation) (prepared : PreparedInternalRegional)
    (withdrawal : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting) (afterRunning : after.control = .running hosting)
    (found : prepareInternalRegional? program before operation = some prepared)
    (applied : applyPreparedInternalRegional? program before prepared = some after)
    (kind : prepared.selection.kind = .completing withdrawal) :
    after = { before with
      tokens := after.tokens
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ prepared.selection.root.id))
      timerWaits := before.timerWaits.filter (regionalSelectionReferenceRetention before prepared.selection).timer
      activityOccurrences := before.activityOccurrences.filter (regionalSelectionReferenceRetention before prepared.selection).activity } := by
  have update := preparedRegional_execution_fields program before after hosting operation prepared valid running afterRunning found applied
  cases operation with
  | completeScope id origin definition output =>
      cases parent : prepared.selection.root.parent <;> cases output with
      | none => simp only [kind, parent] at update
      | some output =>
          simp only [kind, parent] at update
          all_goals
            have exactUpdate := preparedCompletion_filter_update program before after hosting id origin definition output
              prepared withdrawal _ valid running afterRunning found applied kind parent
            rw [exactUpdate]
  | _ => simp only [kind] at update

private theorem filter_addTokens_retained (tokens : List ControlToken) (outputs : List ControlPlaceId)
    (owner : ScopeOccurrenceId) (keep : ControlToken → Bool)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (kept : ∀ output ∈ outputs, keep { placeId := output, owner } = true) :
    (addTokens tokens outputs owner).filter keep = addTokens (tokens.filter keep) outputs owner := by
  induction outputs with
  | nil => rfl
  | cons output rest ih =>
      change (canonicalInsertBy controlTokenBefore { placeId := output, owner }
        (addTokens tokens rest owner)).filter keep =
        canonicalInsertBy controlTokenBefore { placeId := output, owner } (addTokens (tokens.filter keep) rest owner)
      rw [filter_canonicalInsertBy_retained controlTokenBefore controlTokenBefore_compose
        keep _ _ (orderedBy_addTokens tokens rest owner ordered) (kept output (by simp))]
      rw [ih (fun value member => kept value (List.mem_cons_of_mem output member))]

private theorem regional_token_updates_commute (tokens : List ControlToken)
    (leftKeep rightKeep : ControlToken → Bool) (leftOutputs rightOutputs : List ControlPlaceId)
    (leftOwner rightOwner : ScopeOccurrenceId)
    (ordered : orderedBy controlTokenBefore tokens = true)
    (leftKept : ∀ output ∈ leftOutputs, rightKeep { placeId := output, owner := leftOwner } = true)
    (rightKept : ∀ output ∈ rightOutputs, leftKeep { placeId := output, owner := rightOwner } = true) :
    addTokens ((addTokens (tokens.filter leftKeep) leftOutputs leftOwner).filter rightKeep) rightOutputs rightOwner =
      addTokens ((addTokens (tokens.filter rightKeep) rightOutputs rightOwner).filter leftKeep) leftOutputs leftOwner := by
  rw [filter_addTokens_retained _ _ _ rightKeep (orderedBy_token_filter tokens leftKeep ordered) leftKept,
    filter_addTokens_retained _ _ _ leftKeep (orderedBy_token_filter tokens rightKeep ordered) rightKept]
  have filters : (tokens.filter leftKeep).filter rightKeep = (tokens.filter rightKeep).filter leftKeep := by
    simp only [List.filter_filter, Bool.and_comm]
  rw [filters]
  exact addTokens_commute _ _ _ _ _

private theorem completion_updates_commute (before afterLeft afterRight : RuntimeState)
    (leftRoot rightRoot : ScopeOccurrenceId)
    (leftTimer rightTimer : TimerWait → Bool) (leftActivity rightActivity : ActivityOccurrence → Bool)
    (leftUpdate : afterLeft = { before with
      tokens := afterLeft.tokens
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ leftRoot))
      timerWaits := before.timerWaits.filter leftTimer
      activityOccurrences := before.activityOccurrences.filter leftActivity })
    (rightUpdate : afterRight = { before with
      tokens := afterRight.tokens
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ rightRoot))
      timerWaits := before.timerWaits.filter rightTimer
      activityOccurrences := before.activityOccurrences.filter rightActivity }) :
    { afterLeft with
      tokens := [], endOccurrences := 0
      scopeOccurrences := afterLeft.scopeOccurrences.filter (fun scope => decide (scope.id ≠ rightRoot))
      timerWaits := afterLeft.timerWaits.filter rightTimer
      activityOccurrences := afterLeft.activityOccurrences.filter rightActivity } =
    { afterRight with
      tokens := [], endOccurrences := 0
      scopeOccurrences := afterRight.scopeOccurrences.filter (fun scope => decide (scope.id ≠ leftRoot))
      timerWaits := afterRight.timerWaits.filter leftTimer
      activityOccurrences := afterRight.activityOccurrences.filter leftActivity } := by
  rw [leftUpdate, rightUpdate]
  congr 1
  · simp only [List.filter_filter, Bool.and_comm]
  · simp only [List.filter_filter, Bool.and_comm]
  · simp only [List.filter_filter, Bool.and_comm]

private theorem return_completion_updates_commute (before returned completed : RuntimeState)
    (record : CalledProcessOccurrence) (root : ScopeOccurrenceId) (keepTimer : TimerWait → Bool)
    (keepActivity : ActivityOccurrence → Bool)
    (returnedUpdate : returned = { removeCalledProcessTree before record with tokens := returned.tokens })
    (completedUpdate : completed = { before with
      tokens := completed.tokens
      scopeOccurrences := before.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root))
      timerWaits := before.timerWaits.filter keepTimer
      activityOccurrences := before.activityOccurrences.filter keepActivity }) :
    { returned with
      tokens := [], endOccurrences := 0
      scopeOccurrences := returned.scopeOccurrences.filter (fun scope => decide (scope.id ≠ root))
      timerWaits := returned.timerWaits.filter keepTimer
      activityOccurrences := returned.activityOccurrences.filter keepActivity } =
      { removeCalledProcessTree completed record with
        tokens := [], endOccurrences := 0 } := by
  rw [returnedUpdate, completedUpdate]
  simp only [removeCalledProcessTree]
  congr 1
  · simp only [List.filter_filter, Bool.and_comm]
  · simp only [List.filter_filter, Bool.and_comm]
  · simp only [List.filter_filter, Bool.and_comm]

private theorem return_updates_commute (before afterLeft afterRight : RuntimeState)
    (left right : CalledProcessOccurrence)
    (leftUpdate : afterLeft = { removeCalledProcessTree before left with tokens := afterLeft.tokens })
    (rightUpdate : afterRight = { removeCalledProcessTree before right with tokens := afterRight.tokens })
    (leftClosure : ∀ id, (processInstanceClosureWithin afterRight.calledProcessOccurrences
      [left.calledRoot.processInstanceId] (afterRight.calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin before.calledProcessOccurrences
        [left.calledRoot.processInstanceId] (before.calledProcessOccurrences.length + 1)).contains id)
    (rightClosure : ∀ id, (processInstanceClosureWithin afterLeft.calledProcessOccurrences
      [right.calledRoot.processInstanceId] (afterLeft.calledProcessOccurrences.length + 1)).contains id =
      (processInstanceClosureWithin before.calledProcessOccurrences
        [right.calledRoot.processInstanceId] (before.calledProcessOccurrences.length + 1)).contains id) :
    { removeCalledProcessTree afterLeft right with tokens := [], endOccurrences := 0 } =
      { removeCalledProcessTree afterRight left with tokens := [], endOccurrences := 0 } := by
  simp only [removeCalledProcessTree, leftClosure, rightClosure]
  rw [leftUpdate, rightUpdate]
  simp only [removeCalledProcessTree]
  have filters {α : Type} (values : List α) (first second : α → Bool) :
      (values.filter first).filter second = (values.filter second).filter first := by
    simp only [List.filter_filter, Bool.and_comm]
  congr 1
  all_goals first
  | exact filters _ _ _
  | (congr 1; exact filters _ _ _)

private theorem regional_return_pair_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (leftRecord rightRecord : CalledProcessOccurrence)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftKind : left.selection.kind = .returning leftRecord)
    (rightKind : right.selection.kind = .returning rightRecord) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have leftSelection := (ownershipClosedSelection_facts program before leftOperation left.selection
    (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.1).1
  have rightSelection := (ownershipClosedSelection_facts program before rightOperation right.selection
    (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.1).1
  obtain ⟨leftBinding, leftParentless⟩ := regionalSelection_return_root program before leftOperation left.selection leftRecord leftSelection leftKind
  obtain ⟨rightBinding, rightParentless⟩ := regionalSelection_return_root program before rightOperation right.selection rightRecord rightSelection rightKind
  have leftClosure := regional_pair_call_closure program before afterRight hosting rightOperation leftOperation right left
    valid running rightFound leftFound (regionalStateFootprintsIndependent_symmetric _ _ independent) square.rightApplied leftParentless
  have rightClosure := regional_pair_call_closure program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied rightParentless
  have leftUpdate := prepared_return_fields program before afterLeft hosting leftOperation left leftRecord valid running
    square.leftRunning leftFound square.leftApplied leftKind
  have rightUpdate := prepared_return_fields program before afterRight hosting rightOperation right rightRecord valid running
    square.rightRunning rightFound square.rightApplied rightKind
  have lrUpdate := prepared_return_fields program afterLeft finalLR hosting rightOperation right rightRecord square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightKind
  have rlUpdate := prepared_return_fields program afterRight finalRL hosting leftOperation left leftRecord square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftKind
  rw [lrUpdate, rlUpdate]
  exact return_updates_commute before afterLeft afterRight leftRecord rightRecord leftUpdate rightUpdate
    (by simpa only [leftBinding] using leftClosure) (by simpa only [rightBinding] using rightClosure)

private theorem regional_completion_pair_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (leftWithdrawal rightWithdrawal : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftKind : left.selection.kind = .completing leftWithdrawal)
    (rightKind : right.selection.kind = .completing rightWithdrawal) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have leftMask : regionalSelectionReferenceRetention afterRight left.selection =
      regionalSelectionReferenceRetention before left.selection := by
    cases leftWithdrawal <;> simp only [regionalSelectionReferenceRetention, leftKind]
  have rightMask : regionalSelectionReferenceRetention afterLeft right.selection =
      regionalSelectionReferenceRetention before right.selection := by
    cases rightWithdrawal <;> simp only [regionalSelectionReferenceRetention, rightKind]
  have leftUpdate := prepared_completion_fields program before afterLeft hosting leftOperation left leftWithdrawal valid running
    square.leftRunning leftFound square.leftApplied leftKind
  have rightUpdate := prepared_completion_fields program before afterRight hosting rightOperation right rightWithdrawal valid running
    square.rightRunning rightFound square.rightApplied rightKind
  have lrUpdate := prepared_completion_fields program afterLeft finalLR hosting rightOperation right rightWithdrawal square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightKind
  have rlUpdate := prepared_completion_fields program afterRight finalRL hosting leftOperation left leftWithdrawal square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftKind
  rw [lrUpdate, rlUpdate]
  simp only [leftMask, rightMask]
  exact completion_updates_commute before afterLeft afterRight _ _ _ _ _ _ leftUpdate rightUpdate

private theorem regional_return_completion_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (record : CalledProcessOccurrence) (withdrawal : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftKind : left.selection.kind = .returning record)
    (rightKind : right.selection.kind = .completing withdrawal) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have rightMask : regionalSelectionReferenceRetention afterLeft right.selection =
      regionalSelectionReferenceRetention before right.selection := by
    cases withdrawal <;> simp only [regionalSelectionReferenceRetention, rightKind]
  have leftUpdate := prepared_return_fields program before afterLeft hosting leftOperation left record valid running
    square.leftRunning leftFound square.leftApplied leftKind
  have rightUpdate := prepared_completion_fields program before afterRight hosting rightOperation right withdrawal valid running
    square.rightRunning rightFound square.rightApplied rightKind
  have lrUpdate := prepared_completion_fields program afterLeft finalLR hosting rightOperation right withdrawal square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightKind
  have rlUpdate := prepared_return_fields program afterRight finalRL hosting leftOperation left record square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftKind
  rw [lrUpdate, rlUpdate]
  simp only [rightMask]
  exact return_completion_updates_commute before afterLeft afterRight record _ _ _ leftUpdate rightUpdate

private theorem cancellation_fields_commute (before afterLeft afterRight : RuntimeState)
    (left right : ScopeOccurrenceId) (leftDisposition rightDisposition : SelectedScopeDisposition)
    (leftTokens rightTokens : List ControlToken) (leftCount rightCount : Nat)
    (leftUpdate : afterLeft = { cancelScopeSubtree before left leftDisposition with
      tokens := leftTokens, endOccurrences := leftCount })
    (rightUpdate : afterRight = { cancelScopeSubtree before right rightDisposition with
      tokens := rightTokens, endOccurrences := rightCount })
    (leftSubtree : ∀ owner, occurrenceInSubtree afterRight.scopeOccurrences left owner =
      occurrenceInSubtree before.scopeOccurrences left owner)
    (rightSubtree : ∀ owner, occurrenceInSubtree afterLeft.scopeOccurrences right owner =
      occurrenceInSubtree before.scopeOccurrences right owner)
    (leftCalled : ∀ id, (calledInstanceClosure afterRight left).contains id =
      (calledInstanceClosure before left).contains id)
    (rightCalled : ∀ id, (calledInstanceClosure afterLeft right).contains id =
      (calledInstanceClosure before right).contains id)
    (leftActivities : withdrawnByRegion (fun owner => occurrenceInSubtree afterRight.scopeOccurrences left owner ||
        (calledInstanceClosure afterRight left).contains owner.processInstanceId) afterRight.activityOccurrences (retainedCancellationRoot left leftDisposition) =
      withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences left owner ||
        (calledInstanceClosure before left).contains owner.processInstanceId) before.activityOccurrences (retainedCancellationRoot left leftDisposition))
    (rightActivities : withdrawnByRegion (fun owner => occurrenceInSubtree afterLeft.scopeOccurrences right owner ||
        (calledInstanceClosure afterLeft right).contains owner.processInstanceId) afterLeft.activityOccurrences (retainedCancellationRoot right rightDisposition) =
      withdrawnByRegion (fun owner => occurrenceInSubtree before.scopeOccurrences right owner ||
        (calledInstanceClosure before right).contains owner.processInstanceId) before.activityOccurrences (retainedCancellationRoot right rightDisposition))
    (leftEffects : afterRight.effectWaits.filter (fun wait => occurrenceInSubtree afterRight.scopeOccurrences left wait.owner ||
        (calledInstanceClosure afterRight left).contains wait.owner.processInstanceId) =
      before.effectWaits.filter (fun wait => occurrenceInSubtree before.scopeOccurrences left wait.owner ||
        (calledInstanceClosure before left).contains wait.owner.processInstanceId))
    (rightEffects : afterLeft.effectWaits.filter (fun wait => occurrenceInSubtree afterLeft.scopeOccurrences right wait.owner ||
        (calledInstanceClosure afterLeft right).contains wait.owner.processInstanceId) =
      before.effectWaits.filter (fun wait => occurrenceInSubtree before.scopeOccurrences right wait.owner ||
        (calledInstanceClosure before right).contains wait.owner.processInstanceId))
    (leftIncidents : afterRight.effectIncidents.filter (fun incident => occurrenceInSubtree afterRight.scopeOccurrences left incident.wait.owner ||
        (calledInstanceClosure afterRight left).contains incident.wait.owner.processInstanceId) =
      before.effectIncidents.filter (fun incident => occurrenceInSubtree before.scopeOccurrences left incident.wait.owner ||
        (calledInstanceClosure before left).contains incident.wait.owner.processInstanceId))
    (rightIncidents : afterLeft.effectIncidents.filter (fun incident => occurrenceInSubtree afterLeft.scopeOccurrences right incident.wait.owner ||
        (calledInstanceClosure afterLeft right).contains incident.wait.owner.processInstanceId) =
      before.effectIncidents.filter (fun incident => occurrenceInSubtree before.scopeOccurrences right incident.wait.owner ||
        (calledInstanceClosure before right).contains incident.wait.owner.processInstanceId))
    (leftTriggers : afterRight.compensationTriggers.filter (fun trigger => occurrenceInSubtree afterRight.scopeOccurrences left trigger.owner ||
        (calledInstanceClosure afterRight left).contains trigger.owner.processInstanceId) =
      before.compensationTriggers.filter (fun trigger => occurrenceInSubtree before.scopeOccurrences left trigger.owner ||
        (calledInstanceClosure before left).contains trigger.owner.processInstanceId))
    (rightTriggers : afterLeft.compensationTriggers.filter (fun trigger => occurrenceInSubtree afterLeft.scopeOccurrences right trigger.owner ||
        (calledInstanceClosure afterLeft right).contains trigger.owner.processInstanceId) =
      before.compensationTriggers.filter (fun trigger => occurrenceInSubtree before.scopeOccurrences right trigger.owner ||
        (calledInstanceClosure before right).contains trigger.owner.processInstanceId)) :
    { cancelScopeSubtree afterLeft right rightDisposition with tokens := [], endOccurrences := 0 } =
      { cancelScopeSubtree afterRight left leftDisposition with tokens := [], endOccurrences := 0 } := by
  have leftParents : compensationParentContextRetentionSurvivesScopeCancellation afterRight left leftDisposition =
      compensationParentContextRetentionSurvivesScopeCancellation before left leftDisposition := by
    funext retention
    cases retention <;> simp only [compensationParentContextRetentionSurvivesScopeCancellation, leftSubtree, leftCalled]
  have rightParents : compensationParentContextRetentionSurvivesScopeCancellation afterLeft right rightDisposition =
      compensationParentContextRetentionSurvivesScopeCancellation before right rightDisposition := by
    funext retention
    cases retention <;> simp only [compensationParentContextRetentionSurvivesScopeCancellation, rightSubtree, rightCalled]
  simp only [cancelScopeSubtree]
  simp only [leftActivities, rightActivities, leftEffects, rightEffects,
    leftIncidents, rightIncidents, leftTriggers, rightTriggers, leftParents, rightParents]
  simp only [leftSubtree, rightSubtree, leftCalled, rightCalled]
  rw [leftUpdate, rightUpdate]
  simp only [cancelScopeSubtree, retainedByRegion]
  have filters {α : Type} (values : List α) (first second : α → Bool) :
      (values.filter first).filter second = (values.filter second).filter first := by
    simp only [List.filter_filter, Bool.and_comm]
  congr 1
  all_goals first
  | exact filters _ _ _
  | (congr 1; exact filters _ _ _)

private theorem regional_cancellation_pair_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftCancels : left.selection.kind = .terminating ∨ ∃ parent, left.selection.kind = .interrupting parent)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have symmetric := regionalStateFootprintsIndependent_symmetric _ _ independent
  have leftClasses := regional_pair_cancellation_classifiers program before afterRight hosting rightOperation leftOperation right left
    valid running rightFound leftFound symmetric square.rightApplied
  have rightClasses := regional_pair_cancellation_classifiers program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied
  have leftPopulations := fun retainedRoot => regional_pair_cancellation_populations program before afterRight hosting rightOperation leftOperation right left
    valid running rightFound leftFound symmetric square.rightApplied leftCancels retainedRoot
  have rightPopulations := fun retainedRoot => regional_pair_cancellation_populations program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied rightCancels retainedRoot
  have leftTriggers := preparedRegional_cancellation_triggers_empty program before hosting leftOperation left valid running leftFound leftCancels
  have rightTriggers := preparedRegional_cancellation_triggers_empty program before hosting rightOperation right valid running rightFound rightCancels
  have leftTriggersAfter := preparedRegional_cancellation_triggers_empty program afterRight hosting leftOperation left
    square.rightValid square.rightRunning square.leftAfterRight leftCancels
  have rightTriggersAfter := preparedRegional_cancellation_triggers_empty program afterLeft hosting rightOperation right
    square.leftValid square.leftRunning square.rightAfterLeft rightCancels
  have leftUpdate := preparedCancellation_field_update program before afterLeft hosting leftOperation left valid running
    square.leftRunning leftFound square.leftApplied leftCancels
  have rightUpdate := preparedCancellation_field_update program before afterRight hosting rightOperation right valid running
    square.rightRunning rightFound square.rightApplied rightCancels
  have lrUpdate := preparedCancellation_field_update program afterLeft finalLR hosting rightOperation right square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightCancels
  have rlUpdate := preparedCancellation_field_update program afterRight finalRL hosting leftOperation left square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftCancels
  rw [lrUpdate, rlUpdate]
  exact cancellation_fields_commute before afterLeft afterRight _ _ _ _ _ _ _ _ leftUpdate rightUpdate
    leftClasses.1 rightClasses.1 leftClasses.2 rightClasses.2 (leftPopulations _).1 (rightPopulations _).1
    (leftPopulations none).2.1 (rightPopulations none).2.1 (leftPopulations none).2.2 (rightPopulations none).2.2
    (leftTriggersAfter.trans leftTriggers.symm) (rightTriggersAfter.trans rightTriggers.symm)

private theorem regional_return_cancellation_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (record : CalledProcessOccurrence)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftKind : left.selection.kind = .returning record)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have selected := (ownershipClosedSelection_facts program before leftOperation left.selection
    (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.1).1
  obtain ⟨binding, parentless⟩ := regionalSelection_return_root program before leftOperation left.selection record selected leftKind
  have closure := regional_pair_call_closure program before afterRight hosting rightOperation leftOperation right left
    valid running rightFound leftFound (regionalStateFootprintsIndependent_symmetric _ _ independent) square.rightApplied parentless
  have classes := regional_pair_cancellation_classifiers program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied
  have populations := fun retainedRoot => regional_pair_cancellation_populations program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied rightCancels retainedRoot
  have triggers := preparedRegional_cancellation_triggers_empty program before hosting rightOperation right valid running rightFound rightCancels
  have triggersAfter := preparedRegional_cancellation_triggers_empty program afterLeft hosting rightOperation right
    square.leftValid square.leftRunning square.rightAfterLeft rightCancels
  have leftUpdate := prepared_return_fields program before afterLeft hosting leftOperation left record valid running
    square.leftRunning leftFound square.leftApplied leftKind
  have rightUpdate := preparedCancellation_field_update program before afterRight hosting rightOperation right valid running
    square.rightRunning rightFound square.rightApplied rightCancels
  have lrUpdate := preparedCancellation_field_update program afterLeft finalLR hosting rightOperation right square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightCancels
  have rlUpdate := prepared_return_fields program afterRight finalRL hosting leftOperation left record square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftKind
  rw [lrUpdate, rlUpdate]
  exact return_cancel_fields_commute before afterLeft afterRight record _ _ _ _ _ leftUpdate rightUpdate
    (by simpa only [binding] using closure) classes.1 classes.2 (populations _).1 (populations none).2.1 (populations none).2.2
    (triggersAfter.trans triggers.symm)

private theorem regional_completion_cancellation_fields (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (withdrawal : InternalCompletionWithdrawal)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right)
    (leftKind : left.selection.kind = .completing withdrawal)
    (rightCancels : right.selection.kind = .terminating ∨ ∃ parent, right.selection.kind = .interrupting parent) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have mask : regionalSelectionReferenceRetention afterRight left.selection =
      regionalSelectionReferenceRetention before left.selection := by
    cases withdrawal <;> simp only [regionalSelectionReferenceRetention, leftKind]
  have classes := regional_pair_cancellation_classifiers program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied
  have populations := fun retainedRoot => regional_pair_cancellation_populations program before afterLeft hosting leftOperation rightOperation left right
    valid running leftFound rightFound independent square.leftApplied rightCancels retainedRoot
  have triggers := preparedRegional_cancellation_triggers_empty program before hosting rightOperation right valid running rightFound rightCancels
  have triggersAfter := preparedRegional_cancellation_triggers_empty program afterLeft hosting rightOperation right
    square.leftValid square.leftRunning square.rightAfterLeft rightCancels
  have leftUpdate := prepared_completion_fields program before afterLeft hosting leftOperation left withdrawal valid running
    square.leftRunning leftFound square.leftApplied leftKind
  have rightUpdate := preparedCancellation_field_update program before afterRight hosting rightOperation right valid running
    square.rightRunning rightFound square.rightApplied rightCancels
  have lrUpdate := preparedCancellation_field_update program afterLeft finalLR hosting rightOperation right square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied rightCancels
  have rlUpdate := prepared_completion_fields program afterRight finalRL hosting leftOperation left withdrawal square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied leftKind
  rw [lrUpdate, rlUpdate]
  simp only [mask]
  exact completion_cancel_fields_commute before afterLeft afterRight _ _ _ _ _ _ _ _ leftUpdate rightUpdate
    classes.1 classes.2 (populations _).1 (populations none).2.1 (populations none).2.2 (triggersAfter.trans triggers.symm)

private theorem regional_pair_retained_fields_equal (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right) :
    { finalLR with tokens := [], endOccurrences := 0 } = { finalRL with tokens := [], endOccurrences := 0 } := by
  have symmetric := regionalStateFootprintsIndependent_symmetric _ _ independent
  have swapped : RegionalPairExecutionSquare program before afterRight afterLeft finalRL finalLR hosting
      rightOperation leftOperation right left :=
    ⟨square.rightApplied, square.leftApplied, square.leftAfterRight, square.rightAfterLeft, square.rlApplied,
      square.lrApplied, square.rightValid, square.leftValid, square.rlValid, square.lrValid,
      square.rightRunning, square.leftRunning, square.rlRunning, square.lrRunning⟩
  cases leftKind : left.selection.kind with
  | returning record =>
      cases rightKind : right.selection.kind with
      | returning other =>
          exact regional_return_pair_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right record other valid running leftFound rightFound independent square leftKind rightKind
      | completing withdrawal =>
          exact regional_return_completion_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right record withdrawal valid running leftFound rightFound square leftKind rightKind
      | interrupting parent | terminating =>
          apply regional_return_cancellation_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right record valid running leftFound rightFound independent square leftKind
          first | exact Or.inl rightKind | exact Or.inr ⟨_, rightKind⟩
  | completing withdrawal =>
      cases rightKind : right.selection.kind with
      | returning record =>
          exact (regional_return_completion_fields program before afterRight afterLeft finalRL finalLR hosting
            rightOperation leftOperation right left record withdrawal valid running rightFound leftFound swapped rightKind leftKind).symm
      | completing other =>
          exact regional_completion_pair_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right withdrawal other valid running leftFound rightFound square leftKind rightKind
      | interrupting parent | terminating =>
          apply regional_completion_cancellation_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right withdrawal valid running leftFound rightFound independent square leftKind
          first | exact Or.inl rightKind | exact Or.inr ⟨_, rightKind⟩
  | interrupting parent | terminating =>
      have leftCancels : left.selection.kind = .terminating ∨ ∃ parent, left.selection.kind = .interrupting parent := by
        first | exact Or.inl leftKind | exact Or.inr ⟨_, leftKind⟩
      cases rightKind : right.selection.kind with
      | returning record =>
          exact (regional_return_cancellation_fields program before afterRight afterLeft finalRL finalLR hosting
            rightOperation leftOperation right left record valid running rightFound leftFound symmetric swapped rightKind leftCancels).symm
      | completing withdrawal =>
          exact (regional_completion_cancellation_fields program before afterRight afterLeft finalRL finalLR hosting
            rightOperation leftOperation right left withdrawal valid running rightFound leftFound symmetric swapped rightKind leftCancels).symm
      | interrupting otherParent | terminating =>
          apply regional_cancellation_pair_fields program before afterLeft afterRight finalLR finalRL hosting
            leftOperation rightOperation left right valid running leftFound rightFound independent square leftCancels
          first | exact Or.inl rightKind | exact Or.inr ⟨_, rightKind⟩

private theorem regional_pair_tokens_equal (program : Program)
    (before afterLeft afterRight finalLR finalRL : RuntimeState) (hosting : SemanticId)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true)
    (square : RegionalPairExecutionSquare program before afterLeft afterRight finalLR finalRL hosting
      leftOperation rightOperation left right) : finalLR.tokens = finalRL.tokens := by
  obtain ⟨leftKeep, leftOutputs, leftOwner, leftOutside, leftWrites, leftAction⟩ :=
    preparedRegional_token_action program before hosting leftOperation left valid running leftFound
  obtain ⟨rightKeep, rightOutputs, rightOwner, rightOutside, rightWrites, rightAction⟩ :=
    preparedRegional_token_action program before hosting rightOperation right valid running rightFound
  have leftFootprint := (prepareInternalRegional_facts program before leftOperation left leftFound).2.2.2.2.2.1
  have rightFootprint := (prepareInternalRegional_facts program before rightOperation right rightFound).2.2.2.2.2.1
  have leftKept (output : ControlPlaceId) (member : output ∈ leftOutputs) :
      rightKeep { placeId := output, owner := leftOwner } = true := by
    apply rightOutside
    have conflict := regional_independent_write_write _ _ (regionalStateFootprintsIndependent_symmetric _ _ independent) _ _
      (regionalStateFootprint_region_write before right.selection right.region right.footprint rightFootprint)
      (leftWrites output member)
    simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict
  have rightKept (output : ControlPlaceId) (member : output ∈ rightOutputs) :
      leftKeep { placeId := output, owner := rightOwner } = true := by
    apply leftOutside
    have conflict := regional_independent_write_write _ _ independent _ _
      (regionalStateFootprint_region_write before left.selection left.region left.footprint leftFootprint)
      (rightWrites output member)
    simpa [regionalStateAtomsConflict, regionalOwnsAtom, regionalOwnsOrdinaryAtom] using conflict
  have ordered : orderedBy controlTokenBefore before.tokens = true := by
    have components := valid
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at components
    have order : canonicalCollectionOrder before = true := by simp_all only
    simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at order
    exact order.1
  rw [rightAction afterLeft finalLR square.leftValid square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied,
    leftAction afterRight finalRL square.rightValid square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied,
    leftAction before afterLeft valid running square.leftRunning leftFound square.leftApplied,
    rightAction before afterRight valid running square.rightRunning rightFound square.rightApplied]
  exact regional_token_updates_commute before.tokens leftKeep rightKeep leftOutputs rightOutputs leftOwner rightOwner
    ordered leftKept rightKept

/-- Both complete preparations survive, both orders execute to literally the same canonical
state, and every successor is valid. All intermediate facts follow from the predecessor. -/
theorem prepared_regional_pair_commutes (program : Program) (before : RuntimeState)
    (hosting : SemanticId) (leftOperation rightOperation : SemanticOperation)
    (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    ∃ afterLeft afterRight after,
      applyPreparedInternalRegional? program before left = some afterLeft ∧
      applyPreparedInternalRegional? program before right = some afterRight ∧
      prepareInternalRegional? program afterLeft rightOperation = some right ∧
      prepareInternalRegional? program afterRight leftOperation = some left ∧
      applyPreparedInternalRegional? program afterLeft right = some after ∧
      applyPreparedInternalRegional? program afterRight left = some after ∧
      runtimeStateWellFormed program hosting afterLeft = true ∧
      runtimeStateWellFormed program hosting afterRight = true ∧
      runtimeStateWellFormed program hosting after = true := by
  obtain ⟨afterLeft, afterRight, finalLR, finalRL, square⟩ := regional_pair_execution_square program before hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent
  have fields := regional_pair_retained_fields_equal program before afterLeft afterRight finalLR finalRL hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent square
  have tokens := regional_pair_tokens_equal program before afterLeft afterRight finalLR finalRL hosting
    leftOperation rightOperation left right valid running leftFound rightFound independent square
  have leftCount := preparedRegional_end_count program before afterLeft hosting leftOperation left valid running
    square.leftRunning leftFound square.leftApplied
  have rightCount := preparedRegional_end_count program before afterRight hosting rightOperation right valid running
    square.rightRunning rightFound square.rightApplied
  have lrCount := preparedRegional_end_count program afterLeft finalLR hosting rightOperation right square.leftValid
    square.leftRunning square.lrRunning square.rightAfterLeft square.lrApplied
  have rlCount := preparedRegional_end_count program afterRight finalRL hosting leftOperation left square.rightValid
    square.rightRunning square.rlRunning square.leftAfterRight square.rlApplied
  have count : finalLR.endOccurrences = finalRL.endOccurrences := by
    rw [lrCount, rlCount, leftCount, rightCount]
    exact Nat.add_right_comm _ _ _
  have equal := congrArg (fun state : RuntimeState =>
    { state with tokens := finalLR.tokens, endOccurrences := finalLR.endOccurrences }) fields
  change finalLR = { finalRL with tokens := finalLR.tokens, endOccurrences := finalLR.endOccurrences } at equal
  rw [tokens, count] at equal
  exact ⟨afterLeft, afterRight, finalLR, square.leftApplied, square.rightApplied, square.rightAfterLeft,
    square.leftAfterRight, square.lrApplied, by simpa only [equal] using square.rlApplied,
    square.leftValid, square.rightValid, square.lrValid⟩

/-- Each operation accepts its original record, lifecycle and position template at its
assigned publication index in either execution order, with the same final state. -/
theorem prepared_regional_pair_execution_publication (program : Program) (before : RuntimeState)
    (hosting commandId : SemanticId) (leftIndex rightIndex : Nat)
    (leftOperation rightOperation : SemanticOperation) (left right : PreparedInternalRegional)
    (valid : runtimeStateWellFormed program hosting before = true)
    (running : before.control = .running hosting)
    (leftFound : prepareInternalRegional? program before leftOperation = some left)
    (rightFound : prepareInternalRegional? program before rightOperation = some right)
    (independent : regionalStateFootprintsIndependent left.footprint right.footprint = true) :
    ∃ afterLeft afterRight after,
      applyPreparedInternalRegional? program before left = some afterLeft ∧
      applyPreparedInternalRegional? program before right = some afterRight ∧
      prepareInternalRegional? program afterLeft rightOperation = some right ∧
      prepareInternalRegional? program afterRight leftOperation = some left ∧
      applyPreparedInternalRegional? program afterLeft right = some after ∧
      applyPreparedInternalRegional? program afterRight left = some after ∧
      RegionalExecutionPublication program before afterLeft leftOperation left hosting commandId leftIndex ∧
      RegionalExecutionPublication program before afterRight rightOperation right hosting commandId rightIndex ∧
      RegionalExecutionPublication program afterLeft after rightOperation right hosting commandId rightIndex ∧
      RegionalExecutionPublication program afterRight after leftOperation left hosting commandId leftIndex := by
  obtain ⟨afterLeft, afterRight, after, leftApplied, rightApplied, rightAfterLeft, leftAfterRight,
    lrApplied, rlApplied, leftValid, rightValid, _⟩ := prepared_regional_pair_commutes program before hosting
      leftOperation rightOperation left right valid running leftFound rightFound independent
  have programValid : programWellFormed program = true := by
    have parts := valid
    simp only [runtimeStateWellFormed, Bool.and_eq_true, and_assoc] at parts
    have position := parts.1
    simp only [runtimePositionValid, Bool.and_eq_true] at position
    exact position.1.1
  have published (state successor : RuntimeState) (operation : SemanticOperation)
      (prepared : PreparedInternalRegional) (index : Nat)
      (stateValid : runtimeStateWellFormed program hosting state = true)
      (found : prepareInternalRegional? program state operation = some prepared)
      (applied : applyPreparedInternalRegional? program state prepared = some successor) :
      RegionalExecutionPublication program state successor operation prepared hosting commandId index := by
    obtain ⟨actual, actualApplied, publication⟩ := prepareInternalRegional_execution_publication program state
      operation prepared hosting commandId index programValid stateValid found
    have same : actual = successor := Option.some.inj (actualApplied.symm.trans applied)
    subst actual
    exact publication
  exact ⟨afterLeft, afterRight, after, leftApplied, rightApplied, rightAfterLeft, leftAfterRight, lrApplied, rlApplied,
    published before afterLeft leftOperation left leftIndex valid leftFound leftApplied,
    published before afterRight rightOperation right rightIndex valid rightFound rightApplied,
    published afterLeft after rightOperation right rightIndex leftValid rightAfterLeft lrApplied,
    published afterRight after leftOperation left leftIndex rightValid leftAfterRight rlApplied⟩

end BpmnSemantics.SemanticProcess.InternalCommutation
