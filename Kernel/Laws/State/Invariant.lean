module

public import Kernel.State

/-! # Laws of the kernel state: the invariant

The invariant every reachable `State` keeps and the transitions it permits, stated over the state's fields alone and
independent of the operations that produce them: occurrence identity, ownership, the scope tree, the work a closure has
queued, and the removal a cancelled scope occurrence permits. Nothing executable imports this module; the proof wave
proves `Step` preserves `WellFormed` and that its cancellations are `ClearsInside` transitions
([kernel architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#lean-assurance-lane)).

Besides the state's fields a law names only `Token.busyScope`, a total projection of one work-stack entry whose result
the `State` contract documents, since matching `Token` is `Step`'s
([module table](../../../docs/kernel/ARCHITECTURE-SPEC.md#modules-and-build-shape)).

Besides the laws, it holds what follows from them over the fields alone: that a well-formed state's scope occurrences
form a tree (`Depth`), and the frames through which a change of the fields keeps `WellFormed`. Each law is followed by
its non-vacuity witness: a small state that satisfies it and, where the law could otherwise hold of everything, one that
violates it. Nothing here reads a `State` operation's body, so this module sees none; the lemmas about the operations,
and the witness that the sample instance is well-formed, which reads `State.root`'s value, are `Kernel.Laws.State`'s.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## The scope tree -/

/-- `Within s inner outer`: the scope occurrence `inner` is `outer` or lies below it by parent links of `s`. A
called instance's root counts as inside its caller, since removing the caller region removes the called subtree
([scopes, PC-SCOPE-06](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#pc-scope-06-exceptional-call-return-and-propagated-cancellation)). -/
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

/-- `Within` reads only the scope occurrences. -/
theorem Within.congr {s t : State} (scopes : t.scopes = s.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes ▸ member) link ih

/-! ## Identity -/

/-- Every identifier the state holds was issued before `nextIssue`, so the counter names only fresh identities: an
occurrence's identity is never reused ([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
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
reused one ([scopes, SRE-FRESH-01](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#concurrent-activations-and-re-entry)). -/
def StartedOnce (s : State) : Prop :=
  ((s.journal.flatMap (·.started) ++ s.draft.started).map (·.occurrence)).Nodup

/-- One activation counter per process instance, element and role (R8), each at least 1 once recorded. -/
structure ActivationsKeyed (s : State) : Prop where
  keys : (s.activations.map fun count => (count.processInstance, count.element, count.role)).Nodup
  positive : ∀ count ∈ s.activations, 0 < count.count

/-- An unbegun reservation keeps no start fact: a subscription's flow node runs only when its trigger arrives
([scopes, Event Sub-Processes](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#event-sub-processes)). -/
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
([data, scope data](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#scope-data),
[CIB-EXT-0020](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0020--nested-embedded-scope-locals-and-nearest-owner-writes)). -/
structure VariablesKeyed (s : State) : Prop where
  scopes : (s.variables.map (·.scope)).Nodup
  names : ∀ variables ∈ s.variables, (variables.entries.map (·.1)).Nodup

/-- A failure is recorded exactly when the instance failed. -/
def FailureRecorded (s : State) : Prop :=
  s.failure.isSome = true ↔ s.status = .failed

/-! ## Queued work and counters -/

/-- Every arming queued names an occurrence and a scope occurrence that were issued, so one that `Step.stale` lets run
finds them standing; every queued instance end records a failure exactly when it fails (`FailureRecorded`). The other
queued work checks what it names itself (`Step.requireScope`, `Step.gone`) or does nothing to what is gone. Queued work
naming a scope occurrence an interruption removed (`Kernel/Step/Stale.lean`) keeps this clause: what it names was
issued. -/
structure QueueSound (s : State) : Prop where
  arm : ∀ host element scope, Signal.arm host element scope ∈ s.signals → host < s.nextIssue ∧ scope.value < s.nextIssue
  armScope : ∀ scope, Signal.armScope scope ∈ s.signals → scope.value < s.nextIssue
  armGateway : ∀ occurrence gateway scope, Signal.armGateway occurrence gateway scope ∈ s.signals →
    occurrence < s.nextIssue ∧ scope.value < s.nextIssue
  ends : ∀ status failure, Signal.endInstance status failure ∈ s.signals → (failure.isSome = true ↔ status = .failed)

/-- Every start fact of the input in progress counts an activation its counter has issued, so a fresh activation never
repeats one (`StartedOnce`, R8). -/
def StartsCounted (s : State) : Prop :=
  ∀ fact ∈ s.journal.flatMap (·.started) ++ s.draft.started, ∃ count ∈ s.activations,
    count.processInstance = fact.occurrence.processInstanceId ∧ count.element = fact.occurrence.element ∧
    count.role = fact.occurrence.role ∧ fact.occurrence.activation ≤ count.count

/-- A scope occurrence an occurrence owns lies directly below the scope occurrence that occurrence runs in, as every
caller of `State.enterScope` enters it, so removing an occurrence with what it owns leaves the scope occurrence it ran
in standing. -/
def OwnedBelow (s : State) : Prop :=
  ∀ scope ∈ s.scopes, ∀ occurrence ∈ s.occurrences, scope.occurrence = some occurrence.id →
    scope.parent = some occurrence.scope

/-- The state invariants together: what holds of every committed state and between any two micro-steps of a closure. -/
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
  queue : QueueSound s
  counted : StartsCounted s
  ownedBelow : OwnedBelow s

/-! ## The scope tree of a well-formed state

`Rooted` and `Distinct` make the scope occurrences a tree: each has one record, so one parent, and a depth below
`State.root`, which grows by one from parent to child, so no parent chain returns to where it started. -/

/-- `Depth s scope n`: `scope` lies `n` parent links below `State.root`. -/
inductive Depth (s : State) : ScopeOccurrenceId → Nat → Prop where
  | root : Depth s State.root 0
  | child (child : ScopeOccurrence) (parent : ScopeOccurrenceId) (depth : Nat) :
      child ∈ s.scopes → child.parent = some parent → Depth s parent depth → Depth s child.id (depth + 1)

/-- A scope occurrence within `State.root` has a depth. -/
theorem Within.depth {s : State} {scope : ScopeOccurrenceId} (within : Within s scope State.root) : ∃ n, Depth s scope n := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => exact ⟨0, rooted ▸ .root⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨n, depth⟩ := ih rooted
    exact ⟨n + 1, .child child parent n member link depth⟩

/-- Members of a list whose images are distinct are equal when their images are. -/
theorem nodup_map_eq {α β : Type} {f : α → β} : ∀ {l : List α}, (l.map f).Nodup → ∀ {a b : α}, a ∈ l → b ∈ l →
    f a = f b → a = b
  | [], _, _, _, member, _, _ => by simp at member
  | x :: l, nodup, a, b, first, second, same => by
    simp only [List.map_cons, List.nodup_cons, List.mem_map, not_exists, not_and] at nodup
    obtain ⟨fresh, nodup⟩ := nodup
    rcases List.mem_cons.mp first with rfl | inFirst <;> rcases List.mem_cons.mp second with rfl | inSecond
    · rfl
    · exact absurd same.symm (fresh b inSecond)
    · exact absurd same (fresh a inFirst)
    · exact nodup_map_eq nodup inFirst inSecond same

/-- Two scope occurrences of a state whose identifiers are distinct and which share an identifier are one. -/
theorem scope_unique {s : State} (distinct : Distinct s) {first second : ScopeOccurrence} (one : first ∈ s.scopes)
    (two : second ∈ s.scopes) (same : first.id = second.id) : first = second :=
  nodup_map_eq distinct.scopes one two same

/-- A scope occurrence's depth is one more than its parent's. -/
theorem Depth.parent {s : State} (formed : WellFormed s) {child : ScopeOccurrence} {parent : ScopeOccurrenceId}
    {n : Nat} (member : child ∈ s.scopes) (link : child.parent = some parent) (depth : Depth s child.id n) :
    ∃ m, n = m + 1 ∧ Depth s parent m := by
  generalize named : child.id = id at depth
  cases depth with
  | root =>
    have := (formed.rooted.2.1 child member).mpr named
    simp [this] at link
  | child other parent' m inside link' depth' =>
    have same := scope_unique formed.distinct member inside named
    subst same
    rw [link] at link'
    cases link'
    exact ⟨m, rfl, depth'⟩

/-- Depths are unique. -/
theorem Depth.unique {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} {n m : Nat}
    (first : Depth s scope n) (second : Depth s scope m) : n = m := by
  induction first generalizing m with
  | root =>
    generalize named : State.root = id at second
    cases second with
    | root => rfl
    | child child _ _ member link _ =>
      have := (formed.rooted.2.1 child member).mpr named.symm
      simp [this] at link
  | child child parent n member link _ ih =>
    obtain ⟨k, rfl, depth⟩ := Depth.parent formed member link second
    rw [ih depth]

/-- A scope occurrence lies no higher than one it is within, and strictly lower when it is another. -/
theorem Within.deeper {s : State} (formed : WellFormed s) {inner outer : ScopeOccurrenceId} (within : Within s inner outer)
    {n m : Nat} (innerDepth : Depth s inner n) (outerDepth : Depth s outer m) : m ≤ n ∧ (inner ≠ outer → m < n) := by
  induction within generalizing n with
  | refl => exact ⟨Nat.le_of_eq (Depth.unique formed outerDepth innerDepth), fun distinct => absurd rfl distinct⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨k, rfl, depth⟩ := Depth.parent formed member link innerDepth
    have := (ih depth outerDepth).1
    exact ⟨by omega, fun _ => by omega⟩

/-- No scope occurrence's parent lies within it. -/
theorem parent_not_within {s : State} (formed : WellFormed s) {child : ScopeOccurrence} {parent : ScopeOccurrenceId}
    (member : child ∈ s.scopes) (link : child.parent = some parent) : ¬ Within s parent child.id := fun within => by
  obtain ⟨n, depth⟩ := (formed.rooted.2.2 child member).depth
  obtain ⟨m, rfl, parentDepth⟩ := Depth.parent formed member link depth
  have := (within.deeper formed parentDepth depth).1
  omega

/-- What a scope occurrence with a depth lies within has a depth. -/
theorem Within.depthUp {s : State} (formed : WellFormed s) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) {n : Nat} (depth : Depth s inner n) : ∃ m, Depth s outer m := by
  induction within generalizing n with
  | refl => exact ⟨n, depth⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨k, _, parentDepth⟩ := Depth.parent formed member link depth
    exact ih parentDepth

/-- Two scope occurrences within each other are one. -/
theorem Within.antisymm {s : State} (formed : WellFormed s) {first second : ScopeOccurrenceId}
    (present : first ∈ scopeIds s) (down : Within s first second) (up : Within s second first) : first = second := by
  obtain ⟨entry, member, same⟩ := List.mem_map.mp present
  obtain ⟨n, firstDepth⟩ := (same ▸ formed.rooted.2.2 entry member).depth
  obtain ⟨m, secondDepth⟩ := down.depthUp formed firstDepth
  by_cases same : first = second
  · exact same
  · have := (down.deeper formed firstDepth secondDepth).2 same
    have := (up.deeper formed secondDepth firstDepth).1
    omega

/-! ## Frames

What `WellFormed` keeps through a change of the fields it reads, stated over the fields alone: the phases of `Step` that
only drop or reorder entries (`Narrows`), a change of status and failure, and the clearing of a scope occurrence
(`Cleared`), which `Kernel.Laws.State` shows `State.clearInside` makes. -/

/-- The start facts of the input in progress, which `StartedOnce`, `ReservationsUnstarted` and `StartsCounted` read. -/
def starts (s : State) : List StartedFact := s.journal.flatMap (·.started) ++ s.draft.started

/-- `after` holds what `before` holds, with no more open items, tokens, queued signals or start facts of the input in
progress, and no new identifier: the phases that only drop or reorder entries. -/
structure Narrows (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  variables : after.variables = before.variables
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  status : after.status = before.status
  failure : after.failure = before.failure
  openItems : after.openItems.Sublist before.openItems
  tokens : ∀ token ∈ after.tokens, token ∈ before.tokens
  signals : ∀ signal ∈ after.signals, signal ∈ before.signals
  starts : ∀ fact ∈ starts after, fact ∈ starts before

/-- A state that narrows a well-formed one is well-formed when it starts no occurrence key twice. -/
theorem WellFormed.narrow {before after : State} (formed : WellFormed before) (narrows : Narrows before after)
    (once : StartedOnce after) : WellFormed after where
  issued := ⟨by simpa [narrows.occurrences, narrows.nextIssue] using formed.issued.occurrences,
    fun item member => narrows.nextIssue ▸ formed.issued.items item (narrows.openItems.subset member),
    by simpa [narrows.scopes, narrows.nextIssue] using formed.issued.scopes⟩
  distinct := ⟨by simpa [occurrenceIds, narrows.occurrences] using formed.distinct.occurrences,
    formed.distinct.items.sublist (narrows.openItems.map _), by simpa [scopeIds, narrows.scopes] using formed.distinct.scopes⟩
  startedOnce := once
  activations := ⟨by simpa [narrows.activations] using formed.activations.keys,
    by simpa [narrows.activations] using formed.activations.positive⟩
  reservations occurrence member unbegun fact started :=
    formed.reservations occurrence (narrows.occurrences ▸ member) unbegun fact (narrows.starts fact started)
  owned := {
    occurrenceScopes := by simpa [scopeIds, narrows.occurrences, narrows.scopes] using formed.owned.occurrenceScopes
    itemScopes := fun item member => by
      simpa [scopeIds, narrows.scopes] using formed.owned.itemScopes item (narrows.openItems.subset member)
    itemOccurrences := fun item member => by
      simpa [narrows.occurrences] using formed.owned.itemOccurrences item (narrows.openItems.subset member)
    attachments := fun item member => by
      simpa [occurrenceIds, narrows.occurrences] using formed.owned.attachments item (narrows.openItems.subset member)
    scopeOwners := by simpa [occurrenceIds, narrows.scopes, narrows.occurrences] using formed.owned.scopeOwners
    variableScopes := by simpa [scopeIds, narrows.variables, narrows.scopes] using formed.owned.variableScopes
    tokenScopes := fun token member => by
      simpa [scopeIds, narrows.scopes] using formed.owned.tokenScopes token (narrows.tokens token member) }
  rooted := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, narrows.scopes] using present, by simpa [narrows.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr narrows.scopes (reach scope (narrows.scopes ▸ member))
  variables := ⟨by simpa [narrows.variables] using formed.variables.scopes,
    by simpa [narrows.variables] using formed.variables.names⟩
  failure := by simpa [FailureRecorded, narrows.failure, narrows.status] using formed.failure
  queue := {
    arm := fun host element scope queued => narrows.nextIssue ▸ formed.queue.arm host element scope (narrows.signals _ queued)
    armScope := fun scope queued => narrows.nextIssue ▸ formed.queue.armScope scope (narrows.signals _ queued)
    armGateway := fun occurrence gateway scope queued =>
      narrows.nextIssue ▸ formed.queue.armGateway occurrence gateway scope (narrows.signals _ queued)
    ends := fun status failure queued => formed.queue.ends status failure (narrows.signals _ queued) }
  counted fact started := by simpa [narrows.activations] using formed.counted fact (narrows.starts fact started)
  ownedBelow := by simpa [OwnedBelow, narrows.scopes, narrows.occurrences] using formed.ownedBelow

/-- Start facts that are a permutation of a well-formed state's, with nothing else but the journal and the draft
changed, keep it well-formed. -/
theorem WellFormed.permuted {before after : State} (formed : WellFormed before) (narrows : Narrows before after)
    (perm : (starts after).Perm (starts before)) : WellFormed after :=
  formed.narrow narrows ((perm.map _).nodup_iff.mpr formed.startedOnce)

/-- A well-formed state with its status and failure changed together stays well-formed. -/
theorem WellFormed.withStatus {s : State} (formed : WellFormed s) {status : InstanceStatus}
    {failure : Option InstanceFailure} (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed { s with status, failure } where
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1,
    fun scope member => Within.congr (s := s) (t := { s with status, failure }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := recorded
  queue := ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩
  counted := formed.counted
  ownedBelow := formed.ownedBelow

/-- What `State.clearInside before scope keep` leaves of `before`, read through the scope tree: the scope occurrences
and variable sets not strictly within `scope`, the occurrences, open items and tokens not within it but those of the
kept occurrences, and everything else as it was but the draft's end and cancelled facts. P3's cancellation lane and the
phases that clear (`Step.endInstance`, `State.leaveScope`) build on it. -/
structure Cleared (before after : State) (scope : ScopeOccurrenceId) (keep : List Nat) : Prop where
  scopes : ∀ entry, entry ∈ after.scopes ↔ entry ∈ before.scopes ∧ ¬ StrictlyWithin before entry.id scope
  occurrences : ∀ occurrence, occurrence ∈ after.occurrences ↔
    occurrence ∈ before.occurrences ∧ (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep)
  openItems : ∀ item, item ∈ after.openItems ↔
    item ∈ before.openItems ∧ (¬ Within before item.scope scope ∨ item.occurrence ∈ keep)
  tokens : ∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧ ¬ Within before token.busyScope scope
  variables : ∀ variables, variables ∈ after.variables ↔
    variables ∈ before.variables ∧ ¬ StrictlyWithin before variables.scope scope
  scopesSublist : after.scopes.Sublist before.scopes
  occurrencesSublist : after.occurrences.Sublist before.occurrences
  openItemsSublist : after.openItems.Sublist before.openItems
  variablesSublist : after.variables.Sublist before.variables
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  signals : after.signals = before.signals
  status : after.status = before.status
  failure : after.failure = before.failure
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started

/-- A scope occurrence that lies within `State.root` and not strictly within a cleared `scope` still does after the
clearing: nothing on its way up lies strictly within `scope`, or it would itself. -/
private theorem Cleared.reaches {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat}
    (formed : WellFormed before) (cleared : Cleared before after scope keep) {x : ScopeOccurrenceId}
    (within : Within before x State.root) : ¬ StrictlyWithin before x scope → Within after x State.root := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => intro _; subst rooted; exact .refl _
  | parent child parent _ member link _ ih =>
    intro outside
    refine .parent child parent _ ((cleared.scopes child).mpr ⟨member, outside⟩) link (ih rooted fun ⟨inside, other⟩ => ?_)
    have childInside : Within before child.id scope := .parent child parent scope member link inside
    have same : child.id = scope := Classical.byContradiction fun distinct => outside ⟨childInside, distinct⟩
    exact parent_not_within formed member link (same ▸ inside)

/-- A cleared well-formed state is well-formed when every occurrence the clearing keeps lies in no scope occurrence
strictly within the cleared one, and every open item the clearing leaves hangs on an occurrence it leaves. -/
theorem Cleared.wellFormed {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat} (formed : WellFormed before)
    (cleared : Cleared before after scope keep) (present : scope ∈ scopeIds before)
    (kept : ∀ occurrence ∈ before.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin before occurrence.scope scope)
    (attached : ∀ item ∈ before.openItems, (¬ Within before item.scope scope ∨ item.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ before.occurrences, occurrence.id = host →
        ¬ Within before occurrence.scope scope ∨ host ∈ keep) :
    WellFormed after := by
  have sameStarts : starts after = starts before := by simp [starts, cleared.journal, cleared.started]
  -- A scope occurrence of `before` that is no strict descendant of `scope` stands after the clearing.
  have stays : ∀ id, id ∈ scopeIds before → ¬ StrictlyWithin before id scope → id ∈ scopeIds after := fun id member outside => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨inside, named ▸ outside⟩, named⟩
  have notStrict : ∀ id, ¬ Within before id scope → ¬ StrictlyWithin before id scope := fun _ outside strict =>
    outside strict.1
  -- An occurrence of `before` that the clearing leaves lies in a scope occurrence that stands.
  have occurrenceStays : ∀ occurrence ∈ before.occurrences, (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep) →
      occurrence.scope ∈ scopeIds after := fun occurrence member left => by
    refine stays _ (formed.owned.occurrenceScopes occurrence member) ?_
    rcases left with outside | keeps
    · exact notStrict _ outside
    · exact kept occurrence member keeps
  constructor
  · exact ⟨fun occurrence member => cleared.nextIssue ▸ formed.issued.occurrences occurrence
        (cleared.occurrencesSublist.subset member),
      fun item member => cleared.nextIssue ▸ formed.issued.items item (cleared.openItemsSublist.subset member),
      fun entry member => cleared.nextIssue ▸ formed.issued.scopes entry (cleared.scopesSublist.subset member)⟩
  · exact ⟨formed.distinct.occurrences.sublist (cleared.occurrencesSublist.map _),
      formed.distinct.items.sublist (cleared.openItemsSublist.map _),
      formed.distinct.scopes.sublist (cleared.scopesSublist.map _)⟩
  · have once := formed.startedOnce
    unfold StartedOnce at once ⊢
    rw [show after.journal.flatMap (·.started) ++ after.draft.started = starts after from rfl, sameStarts]
    exact once
  · exact ⟨cleared.activations ▸ formed.activations.keys, cleared.activations ▸ formed.activations.positive⟩
  · intro occurrence member unbegun fact started
    exact formed.reservations occurrence (cleared.occurrencesSublist.subset member) unbegun fact
      (show fact ∈ starts before from sameStarts ▸ started)
  · constructor
    · intro occurrence member
      obtain ⟨old, left⟩ := (cleared.occurrences occurrence).mp member
      exact occurrenceStays occurrence old left
    · intro item member
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, _, placed⟩ := facts
      rw [← placed]
      refine occurrenceStays occurrence inside ?_
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, element, placed⟩ := facts
      refine ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named, element, placed⟩
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member host link
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp (formed.owned.attachments item old host link)
      exact List.mem_map.mpr ⟨occurrence, (cleared.occurrences occurrence).mpr
        ⟨inside, named ▸ attached item old left host link occurrence inside named⟩, named⟩
    · intro entry member owner owned
      obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
      obtain ⟨occurrence, inside, named⟩ := List.mem_map.mp (formed.owned.scopeOwners entry old owner owned)
      refine List.mem_map.mpr ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named⟩
      by_cases keeps : occurrence.id ∈ keep
      · exact .inr keeps
      · refine .inl fun within => ?_
        have link := formed.ownedBelow entry old occurrence inside (named ▸ owned)
        have entryInside : Within before entry.id scope := .parent entry occurrence.scope scope old link within
        have same : entry.id = scope := Classical.byContradiction fun distinct => outside ⟨entryInside, distinct⟩
        exact parent_not_within formed old link (same ▸ within)
    · intro variables member
      obtain ⟨old, outside⟩ := (cleared.variables variables).mp member
      exact stays _ (formed.owned.variableScopes variables old) outside
    · intro token member
      obtain ⟨old, outside⟩ := (cleared.tokens token).mp member
      exact stays _ (formed.owned.tokenScopes token old) (notStrict _ outside)
  · obtain ⟨rootPresent, parentless, reach⟩ := formed.rooted
    obtain ⟨scopeEntry, scopeInside, scopeNamed⟩ := List.mem_map.mp present
    refine ⟨stays _ rootPresent fun ⟨inside, distinct⟩ => distinct (Within.antisymm formed rootPresent inside
      (scopeNamed ▸ reach scopeEntry scopeInside)), fun entry member => parentless entry
      (cleared.scopesSublist.subset member), fun entry member => ?_⟩
    obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
    exact cleared.reaches formed (reach entry old) outside
  · exact ⟨formed.variables.scopes.sublist (cleared.variablesSublist.map _),
      fun variables member => formed.variables.names variables (cleared.variablesSublist.subset member)⟩
  · simpa [FailureRecorded, cleared.status, cleared.failure] using formed.failure
  · obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    exact ⟨by simpa [cleared.signals, cleared.nextIssue] using arm, by simpa [cleared.signals, cleared.nextIssue] using armScope,
      by simpa [cleared.signals, cleared.nextIssue] using armGateway, by simpa [cleared.signals] using ends⟩
  · intro fact started
    simpa [cleared.activations] using formed.counted fact (show fact ∈ starts before from sameStarts ▸ started)
  · intro entry member occurrence inside owned
    exact formed.ownedBelow entry (cleared.scopesSublist.subset member) occurrence
      (cleared.occurrencesSublist.subset inside) owned

/-! ## Permitted transitions -/

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

/-- An identifier at or above the counter violates `IssuedBelow`, so the law excludes states. -/
theorem stale_counter_rejected (kind : OpenKind) : ¬ IssuedBelow { sample kind with nextIssue := 5 } := fun issued => by
  have := issued.occurrences outerTask (by simp [sample])
  simp [outerTask] at this

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

/-- A start fact pending without its counter breaks `StartsCounted`. -/
theorem uncounted_start_rejected (kind : OpenKind) :
    ¬ StartsCounted { sample kind with draft := { started := [startFact innerTask] }, activations := [] } :=
  fun counted => by
    obtain ⟨_, member, _⟩ := counted (startFact innerTask) (by simp)
    simp at member

/-- A Sub-Process scope owned by an occurrence of another scope occurrence breaks `OwnedBelow`. -/
theorem misplaced_owner_rejected (kind : OpenKind) :
    ¬ OwnedBelow { sample kind with occurrences := [{ subProcess with scope := subScope }, innerTask, outerTask] } :=
  fun owned => by
    have := owned childScope (by simp [sample]) { subProcess with scope := subScope } (by simp) (by simp [childScope, subProcess])
    simp [childScope, subScope, processRoot] at this

/-- An arming of a scope occurrence never issued breaks `QueueSound`, and so `WellFormed`: queued work may name a scope
occurrence that is gone, never one that was never issued. -/
theorem unissued_arming (kind : OpenKind) : ¬ WellFormed { sample kind with signals := [.armScope ⟨9⟩] } := fun formed => by
  have := formed.queue.armScope ⟨9⟩ (by simp)
  simp [sample] at this

end Kernel.Laws.State
