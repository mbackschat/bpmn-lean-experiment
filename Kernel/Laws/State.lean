module

public import Kernel.State
public import Kernel.State.Removal
import all Kernel.State
import all Kernel.State.Removal

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

The last section holds the lemmas about `Kernel.State`'s operations that the proof wave composes: this is the one module
that sees their bodies ([module table](../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).
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
a present scope occurrence; each open item waits for a present occurrence of its own element in its own scope
occurrence, which makes the item's public identity that occurrence's (`State.openItem` and `State.openSubscription`
give the item its occurrence's scope); a subscription hangs on a present occurrence; a scope occurrence's owning
occurrence is present. -/
structure Owned (s : State) : Prop where
  occurrenceScopes : ∀ occurrence ∈ s.occurrences, occurrence.scope ∈ scopeIds s
  itemScopes : ∀ item ∈ s.openItems, item.scope ∈ scopeIds s
  itemOccurrences : ∀ item ∈ s.openItems, ∃ occurrence ∈ s.occurrences,
    occurrence.id = item.occurrence ∧ occurrence.element = item.element ∧ occurrence.scope = item.scope
  attachments : ∀ item ∈ s.openItems, ∀ host, item.attachedTo = some host → host ∈ occurrenceIds s
  scopeOwners : ∀ scope ∈ s.scopes, ∀ owner, scope.occurrence = some owner → owner ∈ occurrenceIds s
  variableScopes : ∀ variables ∈ s.variables, variables.scope ∈ scopeIds s
  tokenScopes : ∀ token ∈ s.tokens, token.busyScope ∈ scopeIds s

/-- The scope occurrences form one tree rooted at `State.root`: it is present, it is the only one without a parent, and
every one reaches it, so no parent chain cycles. The root is named, not merely unique, because `State.initial` is the
only constructor of a parentless scope occurrence and gives it `State.root`; every later one is entered below a parent,
so an operation that falls back to `State.root` addresses a present scope occurrence. -/
def Rooted (s : State) : Prop :=
  State.root ∈ scopeIds s ∧ (∀ scope ∈ s.scopes, scope.parent = none ↔ scope.id = State.root) ∧
    ∀ scope ∈ s.scopes, Within s scope.id State.root

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
  rooted := ⟨by simp [scopeIds, sample, rootScope, processRoot, State.root],
    by simp [sample, rootScope, childScope, processRoot, subScope, State.root], by
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
  rintro ⟨_, parentless, _⟩
  have second := (parentless { childScope with parent := none } (by simp)).mp rfl
  simp [childScope, subScope, State.root] at second

/-- A lone parentless scope occurrence other than `State.root` breaks `Rooted`. -/
theorem foreign_root_rejected (kind : OpenKind) : ¬ Rooted { sample kind with scopes := [{ rootScope with id := ⟨7⟩ }] } := by
  rintro ⟨present, _, _⟩
  simp [scopeIds, State.root] at present

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

/-- An item filed in another scope occurrence than its occurrence's breaks `Owned`. -/
theorem misfiled_item_rejected (kind : OpenKind) :
    ¬ Owned { sample kind with openItems := [{ innerItem kind with scope := processRoot }] } := fun owned => by
  obtain ⟨occurrence, member, same, facts⟩ := owned.itemOccurrences { innerItem kind with scope := processRoot } (by simp)
  obtain ⟨_, scope⟩ := facts
  simp only [sample, List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl | rfl <;> simp [subProcess, innerTask, outerTask, innerItem, processRoot, subScope] at same scope

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

/-! ## Operations

What `Kernel.State`'s operations do to the fields the laws read. -/

/-- `Within` reads only the scope occurrences. -/
theorem Within.congr {s t : State} (scopes : t.scopes = s.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes ▸ member) link ih

/-- A begin without a reservation issues an occurrence of the requested element, in the requested scope occurrence, on
the requested flow, numbered under `role`. -/
theorem beginOccurrence_fresh {state : State} {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    (fresh : request.reserved = none) :
    (state.beginOccurrence request role sourceType).2.element = request.element ∧
      (state.beginOccurrence request role sourceType).2.scope = request.scope ∧
      (state.beginOccurrence request role sourceType).2.incoming = request.incoming ∧
      (state.beginOccurrence request role sourceType).2.role = role := by
  simp [State.beginOccurrence, fresh]

/-- `beginOccurrence` keeps the scope occurrences, the variable sets and the logical time. -/
theorem beginOccurrence_keeps (state : State) (request : BeginRequest) (role : ActivationRole) (sourceType : String) :
    (state.beginOccurrence request role sourceType).1.scopes = state.scopes ∧
      (state.beginOccurrence request role sourceType).1.variables = state.variables ∧
      (state.beginOccurrence request role sourceType).1.logicalTimeMs = state.logicalTimeMs := by
  simp only [State.beginOccurrence, State.recordStart]
  split <;> simp [State.activate, State.issue]

/-- What a scope occurrence sees reads only the scope occurrences and the variable sets. -/
theorem visible_congr {s t : State} (scopes : t.scopes = s.scopes) (variables : t.variables = s.variables)
    (program : Program) (scope : ScopeOccurrenceId) : t.visible program scope = s.visible program scope := by
  have shows : t.shows program = s.shows program := by
    funext id name; simp [State.shows, scopes]
  have called : t.calledRoot = s.calledRoot := by
    funext id; simp [State.calledRoot, scopes]
  have go : ∀ (fuel : Nat) (current : Option ScopeOccurrenceId),
      State.visible.go t program fuel current = State.visible.go s program fuel current := by
    intro fuel
    induction fuel with
    | zero => intro current; simp [State.visible.go]
    | succ fuel ih =>
      intro current
      cases current with
      | none => simp [State.visible.go]
      | some id => simp [State.visible.go, shows, called, scopes, variables, ih]
  simp only [State.visible, go, scopes]

/-- What `WellFormed` reads besides the variable sets: `setVariable` and `removeVariable` keep all of it. -/
structure SameButVariables (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  journal : after.journal = before.journal
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure

/-- `setVariable` changes only the variable sets and the write log. -/
private theorem setVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    SameButVariables state (state.setVariable target name value) := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- The variable sets after `setVariable`: the target's set rebinds or appends the name, or a new set holds it. -/
private theorem setVariable_variables (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) :
    (state.setVariable target name value).variables =
      if state.variables.any (·.scope == target) then
        state.variables.map fun vars => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars
      else state.variables ++ [{ scope := target, entries := [(name, value)] }] := by
  unfold State.setVariable
  dsimp only
  split <;> split <;> rfl

/-- Rebinding or appending a name keeps a set's names distinct. -/
private theorem names_after_set (entries : List (String × Value)) (name : String) (value : Value)
    (nodup : (entries.map (·.1)).Nodup) :
    ((if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
      else entries ++ [(name, value)]).map (·.1)).Nodup := by
  split
  · rename_i present
    have same : ((entries.map fun entry => if entry.1 == name then (name, value) else entry).map (·.1)) =
        entries.map (·.1) := by
      simp only [List.map_map]
      apply List.map_congr_left
      intro entry _
      by_cases targeted : entry.1 = name <;> simp [targeted]
    rw [same]; exact nodup
  · rename_i absent
    simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
    rw [List.map_append, List.nodup_append]
    refine ⟨nodup, by simp, ?_⟩
    intro first member second other
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    subst other; subst named
    exact fun targeted => absent entry inside targeted

/-- `setVariable` keeps the variable sets keyed, whichever scope occurrence it writes to. -/
theorem setVariable_variablesKeyed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (keyed : VariablesKeyed state) : VariablesKeyed (state.setVariable target name value) := by
  constructor
  · rw [setVariable_variables]
    split
    · rw [List.map_map]
      have same : ((·.scope) ∘ fun (vars : ScopeVariables) => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars) = (·.scope) := by
        funext vars
        by_cases targeted : vars.scope = target <;> simp [targeted]
      rw [same]; exact keyed.scopes
    · rename_i absent
      simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
      rw [List.map_append, List.nodup_append]
      refine ⟨keyed.scopes, by simp, ?_⟩
      intro first member second other
      simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
      obtain ⟨vars, inside, located⟩ := List.mem_map.mp member
      subst other; subst located
      exact fun targeted => absent vars inside targeted
  · intro vars member
    rw [setVariable_variables] at member
    split at member
    · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
      subst made
      by_cases targeted : old.scope = target
      · simp only [targeted, beq_self_eq_true, ite_true]
        exact names_after_set old.entries name value (keyed.names old inside)
      · simp only [beq_iff_eq, targeted, ite_false]
        exact keyed.names old inside
    · rcases List.mem_append.mp member with old | fresh
      · exact keyed.names vars old
      · simp only [List.mem_singleton] at fresh
        subst fresh
        simp

/-- A state that differs from a well-formed one only in its variable sets is well-formed when every set belongs to a
present scope occurrence and the sets stay keyed. -/
theorem WellFormed.ofVariables {before after : State} (formed : WellFormed before) (same : SameButVariables before after)
    (located : ∀ variables ∈ after.variables, variables.scope ∈ scopeIds after) (keyed : VariablesKeyed after) :
    WellFormed after where
  issued := ⟨by simpa [same.occurrences, same.nextIssue] using formed.issued.occurrences,
    by simpa [same.openItems, same.nextIssue] using formed.issued.items,
    by simpa [same.scopes, same.nextIssue] using formed.issued.scopes⟩
  distinct := ⟨by simpa [occurrenceIds, same.occurrences] using formed.distinct.occurrences,
    by simpa [same.openItems] using formed.distinct.items, by simpa [scopeIds, same.scopes] using formed.distinct.scopes⟩
  startedOnce := by simpa [StartedOnce, same.journal, same.draft] using formed.startedOnce
  activations := ⟨by simpa [same.activations] using formed.activations.keys,
    by simpa [same.activations] using formed.activations.positive⟩
  reservations := by simpa [ReservationsUnstarted, same.occurrences, same.journal, same.draft] using formed.reservations
  owned := {
    occurrenceScopes := by simpa [scopeIds, same.occurrences, same.scopes] using formed.owned.occurrenceScopes
    itemScopes := by simpa [scopeIds, same.openItems, same.scopes] using formed.owned.itemScopes
    itemOccurrences := by simpa [same.openItems, same.occurrences] using formed.owned.itemOccurrences
    attachments := by simpa [occurrenceIds, same.openItems, same.occurrences] using formed.owned.attachments
    scopeOwners := by simpa [occurrenceIds, same.scopes, same.occurrences] using formed.owned.scopeOwners
    variableScopes := located
    tokenScopes := by simpa [scopeIds, same.tokens, same.scopes] using formed.owned.tokenScopes }
  rooted := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, same.scopes] using present, by simpa [same.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr same.scopes (reach scope (same.scopes ▸ member))
  variables := keyed
  failure := by simpa [FailureRecorded, same.failure, same.status] using formed.failure

/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed state) (present : target ∈ scopeIds state) :
    WellFormed (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_ (setVariable_variablesKeyed formed.variables)
  intro vars member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables] at member
  split at member
  · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · rcases List.mem_append.mp member with old | fresh
    · exact formed.owned.variableScopes vars old
    · simp only [List.mem_singleton] at fresh
      subst fresh
      exact present

/-- `removeVariable` changes only the variable sets and the write log. -/
private theorem removeVariable_same (state : State) (target : ScopeOccurrenceId) (name : String) :
    SameButVariables state (state.removeVariable target name) :=
  ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed state) : WellFormed (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_ ⟨?_, ?_⟩
  · intro vars member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [State.removeVariable, targeted, scopeIds] using this
  · have same : ((state.removeVariable target name).variables.map (·.scope)) = state.variables.map (·.scope) := by
      simp only [State.removeVariable, List.map_map]
      apply List.map_congr_left
      intro vars _
      by_cases targeted : vars.scope = target <;> simp [targeted]
    rw [same]; exact formed.variables.scopes
  · intro vars member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have nodup := formed.variables.names old inside
    by_cases targeted : old.scope = target
    · simp only [targeted, beq_self_eq_true, ite_true]
      exact nodup.sublist ((List.filter_sublist).map _)
    · simp only [beq_iff_eq, targeted, ite_false]
      exact nodup

/-! ### Cancellation facts -/

private theorem CancelsWithEnds.trans {first second third : State} (one : CancelsWithEnds first second)
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

private theorem CancelsWithEnds.ofDraft {before after : State} (same : after.draft = before.draft) :
    CancelsWithEnds before after :=
  ⟨[], [], by simp [same], by simp [same], rfl, by simp⟩

private theorem recordCancelled_cancels (state : State) (occurrences : List Occurrence) :
    CancelsWithEnds state (State.recordCancelled state occurrences) := by
  refine ⟨occurrences.filter (·.begun), (occurrences.filter (·.begun)).map state.keyOf, ?_, ?_, by simp, ?_⟩
  · simp [State.recordCancelled]
  · simp [State.recordCancelled, List.map_map, Function.comp_def]
  · intro occurrence member
    simpa using (List.mem_filter.mp member).2

private theorem clearInside_cancels (state : State) (scope : ScopeOccurrenceId) (keep : List Nat) :
    CancelsWithEnds state (state.clearInside scope keep) := by
  obtain ⟨begun, keys, facts⟩ := recordCancelled_cancels state
    ((state.subtree scope).reverse.flatMap fun current =>
      state.occurrences.filter fun occurrence => occurrence.scope == current && !keep.contains occurrence.id)
  obtain ⟨cancelled, ended, length, flagged⟩ := facts
  exact ⟨begun, keys, by simpa [State.clearInside] using cancelled, by simpa [State.clearInside] using ended, length,
    flagged⟩

private theorem removeOccurrence_cancels (state : State) (id : Nat) :
    CancelsWithEnds state (state.removeOccurrence id) := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), CancelsWithEnds state current →
      CancelsWithEnds state (scopes.foldl (fun state scope => state.leaveScope scope.id) current) := by
    intro scopes
    induction scopes with
    | nil => intro current reached; exact reached
    | cons scope rest ih =>
      intro current reached
      refine ih _ (reached.trans ?_)
      obtain ⟨begun, keys, facts⟩ := clearInside_cancels current scope.id []
      obtain ⟨cancelled, ended, length, flagged⟩ := facts
      exact ⟨begun, keys, by simpa [State.leaveScope] using cancelled, by simpa [State.leaveScope] using ended, length,
        flagged⟩
  exact fold _ _ (.ofDraft rfl)

private theorem withdrawOccurrence_draft (state : State) (id : Nat) :
    (state.withdrawOccurrence id).draft = state.draft := by
  have fold : ∀ (scopes : List ScopeOccurrence) (current : State), current.draft = state.draft →
      (scopes.foldl (fun state scope => state.withdrawInside scope.id) current).draft = state.draft := by
    intro scopes
    induction scopes with
    | nil => intro current same; exact same
    | cons scope rest ih => intro current same; exact ih _ (by simpa [State.withdrawInside] using same)
  exact fold _ _ (by simp [State.closeOwnItems, State.disarm])

/-- Clearing a scope occurrence and cancelling an occurrence journal their cancelled facts with their end facts
(`CancelsWithEnds`): `State.Removal`'s one cancelled-fact writer pairs every cancelled fact with its end, so P3's notice
is given exactly when the end is journalled. -/
theorem removal_cancels_with_ends (state : State) :
    (∀ scope keep, CancelsWithEnds state (state.clearInside scope keep)) ∧
      ∀ id, CancelsWithEnds state (state.cancelOccurrence id) := by
  refine ⟨clearInside_cancels state, fun id => ?_⟩
  unfold State.cancelOccurrence
  split
  · exact .ofDraft rfl
  · rename_i occurrence _
    exact ((CancelsWithEnds.ofDraft (withdrawOccurrence_draft state id)).trans
      (removeOccurrence_cancels _ id)).trans (recordCancelled_cancels _ [occurrence])

end Kernel.Laws.State
