module

public import Kernel.State

/-! # Laws of the kernel state

The invariants every reachable `State` keeps and the transitions it permits, stated over the state's fields alone and
independent of the operations that produce them: occurrence identity, ownership, the scope tree, and the removal a
cancelled scope occurrence permits. Nothing executable imports this module; the proof wave proves `Step` preserves the
invariants and that its cancellations are `ClearsInside` transitions ([kernel architecture](../../docs/kernel/ARCHITECTURE-SPEC.md#lean-assurance-lane)).

Besides the state's fields a law names only `Token.busyScope`, a total projection of one work-stack entry whose result
the `State` contract documents, since matching `Token` is `Step`'s
([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).

Each law is followed by its non-vacuity witness: a small state that satisfies it and, where the law could otherwise hold
of everything, one that violates it. The witnesses read only the law, never a `State` operation's body.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The scope tree -/

/-- `Within s inner outer`: the scope occurrence `inner` is `outer` or lies below it by parent links of `s`. A
called instance's root counts as inside its caller, since removing the caller region removes the called subtree
([scopes, PC-SCOPE-06](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-scope-06-exceptional-call-return-and-propagated-cancellation)). -/
inductive Within (s : State) : ScopeOccurrenceId → ScopeOccurrenceId → Prop where
  | refl (scope : ScopeOccurrenceId) : Within s scope scope
  | parent (child : ScopeOccurrence) (parent outer : ScopeOccurrenceId) :
      child ∈ s.scopes → child.parent = some parent → Within s parent outer → Within s child.id outer

/-- A scope occurrence without a parent link contains only itself. -/
theorem Within.parentless {s : State} {inner outer : ScopeOccurrenceId}
    (orphan : ∀ scope ∈ s.scopes, scope.id = inner → scope.parent = none) (within : Within s inner outer) :
    inner = outer := by
  cases within with
  | refl => rfl
  | parent child parent _ member link _ => simp [orphan child member rfl] at link

/-- `inner` lies strictly below `outer`. -/
def StrictlyWithin (s : State) (inner outer : ScopeOccurrenceId) : Prop :=
  Within s inner outer ∧ inner ≠ outer

/-- The scope identifiers of `s`. -/
def scopeIds (s : State) : List ScopeOccurrenceId := s.scopes.map (·.id)

/-- The occurrence identifiers of `s`. -/
def occurrenceIds (s : State) : List Nat := s.occurrences.map (·.id)

/-! ## Identity -/

/-- Every identifier the state holds was issued before `nextIssue`, so the counter names only fresh identities: an
occurrence's identity is never reused ([scopes, SRE-FRESH-01](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
structure IssuedBelow (s : State) : Prop where
  occurrences : ∀ occurrence ∈ s.occurrences, occurrence.id < s.nextIssue
  items : ∀ item ∈ s.openItems, item.id < s.nextIssue
  scopes : ∀ scope ∈ s.scopes, scope.id.value < s.nextIssue

/-- No two occurrences, open items or scope occurrences share an identifier. -/
structure Distinct (s : State) : Prop where
  occurrences : (occurrenceIds s).Nodup
  items : (s.openItems.map (·.id)).Nodup
  scopes : (scopeIds s).Nodup

/-- Within one input's journal no occurrence key starts twice: re-entry and repetition give a new activation, never a
reused one ([scopes, SRE-FRESH-01](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
def StartedOnce (s : State) : Prop :=
  ((s.journal.flatMap (·.started) ++ s.draft.started).map (·.occurrence)).Nodup

/-- One activation counter per process instance, element and role (R8), each at least 1 once recorded. -/
structure ActivationsKeyed (s : State) : Prop where
  keys : (s.activations.map fun count => (count.processInstance, count.element, count.role)).Nodup
  positive : ∀ count ∈ s.activations, 0 < count.count

/-- An unbegun reservation keeps no start fact: a subscription's flow node runs only when its trigger arrives
([scopes, Event Sub-Processes](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#event-sub-processes)). -/
def ReservationsUnstarted (s : State) : Prop :=
  ∀ occurrence ∈ s.occurrences, occurrence.begun = false →
    ∀ fact ∈ s.journal.flatMap (·.started) ++ s.draft.started,
      ¬ (fact.owner = occurrence.scope ∧ fact.occurrence.element = occurrence.element ∧
          fact.occurrence.activation = occurrence.activation ∧ fact.occurrence.role = occurrence.role)

/-! ## Ownership -/

/-- Every reference resolves inside the state: each occurrence, open item, variable set and work-stack entry belongs to
a present scope occurrence; each open item waits for a present occurrence of its own element, which makes the item's
public identity that occurrence's; a subscription hangs on a present occurrence; a scope occurrence's owning occurrence
is present. -/
structure Owned (s : State) : Prop where
  occurrenceScopes : ∀ occurrence ∈ s.occurrences, occurrence.scope ∈ scopeIds s
  itemScopes : ∀ item ∈ s.openItems, item.scope ∈ scopeIds s
  itemOccurrences : ∀ item ∈ s.openItems, ∃ occurrence ∈ s.occurrences,
    occurrence.id = item.occurrence ∧ occurrence.element = item.element
  attachments : ∀ item ∈ s.openItems, ∀ host, item.attachedTo = some host → host ∈ occurrenceIds s
  scopeOwners : ∀ scope ∈ s.scopes, ∀ owner, scope.occurrence = some owner → owner ∈ occurrenceIds s
  variableScopes : ∀ variables ∈ s.variables, variables.scope ∈ scopeIds s
  tokenScopes : ∀ token ∈ s.tokens, token.busyScope ∈ scopeIds s

/-- The scope occurrences form one tree: exactly one has no parent, the process instance's, and every one reaches it,
so no parent chain cycles. -/
def Rooted (s : State) : Prop :=
  ∃ root ∈ scopeIds s, (∀ scope ∈ s.scopes, scope.parent = none ↔ scope.id = root) ∧
    ∀ scope ∈ s.scopes, Within s scope.id root

/-- One variable set per scope occurrence, each binding a name at most once: a scope occurrence owns its data, and a
name declared again in a nested scope shadows the outer one rather than repeating in it
([data, scope data](../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#scope-data),
[CIB-EXT-0020](../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes)). -/
structure VariablesKeyed (s : State) : Prop where
  scopes : (s.variables.map (·.scope)).Nodup
  names : ∀ variables ∈ s.variables, (variables.entries.map (·.1)).Nodup

/-- A failure is recorded exactly when the instance failed. -/
def FailureRecorded (s : State) : Prop :=
  s.failure.isSome = true ↔ s.status = .failed

/-- The state invariants together. -/
structure WellFormed (s : State) : Prop where
  issued : IssuedBelow s
  distinct : Distinct s
  startedOnce : StartedOnce s
  activations : ActivationsKeyed s
  reservations : ReservationsUnstarted s
  owned : Owned s
  rooted : Rooted s
  variables : VariablesKeyed s
  failure : FailureRecorded s

/-! ## Permitted transitions -/

/-- Identities are never reused: the counter never decreases, and an identifier present after a transition but not
before was issued at or above the counter's value before it
([scopes, SRE-FRESH-01](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
structure IssuesFresh (before after : State) : Prop where
  monotone : before.nextIssue ≤ after.nextIssue
  occurrences : ∀ id ∈ occurrenceIds after, id ∉ occurrenceIds before → before.nextIssue ≤ id
  items : ∀ id ∈ after.openItems.map (·.id), id ∉ before.openItems.map (·.id) → before.nextIssue ≤ id
  scopes : ∀ id ∈ scopeIds after, id ∉ scopeIds before → before.nextIssue ≤ id.value

/-- Activation counters only grow, so a re-entered element's next occurrence has a number no earlier one had (R8,
[scopes, SRE-FRESH-01](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
def CountsGrow (before after : State) : Prop :=
  ∀ count ∈ before.activations, ∃ grown ∈ after.activations, grown.processInstance = count.processInstance ∧
    grown.element = count.element ∧ grown.role = count.role ∧ count.count ≤ grown.count

/-- Clearing the scope occurrence `scope`, keeping the occurrences `keep`: what a Terminate End does to its scope, keeping
its own occurrence, and an interrupting Event Sub-Process start to its parent, keeping the handler's
([scopes](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#terminate-end)), and what removing a caller region does
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

/-! ## Non-vacuity

A process instance (scope 0) with a Sub-Process occurrence 1 whose scope occurrence 2 holds a waiting occurrence 3 and
its item 4, beside a waiting occurrence 5 of the root and its item 6; `cleared` is the same instance once scope 2 is
cleared. The open-item kind is a parameter, so no witness depends on what an item waits for. -/

def processRoot : ScopeOccurrenceId := ⟨0⟩
def subScope : ScopeOccurrenceId := ⟨2⟩

def subProcess : Occurrence := { id := 1, element := ⟨"Sub"⟩, scope := processRoot, activation := 1 }
def innerTask : Occurrence := { id := 3, element := ⟨"Inner"⟩, scope := subScope, activation := 1 }
def outerTask : Occurrence := { id := 5, element := ⟨"Outer"⟩, scope := processRoot, activation := 1 }

def rootScope : ScopeOccurrence := { id := processRoot, element := none, parent := none }
def childScope : ScopeOccurrence := { id := subScope, element := some ⟨"Sub"⟩, parent := some processRoot, occurrence := some 1 }

def innerItem (kind : OpenKind) : OpenItem := { id := 4, kind, element := ⟨"Inner"⟩, scope := subScope, occurrence := 3 }
def outerItem (kind : OpenKind) : OpenItem := { id := 6, kind, element := ⟨"Outer"⟩, scope := processRoot, occurrence := 5 }

def sample (kind : OpenKind) : State :=
  { instanceId := "p", scopes := [rootScope, childScope], occurrences := [subProcess, innerTask, outerTask]
    variables := [{ scope := processRoot, entries := [("a", .int 1)] }, { scope := subScope, entries := [] }]
    openItems := [innerItem kind, outerItem kind], nextIssue := 7
    activations := [{ processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Inner"⟩, role := .element, count := 1 },
      { processInstance := "p", element := ⟨"Outer"⟩, role := .element, count := 1 }] }

def cleared (kind : OpenKind) : State :=
  { sample kind with occurrences := [subProcess, outerTask], openItems := [outerItem kind] }

theorem root_parentless {s : State} (scopes : s.scopes = [rootScope, childScope]) :
    ∀ scope ∈ s.scopes, scope.id = processRoot → scope.parent = none := by
  simp [scopes, rootScope, childScope, processRoot, subScope]

theorem sub_within {kind : OpenKind} : Within (sample kind) subScope processRoot :=
  .parent childScope processRoot processRoot (by simp [sample]) rfl (.refl _)

theorem root_outside {s : State} (scopes : s.scopes = [rootScope, childScope]) : ¬ Within s processRoot subScope :=
  fun within => by
  have := Within.parentless (root_parentless scopes) within
  simp [processRoot, subScope] at this

theorem sample_wellFormed (kind : OpenKind) : WellFormed (sample kind) where
  issued := ⟨by simp [sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [sample, rootScope, childScope, processRoot, subScope]⟩
  distinct := ⟨by simp [occurrenceIds, sample, subProcess, innerTask, outerTask], by simp [sample, innerItem, outerItem],
    by simp [scopeIds, sample, rootScope, childScope, processRoot, subScope]⟩
  startedOnce := by simp [StartedOnce, sample]
  activations := ⟨by simp [sample], by simp [sample]⟩
  reservations := by simp [ReservationsUnstarted, sample, subProcess, innerTask, outerTask]
  owned := {
    occurrenceScopes := by simp [sample, scopeIds, subProcess, innerTask, outerTask, rootScope, childScope]
    itemScopes := by simp [sample, scopeIds, innerItem, outerItem, rootScope, childScope]
    itemOccurrences := by simp [sample, innerItem, outerItem, subProcess, innerTask, outerTask]
    attachments := by simp [sample, innerItem, outerItem]
    scopeOwners := by simp [sample, occurrenceIds, rootScope, childScope, subProcess, innerTask, outerTask]
    variableScopes := by simp [sample, scopeIds, rootScope, childScope]
    tokenScopes := by simp [sample] }
  rooted := ⟨processRoot, by simp [scopeIds, sample, rootScope],
    by simp [sample, rootScope, childScope, processRoot, subScope], by
      simp only [sample, List.mem_cons, List.not_mem_nil, or_false]
      rintro scope (rfl | rfl)
      · exact .refl _
      · exact sub_within⟩
  variables := ⟨by simp [sample, processRoot, subScope], by simp [sample]⟩
  failure := by simp [FailureRecorded, sample]

/-- An identifier at or above the counter violates `IssuedBelow`, so the law excludes states. -/
theorem stale_counter_rejected (kind : OpenKind) : ¬ IssuedBelow { sample kind with nextIssue := 5 } := fun issued => by
  have := issued.occurrences outerTask (by simp [sample])
  simp [outerTask] at this

/-- A second parentless scope breaks `Rooted`. -/
theorem forest_rejected (kind : OpenKind) :
    ¬ Rooted { sample kind with scopes := [rootScope, { childScope with parent := none }] } := by
  rintro ⟨root, _, parentless, _⟩
  have first := (parentless rootScope (by simp)).mp rfl
  have second := (parentless { childScope with parent := none } (by simp)).mp rfl
  simp [rootScope, childScope, processRoot, subScope] at first second
  simp [← first] at second

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

/-- A root wait with an armed reservation 7 beside it, and the start facts of the begun waits in the draft. -/
def reservation : Occurrence :=
  { id := 7, element := ⟨"Timer"⟩, scope := processRoot, activation := 1, begun := false }

def startFact (occurrence : Occurrence) : StartedFact :=
  { occurrence := { processInstanceId := "p", element := occurrence.element, activation := occurrence.activation }
    owner := occurrence.scope, sourceType := "task" }

def armedState (kind : OpenKind) : State :=
  { sample kind with
    occurrences := [subProcess, innerTask, outerTask, reservation], nextIssue := 8,
    draft := { started := [startFact innerTask, startFact outerTask] } }

theorem armed_unstarted (kind : OpenKind) : ReservationsUnstarted (armedState kind) := by
  simp [ReservationsUnstarted, armedState, sample, subProcess, innerTask, outerTask, reservation, startFact]

theorem armed_started_once (kind : OpenKind) : StartedOnce (armedState kind) := by
  simp [StartedOnce, armedState, sample, startFact, innerTask, outerTask]

theorem early_start_rejected (kind : OpenKind) :
    ¬ ReservationsUnstarted { armedState kind with draft := { started := [startFact reservation] } } := fun unstarted => by
  have := unstarted reservation (by simp [armedState]) rfl (startFact reservation) (by simp)
  simp [startFact, reservation] at this

theorem restart_rejected (kind : OpenKind) :
    ¬ StartedOnce { armedState kind with draft := { started := [startFact innerTask, startFact innerTask] } } := by
  simp [StartedOnce, armedState, sample]

/-- An item waiting for an occurrence that is gone breaks `Owned`. -/
theorem dangling_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := [{ innerItem kind with occurrence := 9 }] } := fun owned => by
  obtain ⟨occurrence, member, same, _⟩ := owned.itemOccurrences { innerItem kind with occurrence := 9 } (by simp)
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask] at same

/-- A name bound twice in one variable set breaks `VariablesKeyed`. -/
theorem repeated_name_rejected (kind : OpenKind) :
    ¬ VariablesKeyed { sample kind with variables := [{ scope := processRoot, entries := [("a", .int 1), ("a", .int 2)] }] } :=
  fun keyed => by
    have := keyed.names { scope := processRoot, entries := [("a", .int 1), ("a", .int 2)] } (by simp)
    simp at this

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

end Kernel.Laws.State
