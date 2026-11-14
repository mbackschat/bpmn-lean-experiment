module

public import Kernel.Laws.Step
public import Kernel.Laws.Step.Keeps
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
(`StepKeepsScopes`), an invariant of the closure relative to the before-state. A removed occurrence's single end fact
rests on the same lane's hook contract and phases and on each micro-step framing the end facts (`MicroStepsFrameEnds`),
a relation between a micro-step's two states that no invariant of `Laws.Step.Phases` can carry. Nothing executable
imports this module.
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

/-! ## Every removed occurrence ends once

A committed input ends each begun occurrence it removes exactly once in its journal because each of its micro-steps
frames the end facts (`EndsFrame`): it ends every begun occurrence it removes, each once, and nothing the input ended
before, and an occurrence a micro-step removed never returns, since identifiers are never reused. Frames compose
(`EndsFrame.trans`), so the closure's induction (`Laws.Step.settle_induction`) carries one from the input's start, whose
journal and draft are empty, to its last micro-step. What a micro-step does to the end facts is its hooks' and
`Step`'s (`MicroStepsFrameEnds`). -/

/-- The keys of the end facts of the input in progress: its journal's and its draft's. -/
def endKeys (s : State) : List OccurrenceKey := (s.journal.flatMap (·.ended) ++ s.draft.ended).map (·.1)

/-- From `s` to `t` the input ended the keys `added`, each once and none it had ended before, among them the key of every
begun occurrence of `s` that `t` no longer holds; a begun occurrence `t` still holds is still begun with its key; and an
occurrence `t` holds that `s` did not has an identifier issued at or above `s`'s counter. -/
structure EndsFrame (s t : State) : Prop where
  issued : s.nextIssue ≤ t.nextIssue
  fresh : ∀ id ∈ occurrenceIds t, id ∉ occurrenceIds s → s.nextIssue ≤ id
  stable : ∀ occurrence ∈ s.occurrences, occurrence.begun = true → ∀ kept ∈ t.occurrences, kept.id = occurrence.id →
    kept.begun = true ∧ Laws.State.key t kept = Laws.State.key s occurrence
  ends : ∃ added : List OccurrenceKey, (endKeys t).Perm (endKeys s ++ added) ∧ added.Nodup ∧
    (∀ key ∈ added, key ∉ endKeys s) ∧ ∀ occurrence ∈ s.occurrences, occurrence.begun = true →
      occurrence.id ∉ occurrenceIds t → Laws.State.key s occurrence ∈ added

/-- Each committed micro-step of an input on a running instance, from a well-formed state, frames the end facts and
leaves none in the draft: the input's own transition and every closure micro-step (`Laws.Step.ClosureStep`). -/
def MicroStepsFrameEnds (hooks : Hooks) : Prop :=
  (∀ (ctx : Ctx) (cause : Cause) (transition : State → Outcome) (state after : State),
    Laws.Step.RunsTransition hooks ctx transition → WellFormed ctx.program state →
    Step.microStep hooks ctx cause none State.root transition state = .ok after →
    EndsFrame state after ∧ after.draft.ended = []) ∧
  ∀ (ctx : Ctx) (state after : State), WellFormed ctx.program state → Laws.Step.ClosureStep hooks ctx state after →
    EndsFrame state after ∧ after.draft.ended = []

/-- An occurrence identifier issued below `s`'s counter that `t` no longer holds, `u` does not hold either. -/
theorem EndsFrame.gone {s t u : State} (first : EndsFrame s t) (second : EndsFrame t u) {id : Nat}
    (below : id < s.nextIssue) (absent : id ∉ occurrenceIds t) : id ∉ occurrenceIds u := fun held => by
  have := second.fresh id held absent
  have := first.issued
  omega

/-- Frames compose from a state whose occurrence identifiers were issued below its counter. -/
theorem EndsFrame.trans {s t u : State} (below : ∀ occurrence ∈ s.occurrences, occurrence.id < s.nextIssue)
    (first : EndsFrame s t) (second : EndsFrame t u) : EndsFrame s u where
  issued := Nat.le_trans first.issued second.issued
  fresh id held new := by
    by_cases middle : id ∈ occurrenceIds t
    · exact first.fresh id middle new
    · exact Nat.le_trans first.issued (second.fresh id held middle)
  stable occurrence member begun kept held same := by
    have middle : occurrence.id ∈ occurrenceIds t := Classical.byContradiction fun absent =>
      first.gone second (below occurrence member) absent (List.mem_map.mpr ⟨kept, held, same⟩)
    obtain ⟨between, inside, named⟩ := List.mem_map.mp middle
    obtain ⟨betweenBegun, betweenKey⟩ := first.stable occurrence member begun between inside named
    obtain ⟨keptBegun, keptKey⟩ := second.stable between inside betweenBegun kept held (same.trans named.symm)
    exact ⟨keptBegun, keptKey.trans betweenKey⟩
  ends := by
    obtain ⟨early, earlyPerm, earlyNodup, earlyRest⟩ := first.ends
    obtain ⟨earlyFresh, earlyRemoved⟩ := earlyRest
    obtain ⟨late, latePerm, lateNodup, lateRest⟩ := second.ends
    obtain ⟨lateFresh, lateRemoved⟩ := lateRest
    have ended : ∀ key, key ∈ endKeys s ++ early → key ∈ endKeys t := fun _ member => earlyPerm.mem_iff.mpr member
    refine ⟨early ++ late, latePerm.trans ((earlyPerm.append_right late).trans (by rw [List.append_assoc])),
      List.nodup_append.mpr ⟨earlyNodup, lateNodup, fun key inEarly other inLate same =>
        lateFresh other inLate (same ▸ ended key (List.mem_append_right _ inEarly))⟩, fun key member old => ?_,
      fun occurrence member begun absent => ?_⟩
    · rcases List.mem_append.mp member with inEarly | inLate
      · exact earlyFresh key inEarly old
      · exact lateFresh key inLate (ended key (List.mem_append_left _ old))
    · by_cases middle : occurrence.id ∈ occurrenceIds t
      · obtain ⟨between, inside, named⟩ := List.mem_map.mp middle
        obtain ⟨betweenBegun, betweenKey⟩ := first.stable occurrence member begun between inside named
        exact List.mem_append_right _
          (betweenKey ▸ lateRemoved between inside betweenBegun (named ▸ absent))
      · exact List.mem_append_left _ (earlyRemoved occurrence member begun middle)

/-- A closure micro-step keeps an invariant that the hooks and `Step`'s phases keep (`Laws.Step.settle_keeps`, one
micro-step at a time). -/
theorem closureStep_keeps {hooks : Hooks} {inv : Program → State → Prop} (contract : Laws.Step.HookContract hooks inv)
    (phases : Laws.Step.Phases inv) (facts : Laws.Step.StateFacts) {ctx : Ctx} {state after : State}
    (holds : inv ctx.program state) (stepped : Laws.Step.ClosureStep hooks ctx state after) : inv ctx.program after := by
  cases stepped with
  | signal _ queued ran =>
    exact Laws.Step.microStep_keeps contract phases facts
      (fun _ dispatched => Laws.Step.signal_keeps contract phases facts holds queued dispatched) ran
  | token _ _ next ran =>
    exact Laws.Step.moveToken_keeps contract phases facts (phases.untoken _ _ _ holds (Laws.Step.nextToken_rest next))
      (fun request same => phases.admittedToken _ _ _ _ holds (same ▸ Laws.Step.nextToken_shape next)) ran
  | idle _ _ _ idle ran =>
    exact Laws.Step.microStep_keeps contract phases facts (fun _ completed =>
      Laws.Step.completeIdleScope_keeps contract facts holds (Laws.Step.idleScope_mem idle) completed) ran
  | reoffer _ _ _ _ offered ran =>
    refine Laws.Step.microStep_keeps contract phases facts (fun next made => ?_) ran
    simp only [Except.ok.injEq] at made
    exact made ▸ Laws.Step.reoffer_keeps contract phases facts holds offered
  | finish _ _ _ _ _ _ ran =>
    refine Laws.Step.microStep_keeps contract phases facts (fun next ended => ?_) ran
    simp only [Except.ok.injEq] at ended
    exact ended ▸ phases.endInstance _ _ _ _ holds (by simp)

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

/-- `RemovedEndOnce`, from the state-invariant lane's hook contract and phases of `WellFormed` (which keep it through
each micro-step, `closureStep_keeps`) and `MicroStepsFrameEnds`: the input's start has ended nothing, its micro-steps'
frames compose into one from the start to the settled closure, whose draft holds no end fact, and the journal put in run
order is a permutation of the settled one, so the removed occurrence's key, among the frame's distinct added keys,
ends once. -/
theorem removedEndOnce {hooks : Hooks} (contract : Laws.Step.HookContract hooks WellFormed)
    (phases : Laws.Step.Phases WellFormed) (facts : Laws.Step.StateFacts) (framed : MicroStepsFrameEnds hooks) :
    RemovedEndOnce hooks := by
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
  have startFormed := Laws.Step.advanceClock_keeps phases (phases.reset _ _ entered) clocked
  have movedFormed := Laws.Step.microStep_keeps contract phases facts
    (fun _ transitioned => Laws.Step.transition_keeps contract phases runs startFormed transitioned) stepped
  have below : ∀ occurrence ∈ start.occurrences, occurrence.id < start.nextIssue := startFormed.issued.occurrences
  obtain ⟨_, settledFrame, settledDraft⟩ := Laws.Step.settle_induction
    (fun s => WellFormed (Laws.Step.inputCtx hooks program input).program s ∧ EndsFrame start s ∧ s.draft.ended = [])
    (fun s s' ⟨holds, frame, _⟩ closure => by
      obtain ⟨frame', draft'⟩ := framed.2 _ s s' holds closure
      exact ⟨closureStep_keeps contract phases facts holds closure, frame.trans below frame', draft'⟩)
    _ _ moved settled ⟨movedFormed, framed.1 _ _ _ start moved runs startFormed stepped⟩ settling
  obtain ⟨added, perm, distinct, rest⟩ := settledFrame.ends
  have removed := rest.2
  have startEmpty : endKeys start = [] := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> rfl
  have sameInstance : ∀ scope, start.instanceOf scope = before.instanceOf scope := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact Laws.State.instanceOf_congr rfl rfl
  have startMember : occurrence ∈ start.occurrences := by
    rcases Laws.Step.advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact member
  subst made
  have key : before.keyOf occurrence ∈ added := by
    have ended := removed occurrence startMember begun gone
    rwa [Laws.State.keyOf_eq, Laws.State.key, ← sameInstance]
  rw [startEmpty, List.nil_append] at perm
  have reordered : ((settled.journal.reverse.flatMap (·.ended)).map (·.1)).Perm added := by
    refine List.Perm.trans ?_ perm
    simp only [endKeys, settledDraft, List.append_nil]
    exact ((List.reverse_perm settled.journal).flatMap_right _).map _
  exact once_of_nodup (reordered.nodup_iff.mpr distinct) (reordered.mem_iff.mpr key)

end Kernel.Proofs.Cancellation
