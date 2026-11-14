module

public import Kernel.Laws.Step
public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.Step.Ends
public import Kernel.Laws.Scopes

/-! # Proofs: cancellation (P3)

The statements of the proof wave's cancellation lane ([PLAN, P3](../../docs/PLAN.md#proof-wave)), from a
`Laws.State.WellFormed` before-state: subtree removal leaves no token, open item, occurrence or variable of the removed
subtree; an input addressed to a removed occurrence is rejected without effect; queued work naming a removed scope
occurrence has no effect; every owning feature is notified once. Each is stated over a hooks parameter and closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`. No model premise is needed: removal is generic (`State.clearInside`,
`State.cancelOccurrence`) and reads no IL.

A proof here composes `Laws.Step`'s, `Laws.Hooks`' and `Laws.State`'s lemmas and opens no body. A `Step` fact it needs
that no `Laws` module states yet is an explicit premise named as a pending lemma request, never a model or state premise
of the lane statement; the root replaces it with the lemma once that lands. Subtree removal rests on the
state-invariant lane's preservation of `WellFormed` and on the step keeping its before-state's scope occurrences
(`StepKeepsScopes`), an invariant of the closure relative to the before-state, which the state operations keep
(`Alongside`) and `Kernel.Proofs.Cancellation.Registered` carries through the registered hooks. A removed occurrence's
single end fact rests on each micro-step keeping the input's end facts from its start (`MicroStepsKeepEnds`,
`Laws.Step.EndsKept`), which the completion pipeline keeps only as a unit (`Laws.Step.complete_ends`). Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Cancellation

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds)

/-- After a committed input, nothing lies in the subtree, in the before-state, of a scope occurrence the input
removed: no token, open item, occurrence or variable set (BPMN 2.0.2 §13.5.3, §10.5.6; `Laws.State.ClearsInside`). -/
def SubtreeRemoved (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (removed : ScopeOccurrenceId),
    WellFormed program before → Step.step hooks program (some before) input = .ok after →
    removed ∈ scopeIds before → removed ∉ scopeIds after →
    (∀ token ∈ after.tokens, ¬ Within before token.busyScope removed) ∧
    (∀ item ∈ after.openItems, ¬ Within before item.scope removed) ∧
    (∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope removed) ∧
    (∀ variables ∈ after.variables, ¬ Within before variables.scope removed)

/-- The occurrence `occurrence` of `state` has the public identity `ref`. -/
def Designates (program : Program) (state : State) (ref : OccurrenceRef) (occurrence : Occurrence) : Prop :=
  program.publicId occurrence.element = ref.element ∧ occurrence.activation = ref.activation ∧
    state.instanceOf occurrence.scope = ref.processInstanceId

/-- The input addresses the occurrence with public identity `ref`: a command, a timer firing or an effect result. -/
def AddressedTo (input : Input) (ref : OccurrenceRef) : Prop :=
  (∃ payload : CommandInput, input = .command payload ∧ payload.occurrence = ref) ∨
    (∃ payload : TimerInput, input = .timerFire payload ∧ payload.occurrence = ref) ∨
    ∃ payload : EffectInput, input = .effectResult payload ∧ payload.occurrence = ref

/-- An input addressed to an occurrence the before-state no longer holds is rejected, so it commits nothing
(`unknown-user-task`, `unknown-incident`, `unknown-occurrence`, `unknown-timer`, `unknown-effect`). -/
def LateInputRejected (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before : State) (ref : OccurrenceRef),
    WellFormed program before → AddressedTo input ref → (∀ occurrence ∈ before.occurrences, ¬ Designates program before ref occurrence) →
    ∃ code, Step.step hooks program (some before) input = .error (.rejected code)

/-- The queued signal acts in the scope occurrence `scope`: it arms, begins, writes, removes, occurs or compensates
there, or its handler context is `scope`. Read by equality on the constructors that carry a scope occurrence, never
by a match, which only `Kernel.Step` and its `Laws` and `Proofs` modules make. -/
def ActsIn (signal : Signal) (scope : ScopeOccurrenceId) : Prop :=
  (∃ host element, signal = .arm host element scope) ∨ signal = .armScope scope ∨
    (∃ occurrence gateway, signal = .armGateway occurrence gateway scope) ∨
    (∃ request : BeginRequest, signal = .begin request ∧ request.scope = scope) ∨
    (∃ writes rule, signal = .write scope writes rule) ∨ (∃ names, signal = .remove scope names) ∨
    (∃ element leave writes rule, signal = .occur element scope leave writes rule) ∨
    (∃ activity trigger leave resume, signal = .compensate scope activity trigger leave resume) ∨
    ∃ code message origin, signal = .compensationFailed scope code message origin

/-- Nothing a later micro-step or the observation boundary reads changed but the journal: the scope tree, occurrences,
open items, tokens, variables, queued signals, feature slots, issue counter, activation counters, status, failure and
outbox are as they were. -/
structure Inert (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  variables : after.variables = before.variables
  signals : after.signals = before.signals
  slots : after.slots = before.slots
  nextIssue : after.nextIssue = before.nextIssue
  activations : after.activations = before.activations
  status : after.status = before.status
  failure : after.failure = before.failure
  outbox : after.outbox = before.outbox

/-- Queued work naming a scope occurrence that was issued and has since been removed has no effect: the closure
micro-step that runs it either fails the input or changes nothing but the journal (`Kernel/Step/Stale.lean`). It is
stated of any closure state: such work keeps `WellFormed`, which asks only that what queued work names was issued
(`Laws.State.QueueSound`). -/
def QueuedWorkInert (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (next : Signal) (rest : List Signal) (scope : ScopeOccurrenceId),
    state.signals = next :: rest → ActsIn next scope → scope.value < state.nextIssue → scope ∉ scopeIds state →
    Step.microStep hooks ctx (.signal (Step.signalName next)) none State.root (Step.dispatchSignal hooks ctx next)
      { state with signals := rest } = .ok after →
    Inert { state with signals := rest } after

/-- Every begun occurrence a committed input removes ends exactly once in the input's journal, which is when `Step`
hands a cancelled one to `Hooks.cancelled`, the owning features' notice: the journal's cancelled facts and their end
facts are made together (`Laws.State.removal_cancels_with_ends` of `State.clearInside` and `State.cancelOccurrence`);
the input's other end facts come from `State.recordEnd`. -/
def RemovedEndOnce (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (occurrence : Occurrence),
    WellFormed program before → Step.step hooks program (some before) input = .ok after →
    occurrence ∈ before.occurrences → occurrence.begun = true → occurrence.id ∉ occurrenceIds after →
    ∃ earlier terminal later, after.journal.flatMap (·.ended) = earlier ++ (before.keyOf occurrence, terminal) :: later ∧
      ∀ fact ∈ earlier ++ later, fact.1 ≠ before.keyOf occurrence

/-! ## Queued work naming a removed scope occurrence -/

/-- `QueuedWorkInert` holds vacuously: the micro-step never commits. Work that does something in a removed scope
occurrence (an arming, a begin, an `occur`) is stale (`Laws.Step.scope_stale`), and work that acts from one (a write, a
removal, a compensation, a compensation's failure) is gone (`Laws.Step.write_scope_gone` and its siblings, #121); either
fails the micro-step's body, which a committed micro-step ran (`Laws.Step.microStep_ok`). -/
theorem queuedWorkInert {hooks : Hooks} : QueuedWorkInert hooks := by
  intro ctx state after next rest scope _ acts issued removed ran
  obtain ⟨_, _, body, _⟩ := Laws.Step.microStep_ok ran
  rw [Laws.Step.dispatchSignal_eq] at body
  generalize popped : ({ state with signals := rest } : State) = queue at body
  have absent : ∀ entry ∈ queue.scopes, entry.id ≠ scope := by
    subst popped
    exact fun entry member same => removed (List.mem_map.mpr ⟨entry, member, same⟩)
  replace issued : scope.value < queue.nextIssue := by subst popped; exact issued
  have stale := fun names => Laws.Step.scope_stale (hooks := hooks) (ctx := ctx) (signal := next) names issued absent
  rcases acts with ⟨host, element, rfl⟩ | rfl | ⟨occurrence, gateway, rfl⟩ | ⟨request, rfl, rfl⟩ |
      ⟨writes, rule, rfl⟩ | ⟨names, rfl⟩ | ⟨element, leave, ⟨writes, rule, rfl⟩⟩ |
      ⟨activity, trigger, ⟨leave, resume, rfl⟩⟩ | ⟨code, message, origin, rfl⟩
  · rw [stale (.inl ⟨host, element, rfl⟩)] at body; cases body
  · rw [stale (.inr (.inl rfl))] at body; cases body
  · rw [stale (.inr (.inr (.inl ⟨occurrence, gateway, rfl⟩)))] at body; cases body
  · rw [stale (.inr (.inr (.inr (.inl ⟨request, rfl, rfl⟩))))] at body; cases body
  · rw [Laws.Step.write_scope_gone absent] at body; cases body
  · rw [Laws.Step.remove_scope_gone absent] at body; cases body
  · rw [stale (.inr (.inr (.inr (.inr ⟨element, leave, writes, rule, rfl⟩))))] at body; cases body
  · rw [Laws.Step.compensate_scope_gone absent] at body; cases body
  · rw [Laws.Step.compensationFailed_scope_gone absent] at body; cases body

/-! ## Inputs addressed to a removed occurrence -/

/-- An item an addressed lookup finds in a state with the before-state's occurrences, items, scope tree and instance
identity waits for an occurrence of the before-state that the lookup's reference designates: `WellFormed` gives every
open item an occurrence of its own element in its own scope occurrence (`Laws.State.Owned.itemOccurrences`), and the
distinct identifiers make it the one the item's activation was read from. -/
theorem item_designates {program : Program} {before s : State} {ref : OccurrenceRef} {item : OpenItem}
    (formed : WellFormed program before) (occurrences : s.occurrences = before.occurrences)
    (items : s.openItems = before.openItems) (sameInstance : s.instanceOf = before.instanceOf)
    (member : item ∈ s.openItems) (named : program.publicId item.element = ref.element)
    (activation : (s.occurrence? item.occurrence).map (·.activation) = some ref.activation)
    (instance_ : s.instanceOf item.scope = ref.processInstanceId) :
    ∃ occurrence ∈ before.occurrences, Designates program before ref occurrence := by
  obtain ⟨owner, owned, ownerId, ownerFacts⟩ := formed.owned.itemOccurrences item (items ▸ member)
  obtain ⟨ownerElement, ownerScope⟩ := ownerFacts
  obtain ⟨found, lookup, foundActivation⟩ := Option.map_eq_some_iff.mp activation
  obtain ⟨foundMember, foundId⟩ := Laws.State.occurrence?_some lookup
  have same : found = owner :=
    Laws.State.nodup_map_eq formed.distinct.occurrences (occurrences ▸ foundMember) owned (foundId.trans ownerId.symm)
  subst same
  exact ⟨found, owned, ownerElement ▸ named, foundActivation, ownerScope ▸ sameInstance ▸ instance_⟩

/-- `LateInputRejected`: an input addressed to an occurrence the before-state does not hold finds nothing to act on,
neither the occurrence nor an open item of it, so `Step` rejects it before its transition commits anything
(`Laws.Step.step_unknown`). -/
theorem lateInputRejected {hooks : Hooks} : LateInputRejected hooks := by
  intro program input before ref formed addressed undesignated
  refine Laws.Step.step_unknown addressed fun ctx s program_ occurrences items scopes named => ?_
  have sameInstance : s.instanceOf = before.instanceOf := funext (Laws.State.instanceOf_congr scopes named)
  subst program_
  refine ⟨?_, fun detail => ?_⟩
  · refine Option.eq_none_iff_forall_ne_some.mpr fun occurrence found => ?_
    obtain ⟨member, publicId, activation, instance_⟩ := Laws.Step.occurrenceOf?_some found
    exact undesignated occurrence (occurrences ▸ member) ⟨publicId, activation, sameInstance ▸ instance_⟩
  · refine Option.eq_none_iff_forall_ne_some.mpr fun pair found => ?_
    obtain ⟨member, publicId, activation, instance_⟩ := Laws.Hooks.itemDetail?_some (item := pair.1) (value := pair.2) found
    obtain ⟨occurrence, owned, designated⟩ :=
      item_designates formed occurrences items sameInstance member publicId activation instance_
    exact undesignated occurrence owned designated

/-! ## Subtree removal

A committed input leaves nothing in the subtree of a scope occurrence it removed because two facts of the after-state
meet: it is well-formed, so everything it holds lies in a scope occurrence it holds whose parent it holds
(`Laws.State.Owned`, `Laws.State.Rooted`), and every scope occurrence it holds that the before-state held is the
before-state's record (`ScopesKept`), so its parent link is unchanged. Climbing the before-state's links from anything
inside the removed subtree would then reach the removed scope occurrence inside the after-state. -/

/-- The scope occurrences of `before` survive into `s` unchanged, if at all, and `s` issues above them, so a scope
occurrence `s` enters is none of them: what a committed input keeps of its before-state's scope tree (a scope
occurrence is entered once with its parent, `State.enterScope`, and removed whole, `State.clearInside`,
`State.leaveScope`). -/
def ScopesKept (before s : State) : Prop :=
  (∀ old ∈ before.scopes, old.id.value < s.nextIssue) ∧ ∀ entry ∈ s.scopes, entry.id ∈ scopeIds before → entry ∈ before.scopes

/-- A committed input keeps its well-formed before-state's scope occurrences (`ScopesKept`). -/
def StepKeepsScopes (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed program before → Step.step hooks program (some before) input = .ok after → ScopesKept before after

/-- One link up: `inner` is `outer`, or a scope occurrence of `s` whose parent lies within `outer`. -/
theorem Within.up {s : State} {inner outer : ScopeOccurrenceId} (within : Within s inner outer) :
    inner = outer ∨ ∃ child ∈ s.scopes, child.id = inner ∧ ∃ parent, child.parent = some parent ∧ Within s parent outer := by
  cases within with
  | refl => exact .inl rfl
  | parent child parent _ member link above => exact .inr ⟨child, member, rfl, parent, link, above⟩

/-- In a well-formed state the parent of a scope occurrence is one of its scope occurrences. -/
theorem parent_stands {s : State} (formed : WellFormed program s) {entry : ScopeOccurrence} (member : entry ∈ s.scopes)
    {parent : ScopeOccurrenceId} (link : entry.parent = some parent) : parent ∈ scopeIds s := by
  rcases Within.up (formed.rooted.2.2 entry member) with isRoot | ⟨child, inside, same, above⟩
  · simp [(formed.rooted.2.1 entry member).mpr isRoot] at link
  · obtain ⟨above, childLink, reaches⟩ := above
    obtain rfl := Laws.State.scope_unique formed.distinct inside member same
    obtain rfl := Option.some.inj (childLink.symm.trans link)
    rcases Within.up reaches with isRoot | ⟨top, topInside, topSame, _⟩
    · exact isRoot ▸ formed.rooted.1
    · exact List.mem_map.mpr ⟨top, topInside, topSame⟩

/-- No scope occurrence of a well-formed after-state that keeps its well-formed before-state's scope occurrences lies,
in the before-state, within one the after-state no longer holds. -/
theorem outside_removed {before after : State} (formedBefore : WellFormed program before) (formedAfter : WellFormed program after)
    (kept : ScopesKept before after) {removed : ScopeOccurrenceId} (gone : removed ∉ scopeIds after)
    {scope : ScopeOccurrenceId} (member : scope ∈ scopeIds after) : ¬ Within before scope removed := by
  intro within
  refine gone ?_
  clear gone
  induction within with
  | refl => exact member
  | parent child parent _ inside link _ climb =>
    obtain ⟨entry, kept_, same⟩ := List.mem_map.mp member
    have old := kept.2 entry kept_ (same ▸ List.mem_map.mpr ⟨child, inside, rfl⟩)
    obtain rfl := Laws.State.scope_unique formedBefore.distinct old inside same
    exact climb (parent_stands formedAfter kept_ link)

/-- `SubtreeRemoved`, from the state-invariant lane's `Proofs.State.StepKeepsWellFormed` (`wellFormed`, stated here
as its unfolding so that this module does not import `Proofs.State`'s feature laws) and `StepKeepsScopes`: the
after-state's tokens, open items, occurrences and variable sets lie in its scope occurrences (`Laws.State.Owned`), none
of which lies within a removed one (`outside_removed`). -/
theorem subtreeRemoved {hooks : Hooks}
    (wellFormed : ∀ (program : Program) (input : Input) (before after : State),
      WellFormed program before → Step.step hooks program (some before) input = .ok after → WellFormed program after)
    (scopes : StepKeepsScopes hooks) : SubtreeRemoved hooks := by
  intro program input before after removed formed ran _ gone
  have formedAfter := wellFormed program input before after formed ran
  have outside := fun {scope} => outside_removed formed formedAfter (scopes program input before after formed ran) gone
    (scope := scope)
  exact ⟨fun token member => outside (formedAfter.owned.tokenScopes token member),
    fun item member => outside (formedAfter.owned.itemScopes item member),
    fun occurrence member => outside (formedAfter.owned.occurrenceScopes occurrence member),
    fun variables member => outside (formedAfter.owned.variableScopes variables member)⟩

/-- Well-formed, with the scope occurrences of `before` kept: the invariant a committed input carries from its
before-state through every hook and phase. -/
def KeepsScopes (before : State) (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ ScopesKept before s

/-- A well-formed state keeps its own scope occurrences, issued below its counter. -/
theorem KeepsScopes.self {program : Program} {before : State} (formed : WellFormed program before) :
    KeepsScopes before program before :=
  ⟨formed, fun old member => formed.issued.scopes old member, fun _ member _ => member⟩

/-- `StepKeepsScopes` from the hooks' contract and `Step`'s phases of `KeepsScopes` of every before-state, through
`Laws.Step.running_keeps` from `KeepsScopes.self`. A fresh instance need not keep `KeepsScopes`, since a running input
never starts one. -/
theorem stepKeepsScopes {hooks : Hooks} (contract : ∀ before, Laws.Step.HookContract hooks (KeepsScopes before))
    (phases : ∀ before, Laws.Step.Phases (KeepsScopes before)) (facts : Laws.Step.StateFacts) :
    StepKeepsScopes hooks := fun _ _ before _ formed ran =>
  (Laws.Step.running_keeps (contract before) (phases before) facts (KeepsScopes.self formed) ran).2

/-- `SubtreeRemoved` from the hooks' contract and `Step`'s phases of `KeepsScopes` of every before-state alone: its
`WellFormed` half is the state-invariant lane's preservation, and its scope half `StepKeepsScopes`. -/
theorem subtreeRemoved_of_keeps {hooks : Hooks} (contract : ∀ before, Laws.Step.HookContract hooks (KeepsScopes before))
    (phases : ∀ before, Laws.Step.Phases (KeepsScopes before)) (facts : Laws.Step.StateFacts) :
    SubtreeRemoved hooks :=
  subtreeRemoved (fun _ _ before _ formed ran =>
    (Laws.Step.running_keeps (contract before) (phases before) facts (KeepsScopes.self formed) ran).1)
    (stepKeepsScopes contract phases facts)

/-! ### What the state operations keep of the before-state's scope occurrences

A hook or phase keeps `KeepsScopes before` when it keeps `WellFormed` (the state-invariant lane's records) and each
state operation it applies keeps `ScopesKept before`: it adds only a scope occurrence issued at the counter, drops
some, or leaves them, and never lowers the counter. The hooks' operations are gathered in `Alongside`, which any
property carried beside `WellFormed` fills; `Kernel.Proofs.Cancellation.Registered` turns it into each feature's
operations record and the registered hooks' contract. -/

/-- `t` keeps the scope occurrences `before` held at `s`: those of `s` or ones issued at or above `s`'s counter, under
a counter that has not moved back. -/
theorem ScopesKept.grow {before s t : State} (kept : ScopesKept before s) (issued : s.nextIssue ≤ t.nextIssue)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ s.nextIssue ≤ entry.id.value) : ScopesKept before t := by
  refine ⟨fun old member => Nat.lt_of_lt_of_le (kept.1 old member) issued, fun entry member named => ?_⟩
  rcases scopes entry member with old | fresh
  · exact kept.2 entry old named
  · obtain ⟨prior, inside, same⟩ := List.mem_map.mp named
    have below := kept.1 prior inside
    rw [same] at below
    omega

/-- `ScopesKept.grow` for an operation that drops scope occurrences and issues nothing. -/
theorem ScopesKept.shrink {before s t : State} (kept : ScopesKept before s) (fewer : t.scopes.Sublist s.scopes)
    (issued : t.nextIssue = s.nextIssue) : ScopesKept before t :=
  kept.grow (Nat.le_of_eq issued.symm) fun _ member => .inl (fewer.subset member)

/-- `ScopesKept.grow` for an operation that issues one identity and enters at most one scope occurrence, under it. -/
theorem ScopesKept.enter {before s t : State} (kept : ScopesKept before s) (issued : t.nextIssue = s.nextIssue + 1)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ entry.id = ⟨s.nextIssue⟩) : ScopesKept before t :=
  kept.grow (by omega) fun entry member => (scopes entry member).imp_right fun same => by
    rw [same]
    exact Nat.le_refl _

/-- Pending lemma request R13 (`Kernel.Laws.State`): the removal operations drop scope occurrences and issue no
identity. -/
structure PendingRemoval : Prop where
  removal_shrinks : ∀ s : State,
    (∀ scope keep, (s.clearInside scope keep).scopes.Sublist s.scopes ∧
      (s.clearInside scope keep).nextIssue = s.nextIssue) ∧
    (∀ scope, (s.leaveScope scope).scopes.Sublist s.scopes ∧ (s.leaveScope scope).nextIssue = s.nextIssue) ∧
    (∀ id, (s.removeOccurrence id).scopes.Sublist s.scopes ∧ (s.removeOccurrence id).nextIssue = s.nextIssue) ∧
    ∀ id, (s.cancelOccurrence id).scopes.Sublist s.scopes ∧ (s.cancelOccurrence id).nextIssue = s.nextIssue

/-- `t` agrees with `s` on everything a property carried beside `WellFormed` may read: the scope occurrences, the
occurrences, the issue and activation counters, the journal, the draft and the instance identity. -/
structure Unmoved (s t : State) : Prop where
  scopes : t.scopes = s.scopes
  occurrences : t.occurrences = s.occurrences
  nextIssue : t.nextIssue = s.nextIssue
  activations : t.activations = s.activations
  journal : t.journal = s.journal
  draft : t.draft = s.draft
  instanceId : t.instanceId = s.instanceId

/-- What the state operations the hooks apply keep of a property `rel` carried beside `WellFormed`: an update of
nothing `rel` may read (`Unmoved`), issuing an identity, entering a scope occurrence or a Call's called root,
reserving an occurrence, leaving or clearing a scope occurrence, disarming a host and a variable write or removal. A feature's
operations record of `WellFormed` and `rel` follows from its record of `WellFormed` and this one. -/
structure Alongside (rel : State → Prop) : Prop where
  frame : ∀ s t, Unmoved s t → rel s → rel t
  issue : ∀ s, rel s → rel s.issue.1
  enterScope : ∀ program s element parent locals owner, WellFormed program s → rel s →
    rel (s.enterScope element parent locals owner).1
  enterCalled : ∀ program s called call variables definition, WellFormed program s → rel s →
    rel (s.enterCalled called call variables definition).1
  reserve : ∀ program s element scope, WellFormed program s → rel s → rel (s.reserve element scope).1
  leaveScope : ∀ program s scope, WellFormed program s → rel s → rel (s.leaveScope scope)
  clearInside : ∀ program s scope keep, WellFormed program s → rel s → rel (s.clearInside scope keep)
  disarm : ∀ program s host, WellFormed program s → rel s → rel (s.disarm host)
  setVariable : ∀ program s target name value, WellFormed program s → rel s → rel (s.setVariable target name value)
  removeVariable : ∀ program s target name, WellFormed program s → rel s → rel (s.removeVariable target name)

/-- The state operations the hooks apply keep the scope occurrences of any before-state. -/
theorem scopesKept_alongside (pending : PendingRemoval) (before : State) : Alongside (ScopesKept before) where
  frame _ _ moved kept := kept.shrink (by rw [moved.scopes]; exact .refl _) moved.nextIssue
  issue s kept := by
    rw [Laws.State.issue_eq]
    exact kept.enter rfl fun _ member => .inl member
  enterScope _ s element parent locals owner _ kept := by
    rw [Laws.State.enterScope_eq]
    exact kept.enter rfl fun entry member => (List.mem_append.mp member).imp_right fun fresh => by
      rw [List.mem_singleton.mp fresh]
  enterCalled _ s called call variables definition formed kept := by
    have fresh : ∀ entry ∈ s.scopes, entry.id ≠ ⟨s.nextIssue⟩ := fun entry inside same => by
      have below := formed.issued.scopes entry inside
      rw [same] at below
      exact Nat.lt_irrefl _ below
    rw [Laws.State.enterCalled_eq _ _ _ _ _ fresh]
    exact kept.enter rfl fun entry member => (List.mem_append.mp member).imp_right fun fresh => by
      rw [List.mem_singleton.mp fresh]
  reserve _ s element scope formed kept :=
    have reserves := Laws.State.reserve_reserves formed.activations element scope
    kept.enter reserves.nextIssue fun _ member => .inl (reserves.scopes ▸ member)
  leaveScope _ s scope _ kept := kept.shrink ((pending.removal_shrinks s).2.1 scope).1 ((pending.removal_shrinks s).2.1 scope).2
  clearInside _ s scope keep _ kept :=
    kept.shrink ((pending.removal_shrinks s).1 scope keep).1 ((pending.removal_shrinks s).1 scope keep).2
  disarm _ s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept
  setVariable _ s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.shrink (by rw [same.scopes]; exact .refl _) same.nextIssue
  removeVariable _ s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.shrink (by rw [same.scopes]; exact .refl _) same.nextIssue

/-- A queued signal moves nothing `rel` reads. -/
theorem Alongside.signal {rel : State → Prop} (side : Alongside rel) {s : State} (kept : rel s) (signal : Signal) :
    rel (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact side.frame s _ ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩ kept

/-- `Step`'s phases keep `KeepsScopes before` where they keep `WellFormed`: they record, queue, begin, reserve and start
occurrences, which keeps the scope occurrences and never lowers the counter, and remove occurrences and clear scope
occurrences, which drops some (`PendingRemoval`). -/
theorem keepsScopes_phases (phases : Laws.Step.Phases WellFormed) (pending : PendingRemoval) (before : State) :
    Laws.Step.Phases (KeepsScopes before) where
  reset _ _ holds := ⟨phases.reset _ _ holds.1, holds.2⟩
  clock _ _ atMs holds := ⟨phases.clock _ _ atMs holds.1, holds.2⟩
  journal _ _ transition holds started ended := ⟨phases.journal _ _ transition holds.1 started ended, holds.2⟩
  runOrder _ _ holds := ⟨phases.runOrder _ _ holds.1, holds.2⟩
  dequeue _ _ signals holds fewer := ⟨phases.dequeue _ _ signals holds.1 fewer, holds.2⟩
  untoken _ _ tokens holds fewer := ⟨phases.untoken _ _ tokens holds.1 fewer, holds.2⟩
  queueWrite _ _ scope writes rule holds :=
    ⟨phases.queueWrite _ _ scope writes rule holds.1, (scopesKept_alongside pending before).signal holds.2 _⟩
  queueRemove _ _ scope names holds :=
    ⟨phases.queueRemove _ _ scope names holds.1, (scopesKept_alongside pending before).signal holds.2 _⟩
  armIssued _ _ host element scope holds := phases.armIssued _ _ host element scope holds.1
  armScopeIssued _ _ scope holds := phases.armScopeIssued _ _ scope holds.1
  armGatewayIssued _ _ occurrence gateway scope holds :=
    phases.armGatewayIssued _ _ occurrence gateway scope holds.1
  endRecorded _ _ status failure holds := phases.endRecorded _ _ status failure holds.1
  admittedSignal _ _ request rest holds := phases.admittedSignal _ _ request rest holds.1
  admittedToken _ _ request rest holds := phases.admittedToken _ _ request rest holds.1
  completeQueued _ _ id leave writes rule holds := phases.completeQueued _ _ id leave writes rule holds.1
  resumable _ _ scope activity trigger leave resume rest holds :=
    phases.resumable _ _ scope activity trigger leave resume rest holds.1
  housed _ _ occurrence holds := phases.housed _ _ occurrence holds.1
  parkedBegun _ _ waiting occurrence holds := phases.parkedBegun _ _ waiting occurrence holds.1
  endInstance _ s status failure holds recorded := by
    refine ⟨phases.endInstance _ _ status failure holds.1 recorded, ?_⟩
    rw [Laws.Step.endInstance_eq]
    exact holds.2.shrink ((pending.removal_shrinks s).1 State.root []).1 ((pending.removal_shrinks s).1 State.root []).2
  begin _ s request role sourceType holds stands admitted :=
    have begun := phases.begin _ _ request role sourceType holds.1 stands admitted
    have begins := Laws.State.beginOccurrence_begins holds.1.activations request role sourceType
    have issued : s.nextIssue ≤ (s.beginOccurrence request role sourceType).1.nextIssue := by
      rcases begins.source with ⟨_, reserved⟩ | fresh
      · exact Nat.le_of_eq reserved.nextIssue.symm
      · rw [fresh.nextIssue]
        exact Nat.le_succ _
    ⟨⟨begun.1, holds.2.grow issued fun _ member => .inl (begins.scopes ▸ member)⟩, begun.2⟩
  reserve _ s element scope holds stands :=
    have reserved := phases.reserve _ _ element scope holds.1 stands
    ⟨⟨reserved.1, (scopesKept_alongside pending before).reserve _ s element scope holds.1 holds.2⟩, reserved.2⟩
  startReserved _ s occurrence sourceType holds member unnamed := by
    refine ⟨phases.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    show ScopesKept before (s.startReserved occurrence sourceType).1
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      exact holds.2.shrink (by rw [starts.scopes]; exact .refl _) starts.nextIssue
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence _ s occurrence holds member free :=
    have removed := phases.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, holds.2.shrink ((pending.removal_shrinks s).2.2.1 occurrence.id).1
      ((pending.removal_shrinks s).2.2.1 occurrence.id).2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨phases.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2⟩
  cancel _ s id holds := ⟨phases.cancel _ _ id holds.1,
    holds.2.shrink ((pending.removal_shrinks s).2.2.2 id).1 ((pending.removal_shrinks s).2.2.2 id).2⟩

/-! ## Every removed occurrence ends once

A committed input ends each begun occurrence it removes exactly once in its journal because it keeps, from its start
(the before-state with an empty journal and draft), what `Laws.Step.EndsKept` says of its end facts: they are distinct,
and each begun occurrence of the start that is gone has ended under its key there. Each micro-step keeps it and leaves
no end fact in the draft (`MicroStepsKeepEnds`), the hooks through their contract of `Laws.Step.EndsInv` and the
completion pipeline as a unit (`Laws.Step.complete_ends`). The invariant is indexed by the input's start, not by each
micro-step's: `WellFormed` says nothing of the end facts an input has journalled, so a micro-step from a well-formed
state whose journal already ends an occurrence it holds would end that occurrence twice. -/

/-- Each committed micro-step of an input on a running instance keeps the input's end facts from its start `b` and
leaves none in the draft: the input's own transition and every closure micro-step (`Laws.Step.ClosureStep`). -/
def MicroStepsKeepEnds (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (cause : Cause) (transition : State → Outcome) (b state after : State),
    Laws.Step.RunsTransition hooks ctx transition → Laws.Step.EndsInv b none ctx.program state →
    Step.microStep hooks ctx cause none State.root transition state = .ok after →
    Laws.Step.EndsInv b none ctx.program after ∧ after.draft.ended = []) ∧
  ∀ (ctx : Ctx) (b state after : State), Laws.Step.EndsInv b none ctx.program state →
    Laws.Step.ClosureStep hooks ctx state after → Laws.Step.EndsInv b none ctx.program after ∧ after.draft.ended = []

/-- A list whose keys are distinct holds the key `key` once if at all. -/
theorem once_of_nodup {α β : Type} {facts : List (α × β)} {key : α} (distinct : (facts.map (·.1)).Nodup)
    (member : key ∈ facts.map (·.1)) :
    ∃ earlier value later, facts = earlier ++ (key, value) :: later ∧ ∀ fact ∈ earlier ++ later, fact.1 ≠ key := by
  obtain ⟨⟨_, value⟩, inside, rfl⟩ := List.mem_map.mp member
  obtain ⟨earlier, later, rfl⟩ := List.append_of_mem inside
  refine ⟨earlier, value, later, rfl, fun fact other same => ?_⟩
  rw [List.map_append, List.map_cons] at distinct
  have apart := (List.nodup_append.mp distinct)
  rcases List.mem_append.mp other with inEarlier | inLater
  · exact apart.2.2 _ (List.mem_map_of_mem inEarlier) _ (List.mem_cons_self) same
  · exact (List.nodup_cons.mp apart.2.1).1 (same ▸ List.mem_map_of_mem inLater)

/-- `RemovedEndOnce` from `MicroStepsKeepEnds`: the input's start is well-formed and has ended nothing, so it keeps its
own end facts (`Laws.Step.EndsKept.start`); its micro-steps carry them to the settled closure, whose draft is empty, so
the removed occurrence's key, among distinct end keys, ends once in the journal, which run order only permutes. -/
theorem removedEndOnce {hooks : Hooks} (kept : MicroStepsKeepEnds hooks) : RemovedEndOnce hooks := by
  intro program input before after occurrence formed ran member begun gone
  rcases Laws.Step.step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, transition, runs, ran⟩
  · simp at fresh
  obtain ⟨_, start, moved, rest⟩ := Laws.Step.onRunning_ok ran
  obtain ⟨settled, present, _, rest⟩ := rest
  obtain ⟨clocked, stepped, settling, made⟩ := rest
  obtain rfl := Option.some.inj present
  have entered : WellFormed (Laws.Step.inputCtx hooks program input).program before := by
    rw [Laws.Step.inputCtx_program]
    exact formed
  have startFormed : WellFormed (Laws.Step.inputCtx hooks program input).program start := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩
    · exact Laws.State.reset_wellFormed entered
    · exact Laws.State.clock_wellFormed (Laws.State.reset_wellFormed entered) _
  have startEmpty : Laws.Step.endKeys start = [] := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> rfl
  have sameInstance : ∀ scope, start.instanceOf scope = before.instanceOf scope := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact Laws.State.instanceOf_congr rfl rfl
  have startMember : occurrence ∈ start.occurrences := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact member
  obtain ⟨movedHolds, movedDraft⟩ :=
    kept.1 _ _ _ start start moved runs ⟨startFormed, Laws.Step.EndsKept.start startFormed startEmpty⟩ stepped
  obtain ⟨⟨_, settledKept⟩, settledDraft⟩ := Laws.Step.settle_induction
    (fun s => Laws.Step.EndsInv start none (Laws.Step.inputCtx hooks program input).program s ∧ s.draft.ended = [])
    (fun s s' holds closure => kept.2 _ start s s' holds.1 closure) _ _ moved settled ⟨movedHolds, movedDraft⟩ settling
  subst made
  have key : before.keyOf occurrence ∈ Laws.Step.endKeys settled := by
    have ended := settledKept.removed occurrence startMember begun gone fun _ none => by cases none
    rwa [Laws.State.keyOf_eq, Laws.State.key, ← sameInstance]
  have reordered : ((settled.journal.reverse.flatMap (·.ended)).map (·.1)).Perm (Laws.Step.endKeys settled) := by
    simp only [Laws.Step.endKeys, settledDraft, List.append_nil]
    exact ((List.reverse_perm settled.journal).flatMap_right _).map _
  exact once_of_nodup (reordered.nodup_iff.mpr settledKept.nodup) (reordered.mem_iff.mpr key)

end Kernel.Proofs.Cancellation
