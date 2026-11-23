module

public import Kernel.Proofs.Frame
public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.Step.Ends
public import Kernel.Laws.Scopes
public import Kernel.Proofs.Cancellation.Compacts

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

variable {program : Program} {schedule : BranchSchedule}

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds occurrenceIds)
open Kernel.Proofs.Frame

/-- After a committed input, nothing lies in the subtree, in the before-state, of a scope occurrence the input
removed: no token, open item, occurrence or variable set (BPMN 2.0.2 §13.5.3, §10.5.6; `Laws.State.ClearsInside`). The
feature slots' entries there (parked joins, Multi-Instance runs, compensation runs) are not stated. -/
def SubtreeRemoved (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (removed : ScopeOccurrenceId),
    WellFormed program before → Laws.State.Committed before → Step.step hooks program (some before) input = .ok after →
    removed ∈ scopeIds before → removed ∉ scopeIds after →
    (∀ token ∈ Laws.State.allQueuedTokens after, ¬ Within before token.busyScope removed) ∧
    (∀ item ∈ itemList after.openItems, ¬ Within before item.scope removed) ∧
    (∀ occurrence ∈ after.occurrences, ¬ Within before occurrence.scope removed) ∧
    (∀ variables ∈ after.variables, ¬ Within before variables.scope removed)

/-- The occurrence `occurrence` of `state` has the public identity `ref`: its element, activation and process instance
are the reference's, it is numbered under its element's counter, and it has begun or an open item waits for it. The
role matters because each role numbers under its own counter (R8), so a Multi-Instance body and its first instance
share element and activation; a reservation no item waits for answers to no reference. -/
def Designates (program : Program) (state : State) (ref : OccurrenceRef) (occurrence : Occurrence) : Prop :=
  (program.publicId occurrence.element = ref.element ∧ occurrence.activation = ref.activation ∧
    state.instanceOf occurrence.scope = ref.processInstanceId) ∧ occurrence.role = .element ∧
    (occurrence.begun = true ∨ ∃ item ∈ itemList state.openItems, item.id.occurrence = occurrence.id)

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
open items, tokens, variables, queued signals, feature slots, occurrence and position counters, activation counters,
status, failure and the running batch's intents are as they were. -/
structure Inert (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : Laws.State.allQueuedTokens after = Laws.State.allQueuedTokens before
  variables : after.variables = before.variables
  signals : Laws.State.allSignals after = Laws.State.allSignals before
  slots : after.slots = before.slots
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals
  nextPosition : after.nextPosition = before.nextPosition
  activations : after.activations = before.activations
  status : after.status = before.status
  failure : after.failure = before.failure
  batchIntents : after.batchIntents = before.batchIntents

/-- Queued work naming a scope occurrence that was issued and has since been removed has no effect: the closure
micro-step that runs it either fails the input or changes nothing but the journal (`Kernel/Step/Stale.lean`). Under
`Step` it never commits (`queuedWorkInert`): the micro-step fails and the input with it, so "no effect" is that
failure and `Inert` holds vacuously. It is stated of any closure state: such work keeps `WellFormed`, which asks only
that what queued work names was issued (`Laws.State.QueueSound`). -/
def QueuedWorkInert (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (next : Signal) (unit : UnitKey) (scope : ScopeOccurrenceId),
    state.queuedSignals[unit]? = some next → ActsIn next scope → Laws.State.ScopeIssued state scope →
    scope ∉ scopeIds state →
    Step.microStep hooks ctx unit (.signal (Step.signalName next)) none State.root (Step.dispatchSignal hooks ctx next)
      { state with queuedSignals := state.queuedSignals.erase unit } = .ok after →
    Inert { state with queuedSignals := state.queuedSignals.erase unit } after

/-- Every begun occurrence a committed input removes ends exactly once in the input's journal, which is when `Step`
hands a cancelled one to `Hooks.cancelled`, the owning features' notice: the journal's cancelled facts and their end
facts are made together (`Laws.State.removal_cancels_with_ends` of `State.clearInside` and `State.cancelOccurrence`);
the input's other end facts come from `State.recordEnd`. It covers every removed begun occurrence, a completed one as
much as a cancelled one; under the registered hooks `Hooks.cancelled` does nothing (`Laws.Registry.hooks_cancelled`),
so the single end fact is the whole notice. -/
def RemovedEndOnce (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (occurrence : Occurrence),
    WellFormed program before → Laws.State.Committed before → Step.step hooks program (some before) input = .ok after →
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
  intro ctx state after next unit scope _ acts issued removed ran
  obtain ⟨-, -, ran⟩ := Laws.Step.microStep_ok ran
  obtain ⟨_, _, body, -⟩ := ran
  rw [Laws.Step.dispatchSignal_eq] at body
  obtain ⟨other, otherCtx, names⟩ := acts
  obtain ⟨scopes, _, requires, _⟩ := Laws.Step.signalWork_targets hooks other ctx otherCtx next
  rcases Laws.Step.perform_absent
      (state := { { state with queuedSignals := state.queuedSignals.erase unit } with issuing := unit, issueNext := 0 })
      (by rw [scopes, requires]; exact names)
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
    (items : itemList s.openItems = itemList before.openItems) (sameInstance : s.instanceOf = before.instanceOf)
    (member : item ∈ itemList s.openItems) (named : program.publicId item.element = ref.element)
    (activation : (s.occurrence? item.id.occurrence).map (·.activation) = some ref.activation)
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
  (∀ old ∈ before.scopes, Laws.State.ScopeIssued s old.id) ∧ ∀ entry ∈ s.scopes, entry.id ∈ scopeIds before → entry ∈ before.scopes

/-- A committed input keeps its well-formed before-state's scope occurrences (`ScopesKept`). -/
def StepKeepsScopes (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State),
    WellFormed program before → Laws.State.Committed before → Step.step hooks program (some before) input = .ok after →
    ScopesKept before after

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
      WellFormed program before → Laws.State.Committed before → Step.step hooks program (some before) input = .ok after →
      WellFormed program after)
    (scopes : StepKeepsScopes hooks) : SubtreeRemoved hooks := by
  intro program input before after removed formed committed ran _ gone
  have formedAfter := wellFormed program input before after formed committed ran
  have outside := fun {scope} => outside_removed formed formedAfter (scopes program input before after formed committed ran)
    gone
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

/-- A committed input keeps `KeepsScopes` of its well-formed, committed before-state: what the walk gives from the
hooks' contract and `Step`'s phases of `KeepsScopes` of every before-state and the input's start, which keeps it
(`KeepsScopes.self`), since an input's reset changes no field `ScopesKept` reads (`Kernel.Proofs.Cancellation.Registered`
walks it through `Proofs.State.running_keeps`). -/
def KeepsScopesWalk (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State), WellFormed program before →
    Laws.State.Committed before → Step.step hooks program (some before) input = .ok after → KeepsScopes before program after

/-- `StepKeepsScopes` from the walk of `KeepsScopes`. -/
theorem stepKeepsScopes {hooks : Hooks} (keeps : KeepsScopesWalk hooks) : StepKeepsScopes hooks :=
  fun program input before after formed committed ran => (keeps program input before after formed committed ran).2

/-- `SubtreeRemoved` from the walk of `KeepsScopes` alone: its `WellFormed` half is the state-invariant lane's
preservation, and its scope half `StepKeepsScopes`. -/
theorem subtreeRemoved_of_keeps {hooks : Hooks} (keeps : KeepsScopesWalk hooks) : SubtreeRemoved hooks :=
  subtreeRemoved (fun program input before after formed committed ran =>
    (keeps program input before after formed committed ran).1) (stepKeepsScopes keeps)

/-! ### What the state operations keep of the before-state's scope occurrences

A hook or phase keeps `KeepsScopes before` when it keeps `WellFormed` (the state-invariant lane's records) and each
state operation it applies keeps `ScopesKept before`: it adds only a scope occurrence issued at the counter, drops
some, or leaves them, and never lowers the counter. The hooks' primitive operations are gathered in `FrameAlongside`
(`Kernel.Proofs.Frame`), which any property carried beside `WellFormed` fills, and those whose records carry no
premise for it in `Alongside`; `Kernel.Proofs.Cancellation.Registered` turns them into each feature's operations record
and the registered hooks' contract. -/

/-- `t` keeps the scope occurrences `before` held at `s`: those of `s` or ones under keys `s` never issued, while every
key `s` issued stays issued. -/
theorem ScopesKept.grow {before s t : State} (kept : ScopesKept before s) (grows : Laws.State.ScopeGrows s t)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ ¬ Laws.State.ScopeIssued s entry.id) : ScopesKept before t := by
  refine ⟨fun old member => grows.issued (kept.1 old member), fun entry member named => ?_⟩
  rcases scopes entry member with old | fresh
  · exact kept.2 entry old named
  · obtain ⟨prior, inside, same⟩ := List.mem_map.mp named
    exact absurd (same ▸ kept.1 prior inside) fresh

/-- `ScopesKept.grow` for an operation that drops scope occurrences. -/
theorem ScopesKept.shrink {before s t : State} (kept : ScopesKept before s) (fewer : t.scopes.Sublist s.scopes)
    (grows : Laws.State.ScopeGrows s t) : ScopesKept before t :=
  kept.grow grows fun _ member => .inl (fewer.subset member)

/-- `ScopesKept.grow` for an operation that keeps the scope occurrences and their counters. -/
theorem ScopesKept.same {before s t : State} (kept : ScopesKept before s) (scopes : t.scopes = s.scopes)
    (ordinals : t.scopeOrdinals = s.scopeOrdinals) (table : Laws.State.TableGrows s t := by exact .of_eq rfl) :
    ScopesKept before t :=
  kept.shrink (scopes ▸ .refl _) (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals table)

/-- `ScopesKept.grow` for an operation that enters at most one scope occurrence, under a key fresh from `s`. -/
theorem ScopesKept.enter {before s t : State} (kept : ScopesKept before s) {x : ScopeOccurrenceId}
    (fresh : Laws.State.ScopeFresh s t x) (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes ∨ entry.id = x) :
    ScopesKept before t :=
  kept.grow fresh.2.2 fun entry member => (scopes entry member).imp_right fun same => by
    rw [same]
    exact fresh.1

/-- The state operations the hooks apply keep the scope occurrences of any before-state. -/
theorem scopesKept_alongside (before : State) (program : Program) : Alongside program (ScopesKept before) where
  frame _ _ moved kept := kept.same moved.scopes moved.scopeOrdinals moved.table
  emit s _ _ _ _ _ kept := by rw [Laws.State.emit_eq]; exact kept
  complete s _ _ _ _ _ kept := by rw [Laws.State.signal_eq]; exact kept
  park _ _ _ _ kept := kept
  arm s _ _ _ _ _ kept := by rw [Laws.State.signal_eq]; exact kept
  armGateway s _ _ _ _ _ _ kept := by rw [Laws.State.signal_eq]; exact kept
  raise s _ _ _ _ _ kept := by rw [Laws.State.signal_eq]; exact kept
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  takePosition s kept := by
    rw [Laws.State.takePosition_eq]
    exact kept.shrink (.refl _) (.refl _)
  enterScope s element parent locals owner formed stands _ kept := by
    have fresh := Laws.State.enterScope_fresh formed.historic formed.issuer element stands locals owner
    rw [Laws.State.enterScope_eq] at fresh ⊢
    exact kept.enter fresh fun entry member => (List.mem_append.mp member).imp_right fun new => by
      rw [List.mem_singleton.mp new]
  reserve s element scope formed _ _ _ kept :=
    have reserves := Laws.State.reserve_reserves s element scope
    kept.same reserves.scopes reserves.scopeOrdinals (reserves.table formed.issuer)
  leaveScope s scope _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.1 scope).1 ((Laws.State.removal_shrinks s).2.1 scope).2.2
  clearInside s scope keep _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).1 scope keep).1 ((Laws.State.removal_shrinks s).1 scope keep).2.2
  disarm s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept
  setVariable s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.same same.scopes same.scopeOrdinals (.of_eq same.issued)
  removeVariable s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.same same.scopes same.scopeOrdinals (.of_eq same.issued)
  instanceBegin s _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  defer s _ _ _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept
  leaveInstance s _ scope _ _ _ _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.1 scope).1 ((Laws.State.removal_shrinks s).2.1 scope).2.2
  runs _ _ _ _ kept := kept.shrink (.refl _) (.refl _)

/-- Storing compensation runs keeps the scope occurrences of any before-state. -/
theorem scopesKept_stores (before : State) (program : Program) : StoresAlongside program (ScopesKept before) :=
  { (scopesKept_alongside before program).toFrameAlongside with
    storeRuns := fun _ _ _ _ _ _ kept => kept.shrink (.refl _) (.refl _) }

/-- `Step`'s phases keep the scope occurrences of a committed, well-formed before-state: journalling moves no scope
occurrence nor the counter, beginning issues at most one identity and enters no scope occurrence, cancelling drops some
(`Laws.State.removal_shrinks`), and the commit's renaming fixes the before-state's keys (`orderJournal_scopesKept`). -/
theorem scopesKept_stepAlongside {programBefore : Program} (before : State) (formedBefore : WellFormed programBefore before)
    (committed : Laws.State.Committed before) (program : Program) : StepAlongside program (ScopesKept before) where
  toFrameAlongside := (scopesKept_alongside before program).toFrameAlongside
  journal _ _ _ _ kept _ _ _ := kept
  queueBatch _ _ _ kept := by rw [Laws.State.queueBatch_eq]; exact kept
  runOrder _ _ _ formed kept counted batches _ _ made :=
    orderJournal_scopesKept formedBefore committed formed counted batches kept made
  dequeue _ _ _ _ kept := kept
  unqueue _ _ _ kept := kept
  untoken _ _ _ kept := kept
  begin _ request role sourceType formed _ _ _ _ kept :=
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    kept.same begins.scopes begins.scopeOrdinals (begins.table formed.issuer)
  cancel s id _ kept :=
    kept.shrink ((Laws.State.removal_shrinks s).2.2.2 id).1 ((Laws.State.removal_shrinks s).2.2.2 id).2.2

/-- `Step`'s phases keep `KeepsScopes before` where they keep `WellFormed`. -/
theorem keepsScopes_phases {programBefore : Program} (phases : Laws.Step.Phases WellFormed) (before : State)
    (formedBefore : WellFormed programBefore before) (committed : Laws.State.Committed before) :
    Laws.Step.Phases (KeepsScopes before) :=
  phases_alongside phases (scopesKept_stepAlongside before formedBefore committed) fun _ _ _ kept => kept.same rfl rfl

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
      exact holds.2.same starts.scopes starts.scopeOrdinals (.of_eq starts.issued)
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence _ s occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, holds.2.shrink ((Laws.State.removal_shrinks s).2.2.1 occurrence.id).1
      ((Laws.State.removal_shrinks s).2.2.1 occurrence.id).2.2⟩, removed.2⟩
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
leaves none in the draft: the input's own transition and every closure micro-step (`Laws.Step.ClosureStep`), between
micro-steps (`Laws.Step.Between`, DC12). -/
def MicroStepsKeepEnds (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (unit : UnitKey) (cause : Cause) (transition : State → Outcome) (b state after : State),
    Laws.Step.RunsTransition hooks ctx transition → Laws.Step.EndsInv b none ctx.program state →
    Laws.Step.Between state → Step.microStep hooks ctx unit cause none State.root transition state = .ok after →
    (Laws.Step.EndsInv b none ctx.program after ∧ Laws.Step.Between after) ∧ after.draft.ended = []) ∧
  ∀ (ctx : Ctx) (log : Step.RunLog) (unit : UnitKey) (b state after : State), Laws.Step.EndsInv b none ctx.program state →
    Laws.Step.Between state → Laws.Step.ClosureStep hooks ctx log unit state after →
    (Laws.Step.EndsInv b none ctx.program after ∧ Laws.Step.Between after) ∧ after.draft.ended = []

/-- Each committed micro-step of an input on a running instance keeps `inv` between micro-steps: its transition and
every closure micro-step. -/
def MicroStepsKeep (hooks : Hooks) (inv : Program → State → Prop) : Prop :=
  (∀ (ctx : Ctx) (unit : UnitKey) (cause : Cause) (transition : State → Outcome) (state after : State),
    Laws.Step.RunsTransition hooks ctx transition → inv ctx.program state → Laws.Step.Between state →
    Step.microStep hooks ctx unit cause none State.root transition state = .ok after →
    inv ctx.program after ∧ Laws.Step.Between after) ∧
  ∀ (ctx : Ctx) (log : Step.RunLog) (unit : UnitKey) (state after : State), inv ctx.program state →
    Laws.Step.Between state → Laws.Step.ClosureStep hooks ctx log unit state after →
    inv ctx.program after ∧ Laws.Step.Between after

/-- The walk of `Laws.Step.Keeps` keeps a property beside `WellFormed` through each micro-step, with the completion
pipeline as a premise: the closure's phases keep it by `ClosureAlongside` (`closurePhases_alongside`) when the issuer
resets keep it (`reissue`), and each body runs beside the transitions and the issuer it starts from (`framing`). -/
theorem microStepsKeep_alongside {hooks : Hooks} {rel : Program → State → Prop}
    (contract : Laws.Step.HookContract hooks fun program s => WellFormed program s ∧ rel program s)
    (phases : Laws.Step.ClosurePhases WellFormed) (side : ∀ program, ClosureAlongside program (rel program))
    (reissue : ∀ program s unit, rel program s → rel program { s with issuing := unit, issueNext := 0 })
    (facts : Laws.Step.StateFacts)
    (pipeline : Laws.Step.PipelineKeeps hooks fun program s => WellFormed program s ∧ rel program s)
    (framing : Laws.Step.Framing hooks WellFormed) :
    MicroStepsKeep hooks fun program s => WellFormed program s ∧ rel program s :=
  ⟨fun _ _ _ _ _ _ runs holds between ran => Laws.Step.microStep_carries contract
      (closurePhases_alongside phases side reissue) pipeline framing (fun _ _ holds => holds.1) holds between
      (fun _ keeps keepPhases kept _ transitioned => Laws.Step.transition_keeps keeps keepPhases runs kept transitioned) ran,
    fun _ _ _ _ _ holds between step => Laws.Step.closureStep_carries contract (closurePhases_alongside phases side reissue)
      facts pipeline framing (fun _ _ holds => holds.1) holds between step⟩

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

/-- A commit keeps the journal's end facts: its renaming rewrites a transition's cause, owner and started facts only
(`Laws.State.renameTransition_eq`). -/
theorem compact_ended {start : State} {log : Step.RunLog} {s t : State} (ran : Step.compact schedule start log s = .ok t) :
    t.journal.flatMap (·.ended) = s.journal.flatMap (·.ended) := by
  rcases Laws.Step.compact_cases ran with ⟨_, same⟩ | ⟨_, same⟩
  · rw [same]
  have journal : t.journal = s.journal.map (renameTransition (Laws.Step.commitRenaming schedule start log s)) := by
    have frame := Laws.Step.advance_frame (Laws.Step.commitRenaming schedule start log s) (Step.assign schedule start log s).2
      (renameState (Laws.Step.commitRenaming schedule start log s) (Laws.Step.commitRekey schedule start log s) s)
    rw [same]
    unfold Laws.Step.compacted
    rw [frame, Laws.State.renameState_eq]
  simp only [journal, List.flatMap_map, Laws.State.renameTransition_eq]

/-- `RemovedEndOnce` from `MicroStepsKeepEnds`: the input's start is well-formed and has ended nothing, so it keeps its
own end facts (`Laws.Step.EndsKept.start`); its micro-steps carry them to the settled closure, whose draft is empty, so
the removed occurrence's key, among distinct end keys, ends once in the journal, which run order only permutes. -/
theorem removedEndOnce {hooks : Hooks} (kept : MicroStepsKeepEnds hooks) : RemovedEndOnce hooks := by
  intro program input before after occurrence formed committed ran member begun gone
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
    · exact Laws.State.reset_wellFormed entered committed
    · exact Laws.State.clock_wellFormed (Laws.State.reset_wellFormed entered committed) _
  have startEmpty : Laws.Step.endKeys start = [] := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> rfl
  have sameInstance : ∀ scope, start.instanceOf scope = before.instanceOf scope := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact Laws.State.instanceOf_congr rfl rfl
  have startMember : occurrence ∈ start.occurrences := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact member
  obtain ⟨movedHolds, movedDraft⟩ :=
    kept.1 _ _ _ _ start start moved runs ⟨startFormed, Laws.Step.EndsKept.start startFormed startEmpty⟩
      (Laws.Step.advanceClock_between (Laws.Step.reset_between committed) clocked) stepped
  obtain ⟨⟨⟨_, settledKept⟩, _⟩, settledDraft⟩ := Laws.Step.settle_induction
    (fun s => (Laws.Step.EndsInv start none (Laws.Step.inputCtx hooks program input).program s ∧ Laws.Step.Between s) ∧
      s.draft.ended = [])
    (fun log unit s s' holds closure => kept.2 _ log unit start s s' holds.1.1 holds.1.2 closure) _ _ _ moved settled
    ⟨movedHolds, movedDraft⟩ settling
  have compacted := Laws.Step.orderJournal_of made
  -- The commit renames only fresh issues; the removed occurrence's key was committed before the input.
  have stays : occurrence.id ∉ occurrenceIds settled.1 := fun inside => by
    obtain ⟨old, oldIn, same⟩ := List.mem_map.mp inside
    obtain ⟨renamed, renamedIn, mapped⟩ := Laws.Step.compact_occurrence_mem compacted oldIn
    have named := mapped.id
    rw [same, Laws.Step.id_fixed committed.issued (formed.issued.occurrences occurrence member)
      (Laws.Step.renameBy_fixes _)] at named
    exact gone (List.mem_map.mpr ⟨renamed, renamedIn, named⟩)
  have key : before.keyOf occurrence ∈ Laws.Step.endKeys settled.1 := by
    have ended := settledKept.removed occurrence startMember begun stays fun _ none => by cases none
    rwa [Laws.State.keyOf_eq, Laws.State.key, ← sameInstance]
  have keys : ((after.journal.flatMap (·.ended)).map (·.1)).Perm (Laws.Step.endKeys settled.1) := by
    rw [compact_ended compacted]
    simp only [Laws.Step.endKeys, show settled.1.draft.ended = [] from settledDraft, List.append_nil]
    exact ((Laws.Step.byRun_perm _ _).flatMap_right _).map _
  exact once_of_nodup (keys.nodup_iff.mpr settledKept.nodup) (keys.mem_iff.mpr key)

end Kernel.Proofs.Cancellation
