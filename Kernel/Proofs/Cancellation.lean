module

public import Kernel.Proofs.Frame
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

A proof here composes `Laws.Step`'s, `Laws.Hooks`' and `Laws.State`'s lemmas and opens no body. Subtree removal rests on
the state-invariant lane's preservation of `WellFormed` and on the step keeping its before-state's scope occurrences
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
open Kernel.Proofs.Frame

/-- After a committed input, nothing lies in the subtree, in the before-state, of a scope occurrence the input
removed: no token, open item, occurrence or variable set (BPMN 2.0.2 §13.5.3, §10.5.6; `Laws.State.ClearsInside`). The
feature slots' entries there (parked joins, Multi-Instance runs, compensation runs) are not stated. -/
def SubtreeRemoved (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (removed : ScopeOccurrenceId),
    WellFormed program before → Step.step hooks program (some before) input = .ok after →
    removed ∈ scopeIds before → removed ∉ scopeIds after →
    (∀ token ∈ after.tokens, ¬ Within before token.busyScope removed) ∧
    (∀ item ∈ after.openItems, ¬ Within before item.scope removed) ∧
    (∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope removed) ∧
    (∀ variables ∈ after.variables, ¬ Within before variables.scope removed)

/-- The occurrence `occurrence` of `state` has the public identity `ref`: its element, activation and process instance
are the reference's, it is numbered under its element's counter, and it has begun or an open item waits for it. The
role matters because each role numbers under its own counter (R8), so a Multi-Instance body and its first instance
share element and activation; a reservation no item waits for answers to no reference. -/
def Designates (program : Program) (state : State) (ref : OccurrenceRef) (occurrence : Occurrence) : Prop :=
  (program.publicId occurrence.element = ref.element ∧ occurrence.activation = ref.activation ∧
    state.instanceOf occurrence.scope = ref.processInstanceId) ∧ occurrence.role = .element ∧
    (occurrence.begun = true ∨ ∃ item ∈ state.openItems, item.occurrence = occurrence.id)

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

/-- The queued signal acts in the scope occurrence `scope`: its work, as `Step.signalWork` builds it, does something
in `scope` (an arming, a begin, an `occur`: `SignalWork.scopes`) or acts from it (a write, a removal, a compensation, a
compensation's failure in its handler context: `SignalWork.requires`). The signal alone fixes both
(`Laws.Step.signalWork_targets`), so the hooks and context the work is read under are immaterial. A queued raise
(`Signal.raise`) names neither, so `QueuedWorkInert` states nothing of it: its search starts at its origin's scope
occurrence and fails the micro-step if that is gone (`raise-from-missing-scope`, `Feature.Propagation.searchScopes`),
but a raising Activity's own catching boundary fires before any search reads the scope tree
(`Feature.Propagation.raise`). -/
def ActsIn (signal : Signal) (scope : ScopeOccurrenceId) : Prop :=
  ∃ (hooks : Hooks) (ctx : Ctx),
    scope ∈ (Step.signalWork hooks ctx signal).scopes ∨ scope ∈ (Step.signalWork hooks ctx signal).requires

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
micro-step that runs it either fails the input or changes nothing but the journal (`Kernel/Step/Stale.lean`). Under
`Step` it never commits (`queuedWorkInert`): the micro-step fails and the input with it, so "no effect" is that
failure and `Inert` holds vacuously. It is stated of any closure state: such work keeps `WellFormed`, which asks only
that what queued work names was issued (`Laws.State.QueueSound`). -/
def QueuedWorkInert (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (next : Signal) (rest : List Signal) (scope : ScopeOccurrenceId),
    state.signals = next :: rest → ActsIn next scope → scope.value < state.nextIssue → scope ∉ scopeIds state →
    Step.microStep hooks ctx (.signal (Step.signalName next)) none State.root (Step.dispatchSignal hooks ctx next)
      { state with signals := rest } = .ok after →
    Inert { state with signals := rest } after

/-- Every begun occurrence a committed input removes ends exactly once in the input's journal, which is when `Step`
hands a cancelled one to `Hooks.cancelled`, the owning features' notice: the journal's cancelled facts and their end
facts are made together (`Laws.State.removal_cancels_with_ends` of `State.clearInside` and `State.cancelOccurrence`);
the input's other end facts come from `State.recordEnd`. It covers every removed begun occurrence, a completed one as
much as a cancelled one; under the registered hooks `Hooks.cancelled` does nothing (`Laws.Registry.hooks_cancelled`),
so the single end fact is the whole notice. -/
def RemovedEndOnce (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (occurrence : Occurrence),
    WellFormed program before → Step.step hooks program (some before) input = .ok after →
    occurrence ∈ before.occurrences → occurrence.begun = true → occurrence.id ∉ occurrenceIds after →
    ∃ earlier terminal later, after.journal.flatMap (·.ended) = earlier ++ (before.keyOf occurrence, terminal) :: later ∧
      ∀ fact ∈ earlier ++ later, fact.1 ≠ before.keyOf occurrence

/-! ## Queued work naming a removed scope occurrence -/

/-- `QueuedWorkInert` holds vacuously: the micro-step never commits. Work that does something in a removed scope
occurrence (an arming, a begin, an `occur`) is stale, and work that acts from one (a write, a removal, a compensation, a
compensation's failure) is gone (#121), which the signal's targets decide whatever the hooks
(`Laws.Step.signalWork_targets`, `Laws.Step.perform_absent`); either fails the micro-step's body, which a committed
micro-step ran (`Laws.Step.microStep_ok`). -/
theorem queuedWorkInert {hooks : Hooks} : QueuedWorkInert hooks := by
  intro ctx state after next rest scope _ acts issued removed ran
  obtain ⟨_, _, body, _⟩ := Laws.Step.microStep_ok ran
  rw [Laws.Step.dispatchSignal_eq] at body
  obtain ⟨other, otherCtx, names⟩ := acts
  obtain ⟨scopes, _, requires⟩ := Laws.Step.signalWork_targets hooks other ctx otherCtx next
  rcases Laws.Step.perform_absent (state := { state with signals := rest }) (by rw [scopes, requires]; exact names)
      issued fun entry member same => removed (List.mem_map.mpr ⟨entry, member, same⟩) with failed | failed <;>
    rw [failed] at body <;> cases body

/-! ## Inputs addressed to a removed occurrence -/

/-- An item an addressed lookup finds in a state with the before-state's occurrences, items, scope tree and instance
identity waits for an occurrence of the before-state that the lookup's reference designates: `WellFormed` gives every
open item an occurrence of its own element in its own scope occurrence (`Laws.State.Owned.itemOccurrences`) numbered
under its element's counter (`Laws.State.ItemRoles`), and the distinct identifiers make it the one the item's
activation was read from. -/
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
  exact ⟨found, owned, ⟨⟨ownerElement ▸ named, foundActivation, ownerScope ▸ sameInstance ▸ instance_⟩,
    formed.itemRoles item (items ▸ member) found owned ownerId, .inr ⟨item, items ▸ member, ownerId.symm⟩⟩⟩

/-- `LateInputRejected`: an input addressed to an occurrence the before-state does not hold finds nothing to act on,
neither the occurrence (`Laws.Step.occurrenceOf?_some` reads `Designates`' clauses) nor an open item of it
(`item_designates`), so `Step` rejects it before its transition commits anything (`Laws.Step.step_unknown`). -/
theorem lateInputRejected {hooks : Hooks} : LateInputRejected hooks := by
  intro program input before ref formed addressed undesignated
  refine Laws.Step.step_unknown addressed fun ctx s program_ occurrences items scopes named => ?_
  have sameInstance : s.instanceOf = before.instanceOf := funext (Laws.State.instanceOf_congr scopes named)
  subst program_
  refine ⟨?_, fun detail => ?_⟩
  · refine Option.eq_none_iff_forall_ne_some.mpr fun occurrence found => ?_
    obtain ⟨member, ⟨publicId, activation, instance_⟩, role, held⟩ := Laws.Step.occurrenceOf?_some found
    exact undesignated occurrence (occurrences ▸ member)
      ⟨⟨publicId, activation, sameInstance ▸ instance_⟩, role, items ▸ held⟩
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
never starts one, and an input's reset changes no field `ScopesKept` reads. -/
theorem stepKeepsScopes {hooks : Hooks} (contract : ∀ before, Laws.Step.HookContract hooks (KeepsScopes before))
    (phases : ∀ before, Laws.Step.Phases (KeepsScopes before))
    (pipeline : ∀ before, Laws.Step.PipelinePhases (KeepsScopes before)) (facts : Laws.Step.StateFacts) :
    StepKeepsScopes hooks := fun _ _ before _ formed ran =>
  (Laws.Step.running_keeps (contract before) (phases before) facts
    (Laws.Step.complete_keeps (contract before) (phases before).toClosurePhases (pipeline before) facts)
    ⟨Laws.State.reset_wellFormed formed, (KeepsScopes.self formed).2⟩ ran).2

/-- `SubtreeRemoved` from the hooks' contract and `Step`'s phases of `KeepsScopes` of every before-state alone: its
`WellFormed` half is the state-invariant lane's preservation, and its scope half `StepKeepsScopes`. -/
theorem subtreeRemoved_of_keeps {hooks : Hooks} (contract : ∀ before, Laws.Step.HookContract hooks (KeepsScopes before))
    (phases : ∀ before, Laws.Step.Phases (KeepsScopes before))
    (pipeline : ∀ before, Laws.Step.PipelinePhases (KeepsScopes before)) (facts : Laws.Step.StateFacts) :
    SubtreeRemoved hooks :=
  subtreeRemoved (fun _ _ before _ formed ran =>
    (Laws.Step.running_keeps (contract before) (phases before) facts
      (Laws.Step.complete_keeps (contract before) (phases before).toClosurePhases (pipeline before) facts)
      ⟨Laws.State.reset_wellFormed formed, (KeepsScopes.self formed).2⟩ ran).1)
    (stepKeepsScopes contract phases pipeline facts)

/-! ### What the state operations keep of the before-state's scope occurrences

A hook or phase keeps `KeepsScopes before` when it keeps `WellFormed` (the state-invariant lane's records) and each
state operation it applies keeps `ScopesKept before`: it adds only a scope occurrence issued at the counter, drops
some, or leaves them, and never lowers the counter. The hooks' primitive operations are gathered in `FrameAlongside`
(`Kernel.Proofs.Frame`), which any property carried beside `WellFormed` fills, and those whose records carry no
premise for it in `Alongside`; `Kernel.Proofs.Cancellation.Registered` turns them into each feature's operations record
and the registered hooks' contract. -/

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

/-- The state operations the hooks apply keep the scope occurrences of any before-state. -/
theorem scopesKept_alongside (before : State) : Alongside (ScopesKept before) where
  frame _ _ moved kept := kept.shrink (by rw [moved.scopes]; exact .refl _) moved.nextIssue
  signalBegin s _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
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
  reserve _ s element scope _ _ kept :=
    have reserves := Laws.State.reserve_reserves s element scope
    kept.enter reserves.nextIssue fun _ member => .inl (reserves.scopes ▸ member)
  leaveScope _ s scope _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.1 scope).1 ((Laws.State.removal_shrinks s).2.1 scope).2
  clearInside _ s scope keep _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).1 scope keep).1 ((Laws.State.removal_shrinks s).1 scope keep).2
  disarm _ s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept
  setVariable _ s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.shrink (by rw [same.scopes]; exact .refl _) same.nextIssue
  removeVariable _ s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.shrink (by rw [same.scopes]; exact .refl _) same.nextIssue
  instanceBegin s _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  defer s _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept
  leaveInstance _ s _ scope _ _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.1 scope).1 ((Laws.State.removal_shrinks s).2.1 scope).2
  runs _ _ kept := kept.shrink (.refl _) rfl

/-- Storing compensation runs keeps the scope occurrences of any before-state. -/
theorem scopesKept_stores (before : State) : StoresAlongside (ScopesKept before) :=
  { (scopesKept_alongside before).toFrameAlongside with storeRuns := fun _ _ _ _ _ _ kept => kept.shrink (.refl _) rfl }

/-- `Step`'s phases keep the scope occurrences of any before-state: journalling and ordering move no scope occurrence
nor the counter, beginning issues at most one identity and enters no scope occurrence, and cancelling drops some
(`Laws.State.removal_shrinks`). -/
theorem scopesKept_stepAlongside (before : State) : StepAlongside (ScopesKept before) where
  toFrameAlongside := (scopesKept_alongside before).toFrameAlongside
  journal _ _ _ _ kept _ _ := kept
  runOrder _ _ _ kept := kept
  dequeue _ _ _ _ _ kept := kept
  untoken _ _ _ _ _ kept := kept
  begin _ s request role sourceType formed _ _ _ _ kept :=
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    kept.grow (by
      rcases begins.source with ⟨_, reserved⟩ | fresh
      · exact Nat.le_of_eq reserved.nextIssue.symm
      · rw [fresh.nextIssue]
        exact Nat.le_succ _) fun _ member => .inl (begins.scopes ▸ member)
  cancel _ s id _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.2.2 id).1 ((Laws.State.removal_shrinks s).2.2.2 id).2

/-- `Step`'s phases keep `KeepsScopes before` where they keep `WellFormed`. -/
theorem keepsScopes_phases (phases : Laws.Step.Phases WellFormed) (before : State) :
    Laws.Step.Phases (KeepsScopes before) :=
  phases_alongside phases fun _ => scopesKept_stepAlongside before

/-- The completion pipeline's own phases keep `KeepsScopes before` where they keep `WellFormed`: starting a reservation
keeps the scope occurrences, removing an occurrence drops some (`Laws.State.removal_shrinks`), and journalling an end
moves none. -/
theorem keepsScopes_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed)
    (before : State) : Laws.Step.PipelinePhases (KeepsScopes before) where
  startReserved _ s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    show ScopesKept before (s.startReserved occurrence sourceType).1
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      exact holds.2.shrink (by rw [starts.scopes]; exact .refl _) starts.nextIssue
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, holds.2.shrink ((Laws.State.removal_shrinks s).2.2.1 occurrence.id).1
      ((Laws.State.removal_shrinks s).2.2.1 occurrence.id).2⟩, removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2⟩

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

/-- Each committed micro-step of an input on a running instance keeps `inv`: its transition and every closure
micro-step. -/
def MicroStepsKeep (hooks : Hooks) (inv : Program → State → Prop) : Prop :=
  (∀ (ctx : Ctx) (cause : Cause) (transition : State → Outcome) (state after : State),
    Laws.Step.RunsTransition hooks ctx transition → inv ctx.program state →
    Step.microStep hooks ctx cause none State.root transition state = .ok after → inv ctx.program after) ∧
  ∀ (ctx : Ctx) (state after : State), inv ctx.program state → Laws.Step.ClosureStep hooks ctx state after →
    inv ctx.program after

/-- The walk of `Laws.Step.Keeps` keeps a property beside `WellFormed` through each micro-step, with the completion
pipeline as a premise: the closure's phases keep it by `ClosureAlongside` (`closurePhases_alongside`). -/
theorem microStepsKeep_alongside {hooks : Hooks} {rel : Program → State → Prop}
    (contract : Laws.Step.HookContract hooks fun program s => WellFormed program s ∧ rel program s)
    (phases : Laws.Step.ClosurePhases WellFormed) (side : ∀ program, ClosureAlongside (rel program))
    (facts : Laws.Step.StateFacts)
    (pipeline : Laws.Step.PipelineKeeps hooks fun program s => WellFormed program s ∧ rel program s) :
    MicroStepsKeep hooks fun program s => WellFormed program s ∧ rel program s :=
  ⟨fun _ _ _ _ _ runs holds ran => Laws.Step.microStep_keeps contract (closurePhases_alongside phases side) pipeline
      (fun _ transitioned => Laws.Step.transition_keeps contract (closurePhases_alongside phases side) runs holds transitioned) ran,
    fun _ _ _ holds step => Laws.Step.closureStep_keeps contract (closurePhases_alongside phases side) facts pipeline holds step⟩

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
