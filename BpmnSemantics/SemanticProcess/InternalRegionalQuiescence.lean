import BpmnSemantics.SemanticProcess.InternalRegionalCompletionPositionPublication
import BpmnSemantics.SemanticProcess.InternalRegionalLocalDataRetention

/-! Terminal Complete needs population emptiness, not just absence at one owner. RSI-OWN-01
transfers singleton-root quiescence to each wait family; REG-OWN-CLOSE-01 separately excludes
retained Activities whose last possible live body is a scope selected for removal. -/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

theorem exactLiveOccurrence_singleton_root (state : RuntimeState) (root : RuntimeScopeOccurrence)
    (scopes : state.scopeOccurrences = [root]) (owner : ScopeOccurrenceId)
    (live : exactLiveOccurrence state owner = true) : owner = root.id := by
  by_cases same : root.id = owner
  · exact same.symm
  · simp [exactLiveOccurrence, scopes, same] at live

/-- The census retains multiplicity: every represented value would witness the forbidden owner. -/
theorem singleton_root_population_empty {α : Type} (state : RuntimeState)
    (root : RuntimeScopeOccurrence) (values : List α) (owner : α → ScopeOccurrenceId)
    (scopes : state.scopeOccurrences = [root])
    (live : values.all (fun value => exactLiveOccurrence state (owner value)) = true)
    (quiet : (!(values.any fun value => owner value == root.id)) = true) : values = [] := by
  apply List.eq_nil_iff_forall_not_mem.mpr
  intro value member
  have same := exactLiveOccurrence_singleton_root state root scopes (owner value)
    (List.all_eq_true.mp live value member)
  have present : (values.any fun value => owner value == root.id) = true :=
    List.any_eq_true.mpr ⟨value, member, by simp [same]⟩
  simp [present] at quiet

theorem quiescent_singleton_root_wait_fields (state : RuntimeState)
    (root : RuntimeScopeOccurrence) (scopes : state.scopeOccurrences = [root])
    (owners : waitOwnersLive state = true) (quiet : scopeQuiescent state root.id = true) :
    state.waits = [] ∧ state.messageWaits = [] ∧ state.timerWaits = [] ∧
      state.effectWaits = [] ∧ state.effectIncidents = [] ∧ state.selectedBranchSets = [] ∧
      state.eventRaces = [] ∧ state.calledProcessOccurrences = [] := by
  simp only [waitOwnersLive, Bool.and_eq_true] at owners
  rcases owners with ⟨⟨⟨⟨⟨⟨⟨⟨tasks, messages⟩, timers⟩, effects⟩, incidents⟩, branches⟩, races⟩, calls⟩, _⟩
  simp only [scopeQuiescent, Bool.and_eq_true] at quiet
  rcases quiet with ⟨⟨⟨⟨⟨⟨⟨⟨⟨⟨_, tasksQuiet⟩, messagesQuiet⟩, timersQuiet⟩, effectsQuiet⟩,
    incidentsQuiet⟩, branchesQuiet⟩, racesQuiet⟩, callsQuiet⟩, _⟩, _⟩
  exact ⟨singleton_root_population_empty state root _ (·.owner) scopes tasks tasksQuiet,
    singleton_root_population_empty state root _ (·.owner) scopes messages messagesQuiet,
    singleton_root_population_empty state root _ (·.owner) scopes timers timersQuiet,
    singleton_root_population_empty state root _ (·.owner) scopes effects effectsQuiet,
    singleton_root_population_empty state root _ (·.wait.owner) scopes incidents incidentsQuiet,
    singleton_root_population_empty state root _ (·.owner) scopes branches branchesQuiet,
    singleton_root_population_empty state root _ (·.owner) scopes races racesQuiet,
    singleton_root_population_empty state root _ (·.caller) scopes calls callsQuiet⟩

/-- AOO-BODY-01 supplies existence; REG-OWN-CLOSE-01 then forbids retaining an Activity when
all scope bodies are removed and no task body exists. Removed predecessor Activities remain allowed. -/
theorem retained_activities_empty_of_no_body (before : RuntimeState)
    (keep : RegionalReferenceRetention)
    (bodies : ∀ record ∈ before.activityOccurrences, activityBodyLive before record = true)
    (tasks : before.waits = [])
    (scopes : ∀ scope ∈ before.scopeOccurrences, keep.scope scope = false)
    (closed : regionalOwnershipClosed before keep = true) :
    before.activityOccurrences.filter keep.activity = [] := by
  apply List.filter_eq_nil_iff.mpr
  intro record member
  intro retained
  have live := bodies record member
  have recordClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).1 record member
  simp only [retained, Bool.not_true, Bool.false_or] at recordClosed
  have bodyClosed := (Bool.and_eq_true_iff.mp recordClosed).1
  cases body : record.body with
  | userTask task => simp [activityBodyLive, body, tasks] at live
  | parallelUserTasks first rest => simp [activityBodyLive, body, tasks] at live
  | childScope scope =>
      simp only [body] at bodyClosed
      have census := allMatchingRetained_preserves_census before.scopeOccurrences keep.scope
        (fun occurrence => decide (occurrence.id = scope)) bodyClosed
      have empty : before.scopeOccurrences.filter keep.scope = [] :=
        List.filter_eq_nil_iff.mpr (by intro scope member; simp [scopes scope member])
      rw [empty] at census
      simp only [activityBodyLive, body, exactLiveOccurrence, ← census] at live
      simp at live

/-- AOO-BODY-01 accepts a child body naming the last live root; REG-OWN-CLOSE-01 is the
separating condition when Complete removes that root but would retain the Activity. -/
theorem live_child_root_does_not_imply_regional_closure (state : RuntimeState)
    (root : RuntimeScopeOccurrence) (record : ActivityOccurrence) (keep : RegionalReferenceRetention)
    (scopes : state.scopeOccurrences = [root]) (member : record ∈ state.activityOccurrences)
    (body : record.body = .childScope root.id) (retained : keep.activity record = true)
    (removed : keep.scope root = false) :
    activityBodyLive state record = true ∧ regionalOwnershipClosed state keep = false := by
  constructor
  · simp [activityBodyLive, body, exactLiveOccurrence, scopes]
  · apply Bool.eq_false_iff.mpr
    intro closed
    have recordClosed := List.all_eq_true.mp (Bool.and_eq_true_iff.mp closed).1 record member
    simp [retained, regionalActivityReferencesClosed, body, allMatchingRetained, scopes,
      removed] at recordClosed

end BpmnSemantics.SemanticProcess.InternalCommutation
