module

public import Kernel.Laws.State.Invariant

/-! # Laws of the kernel state: the transitions

The transitions the invariant (`Kernel.Laws.State.Invariant`) permits between two states, stated over the state's
fields: identities are never reused, activation counters only grow, the removal a cancelled scope occurrence permits
(`ClearsInside`), the work a hook leaves to `Step` and the cancellations it journals. `State.clearInside` of a scope
occurrence that stands in a well-formed state is a `ClearsInside` transition (`Laws.Scopes.clearInside_clears`), which
makes a Terminate End's and an interrupting Event Sub-Process start's clearings under the registered hooks ones
(`Proofs.Cancellation.registered_terminateClears`, `registered_interruptingStart`). Each law is followed by its
non-vacuity witness over the invariant's sample instance; `cleared` is that instance once its Sub-Process scope
occurrence is cleared. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- Identities are never reused: the counter never decreases, and an identifier present after a transition but not
before was issued at or above the counter's value before it
([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
structure IssuesFresh (before after : State) : Prop where
  monotone : before.nextIssue ≤ after.nextIssue
  occurrences : ∀ id ∈ occurrenceIds after, id ∉ occurrenceIds before → before.nextIssue ≤ id
  items : ∀ id ∈ after.openItems.map (·.id), id ∉ before.openItems.map (·.id) → before.nextIssue ≤ id
  scopes : ∀ id ∈ scopeIds after, id ∉ scopeIds before → before.nextIssue ≤ id.value

/-- Activation counters only grow, so a re-entered element's next occurrence has a number no earlier one had (R8,
[scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
def CountsGrow (before after : State) : Prop :=
  ∀ count ∈ before.activations, ∃ grown ∈ after.activations, grown.processInstance = count.processInstance ∧
    grown.element = count.element ∧ grown.role = count.role ∧ count.count ≤ grown.count

/-- Clearing the scope occurrence `scope`, keeping the occurrences `keep`: what a Terminate End does to its scope, keeping
its own occurrence, and an interrupting Event Sub-Process start to its parent, keeping the handler's
([scopes](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#terminate-end)), and what removing a caller region does
to a called subtree (PC-SCOPE-06 point 5, its removed-region half; an interrupting boundary cancels its host
occurrence instead). Everything inside goes, waits, work-stack entries and nested data included, except the kept
occurrences, their items and the scope occurrences they own. `scope` itself stays with its own variables, since removing
it with its contents is a rejected account, a terminated scope completes through the ordinary scope completion and an
interrupted parent's context is preserved for the handler. Everything outside stays unchanged, a sibling Call and the
caller's committed variables included; nothing is created and no identifier is issued. Feature slot entries are each
feature's own laws. -/
structure ClearsInside (before after : State) (scope : ScopeOccurrenceId) (keep : List Nat) : Prop where
  scopeStays : ∀ cleared ∈ before.scopes, cleared.id = scope → cleared ∈ after.scopes
  scopesOutside : ∀ other ∈ before.scopes, ¬ StrictlyWithin before other.id scope → other ∈ after.scopes
  occurrencesOutside : ∀ occurrence ∈ before.occurrences, ¬ Within before occurrence.scope scope →
    occurrence ∈ after.occurrences
  itemsOutside : ∀ item ∈ before.openItems, ¬ Within before item.scope scope → item ∈ after.openItems
  variablesOutside : ∀ variables ∈ before.variables, ¬ Within before variables.scope scope →
    variables ∈ after.variables
  variablesOwn : ∀ variables ∈ before.variables, variables.scope = scope → variables ∈ after.variables
  tokensOutside : ∀ token ∈ before.tokens, ¬ Within before token.busyScope scope → token ∈ after.tokens
  scopesInside : ∀ inner ∈ after.scopes, StrictlyWithin before inner.id scope →
    ∃ owner ∈ keep, inner.occurrence = some owner
  occurrencesInside : ∀ occurrence ∈ after.occurrences, Within before occurrence.scope scope → occurrence.id ∈ keep
  itemsInside : ∀ item ∈ after.openItems, Within before item.scope scope → item.occurrence ∈ keep
  variablesInside : ∀ variables ∈ after.variables, StrictlyWithin before variables.scope scope →
    ∃ owner ∈ keep, ∃ inner ∈ after.scopes, inner.id = variables.scope ∧ inner.occurrence = some owner
  tokensInside : ∀ token ∈ after.tokens, ¬ Within before token.busyScope scope
  noNewScopes : ∀ inner ∈ after.scopes, inner ∈ before.scopes
  noNewOccurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences
  noNewItems : ∀ item ∈ after.openItems, item ∈ before.openItems
  noNewVariables : ∀ variables ∈ after.variables, variables ∈ before.variables
  noIssue : after.nextIssue = before.nextIssue
  instanceKept : after.instanceId = before.instanceId

/-- A transition queued exactly the signals `new` after those already queued, and removed none: what a hook statement
says of the work it leaves to `Step`. -/
def Queues (before after : State) (new : List Signal) : Prop :=
  after.signals = before.signals ++ new

/-- `after`'s draft adds the cancelled facts `begun` and the cancelled end facts `keys`, one each, to `before`'s. -/
def CancelledWith (before after : State) (begun : List Occurrence) (keys : List OccurrenceKey) : Prop :=
  after.draft.cancelled = before.draft.cancelled ++ begun ∧
    after.draft.ended = before.draft.ended ++ keys.map (·, Terminal.cancelled) ∧ keys.length = begun.length ∧
    ∀ occurrence ∈ begun, occurrence.begun = true

/-- A transition journalled begun occurrences cancelled, after those already cancelled, together with one cancelled
end fact each (`CancelledWith`); the input's other end facts come from `State.recordEnd`. `Step` hands each cancelled
fact to `Hooks.cancelled` once, so the owning features hear of a removal exactly when its end is journalled. -/
def CancelsWithEnds (before after : State) : Prop :=
  ∃ (begun : List Occurrence) (keys : List OccurrenceKey), CancelledWith before after begun keys

theorem CancelsWithEnds.trans {first second third : State} (one : CancelsWithEnds first second)
    (two : CancelsWithEnds second third) : CancelsWithEnds first third := by
  obtain ⟨begun, keys, facts⟩ := one
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  obtain ⟨begun', keys', facts'⟩ := two
  obtain ⟨cancelled', ended', length', flagged'⟩ := facts'
  refine ⟨begun ++ begun', keys ++ keys', by simp [cancelled', cancelled], by simp [ended', ended], by simp [length,
    length'], ?_⟩
  intro occurrence member
  rcases List.mem_append.mp member with old | new
  · exact flagged occurrence old
  · exact flagged' occurrence new

theorem CancelsWithEnds.ofDraft {before after : State} (same : after.draft = before.draft) :
    CancelsWithEnds before after :=
  ⟨[], [], by simp [same], by simp [same], rfl, by simp⟩

/-! ## Non-vacuity -/

def cleared (kind : OpenKind) : State :=
  { sample kind with occurrences := [subProcess, outerTask], openItems := [outerItem kind] }

theorem sample_clears (kind : OpenKind) : ClearsInside (sample kind) (cleared kind) subScope [] where
  scopeStays := by simp [sample, cleared]
  scopesOutside := by simp [sample, cleared]
  occurrencesOutside := by
    simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro occurrence (rfl | rfl | rfl) outside
    · simp [cleared]
    · exact absurd (.refl _) outside
    · simp [cleared]
  itemsOutside := by
    simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro item (rfl | rfl) outside
    · exact absurd (.refl _) outside
    · simp [cleared]
  variablesOutside := fun variables member _ => by simpa [cleared] using member
  variablesOwn := fun variables member _ => by simpa [cleared] using member
  tokensOutside := by simp [sample]
  scopesInside := by
    simp only [cleared, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro inner (rfl | rfl) ⟨_, distinct⟩
    · exact absurd (Within.parentless (root_parentless rfl) ‹_›) (by simp [processRoot, subScope])
    · exact absurd rfl distinct
  occurrencesInside := by
    simp only [cleared, List.mem_cons, List.not_mem_nil, or_false]
    rintro occurrence (rfl | rfl) within <;> exact absurd within (root_outside rfl)
  itemsInside := by
    simp only [cleared, List.mem_cons, List.not_mem_nil, or_false]
    rintro item rfl within
    exact absurd within (root_outside rfl)
  variablesInside := by
    simp only [cleared, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro variables (rfl | rfl) ⟨within, distinct⟩
    · exact absurd within (root_outside rfl)
    · exact absurd rfl distinct
  tokensInside := by simp [cleared, sample]
  noNewScopes := by simp [cleared, sample]
  noNewOccurrences := by simp [cleared, sample]
  noNewItems := by simp [cleared, sample]
  noNewVariables := fun variables member => by simpa [cleared] using member
  noIssue := rfl
  instanceKept := rfl

/-- Keeping the cleared scope's waiting occurrence breaks `ClearsInside`, so the law demands the removal. -/
theorem survivor_rejected (kind : OpenKind) : ¬ ClearsInside (sample kind) (sample kind) subScope [] := fun clears => by
  have := clears.occurrencesInside innerTask (by simp [sample]) (.refl _)
  simp at this

/-- A Terminate End occurrence 8 in scope 2 clears it keeping itself, as `Propagation.arriveThrow` does. -/
def terminateEnd : Occurrence := { id := 8, element := ⟨"End"⟩, scope := subScope, activation := 1 }

def terminating (kind : OpenKind) : State :=
  { sample kind with occurrences := [subProcess, innerTask, outerTask, terminateEnd], nextIssue := 9 }

def terminated (kind : OpenKind) : State :=
  { terminating kind with occurrences := [subProcess, outerTask, terminateEnd], openItems := [outerItem kind] }

theorem terminate_clears (kind : OpenKind) : ClearsInside (terminating kind) (terminated kind) subScope [8] where
  scopeStays := by simp [terminating, terminated, sample]
  scopesOutside := by simp [terminating, terminated, sample]
  occurrencesOutside := by
    simp only [terminating, List.mem_cons, List.not_mem_nil, or_false]
    rintro occurrence (rfl | rfl | rfl | rfl) outside
    · simp [terminated]
    · exact absurd (.refl _) outside
    · simp [terminated]
    · exact absurd (.refl _) outside
  itemsOutside := by
    simp only [terminating, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro item (rfl | rfl) outside
    · exact absurd (.refl _) outside
    · simp [terminated]
  variablesOutside := fun variables member _ => by simpa [terminated, terminating] using member
  variablesOwn := fun variables member _ => by simpa [terminated, terminating] using member
  tokensOutside := by simp [terminating, sample]
  scopesInside := by
    simp only [terminated, terminating, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro inner (rfl | rfl) ⟨_, distinct⟩
    · exact absurd (Within.parentless (root_parentless rfl) ‹_›) (by simp [processRoot, subScope])
    · exact absurd rfl distinct
  occurrencesInside := by
    simp only [terminated, List.mem_cons, List.not_mem_nil, or_false]
    rintro occurrence (rfl | rfl | rfl) within
    · exact absurd within (root_outside rfl)
    · exact absurd within (root_outside rfl)
    · simp [terminateEnd]
  itemsInside := by
    simp only [terminated, List.mem_cons, List.not_mem_nil, or_false]
    rintro item rfl within
    exact absurd within (root_outside rfl)
  variablesInside := by
    simp only [terminated, terminating, sample, List.mem_cons, List.not_mem_nil, or_false]
    rintro variables (rfl | rfl) ⟨within, distinct⟩
    · exact absurd within (root_outside rfl)
    · exact absurd rfl distinct
  tokensInside := by simp [terminated, terminating, sample]
  noNewScopes := by simp [terminated, terminating]
  noNewOccurrences := by simp [terminated, terminating]
  noNewItems := by simp [terminated, terminating, sample]
  noNewVariables := fun variables member => by simpa [terminated, terminating] using member
  noIssue := rfl
  instanceKept := rfl

theorem sample_issues_fresh (kind : OpenKind) : IssuesFresh (sample kind) (cleared kind) where
  monotone := Nat.le_refl _
  occurrences := by simp [occurrenceIds, cleared, sample, subProcess, innerTask, outerTask]
  items := by simp [cleared, sample, innerItem, outerItem]
  scopes := by simp [scopeIds, cleared, sample]

/-- An identifier reappearing below the counter breaks `IssuesFresh`: occurrence 3 returns after scope 2 was cleared. -/
theorem reuse_rejected (kind : OpenKind) : ¬ IssuesFresh (cleared kind) (sample kind) := fun fresh => by
  have := fresh.occurrences 3 (by simp [occurrenceIds, sample, subProcess, innerTask, outerTask])
    (by simp [occurrenceIds, cleared, subProcess, outerTask])
  simp [cleared, sample] at this

theorem counts_grow (kind : OpenKind) : CountsGrow (sample kind) (sample kind) := by
  intro count member
  exact ⟨count, member, rfl, rfl, rfl, Nat.le_refl _⟩

theorem counts_shrink_rejected (kind : OpenKind) :
    ¬ CountsGrow (sample kind) { sample kind with activations := [] } := fun grow => by
  have := grow { processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 } (by simp [sample])
  simp at this

/-- A hook that queues one signal `Queues` it; dropping a queued signal does not. -/
theorem queues_one (kind : OpenKind) :
    Queues (sample kind) { sample kind with signals := [.armScope processRoot] } [.armScope processRoot] := by
  simp [Queues, sample]

theorem dropped_signal_rejected (kind : OpenKind) :
    ¬ Queues { sample kind with signals := [.armScope processRoot] } (sample kind) [] := by
  simp [Queues, sample]

/-- Cancelling the begun occurrence 3 with its end fact is a `CancelsWithEnds` transition; a cancelled fact without
its end is not. -/
theorem cancels_with_end (kind : OpenKind) :
    CancelsWithEnds (sample kind)
      { sample kind with draft := { cancelled := [innerTask], ended := [((sample kind).keyOf innerTask, .cancelled)] } } :=
  ⟨[innerTask], [(sample kind).keyOf innerTask], by simp [sample], by simp [sample], rfl, by simp [innerTask]⟩

theorem cancel_without_end_rejected (kind : OpenKind) :
    ¬ CancelsWithEnds (sample kind) { sample kind with draft := { cancelled := [innerTask] } } := by
  rintro ⟨begun, keys, facts⟩
  obtain ⟨cancelled, ended, length, _⟩ := facts
  simp [sample] at cancelled ended
  subst cancelled
  simp [ended] at length

end Kernel.Laws.State
