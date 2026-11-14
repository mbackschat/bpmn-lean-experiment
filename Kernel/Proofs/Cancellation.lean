module

public import Kernel.Laws.Step
public import Kernel.Laws.Scopes

/-! # Proofs: cancellation (P3)

The statements of the proof wave's cancellation lane ([PLAN, P3](../../docs/PLAN.md#proof-wave)), from a
`Laws.State.WellFormed` before-state: subtree removal leaves no token, open item, occurrence or variable of the removed
subtree; an input addressed to a removed occurrence is rejected without effect; queued work naming a removed scope
occurrence has no effect; every owning feature is notified once. Each is stated over a hooks parameter and closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`. No model premise is needed: removal is generic (`State.clearInside`,
`State.cancelOccurrence`) and reads no IL.

A proof here composes `Laws.Step`'s, `Laws.Hooks`' and `Laws.State`'s lemmas and opens no body. A `Step` fact it needs
that no `Laws` module states yet is an explicit premise named as a pending lemma request (`PendingStale`, `PendingLate`),
never a model or state premise of the lane statement; the root replaces it with the lemma once that lands. Subtree
removal rests on the state-invariant lane's preservation of `WellFormed` and on the step keeping its before-state's
scope occurrences (`StepKeepsScopes`), an invariant of the closure relative to the before-state. Nothing executable
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

/-! ## Pending lemma requests

`Kernel.Laws.Step` facts the proofs below use, stated exactly as requested of its owner; each field becomes the lemma of
the same name, and the premise goes, once it lands. -/

/-- A queued arming, begin or `occur` whose scope occurrence was issued and is gone fails the input as
`interrupted-before-wait` (`Step.stale`), as `Laws.Step.write_scope_gone` and its siblings state of the work that acts
from a scope occurrence (`Step.gone`). -/
structure PendingStale : Prop where
  arm_scope_stale : ∀ (hooks : Hooks) (ctx : Ctx) (host : Nat) (element : ElementId) (scope : ScopeOccurrenceId)
    (state : State), scope.value < state.nextIssue → (∀ entry ∈ state.scopes, entry.id ≠ scope) →
    (Step.signalWork hooks ctx (.arm host element scope)).perform state = .error (.unsupported "interrupted-before-wait")
  armScope_stale : ∀ (hooks : Hooks) (ctx : Ctx) (scope : ScopeOccurrenceId) (state : State),
    scope.value < state.nextIssue → (∀ entry ∈ state.scopes, entry.id ≠ scope) →
    (Step.signalWork hooks ctx (.armScope scope)).perform state = .error (.unsupported "interrupted-before-wait")
  armGateway_scope_stale : ∀ (hooks : Hooks) (ctx : Ctx) (occurrence : Nat) (gateway : ElementId)
    (scope : ScopeOccurrenceId) (state : State), scope.value < state.nextIssue → (∀ entry ∈ state.scopes, entry.id ≠ scope) →
    (Step.signalWork hooks ctx (.armGateway occurrence gateway scope)).perform state =
      .error (.unsupported "interrupted-before-wait")
  begin_scope_stale : ∀ (hooks : Hooks) (ctx : Ctx) (request : BeginRequest) (state : State),
    request.scope.value < state.nextIssue → (∀ entry ∈ state.scopes, entry.id ≠ request.scope) →
    (Step.signalWork hooks ctx (.begin request)).perform state = .error (.unsupported "interrupted-before-wait")
  occur_scope_stale : ∀ (hooks : Hooks) (ctx : Ctx) (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave)
    (writes : List (String × Value)) (rule : WriteRule) (state : State), scope.value < state.nextIssue →
    (∀ entry ∈ state.scopes, entry.id ≠ scope) →
    (Step.signalWork hooks ctx (.occur element scope leave writes rule)).perform state =
      .error (.unsupported "interrupted-before-wait")

/-- An input addressed to an occurrence no lookup finds is rejected (`Laws.Step`), what the lookups read
(`Laws.Step`, `Laws.Hooks`), and that the instance an occurrence belongs to is read from the scope tree and the
instance identity alone (`Laws.State`). -/
structure PendingLate : Prop where
  step_unknown : ∀ (hooks : Hooks) (program : Program) (state : State) (input : Input) (ref : OccurrenceRef),
    ((∃ data : CommandInput, input = .command data ∧ data.occurrence = ref) ∨
      (∃ data : TimerInput, input = .timerFire data ∧ data.occurrence = ref) ∨
      ∃ data : EffectInput, input = .effectResult data ∧ data.occurrence = ref) →
    (∀ (ctx : Ctx) (s : State), ctx.program = program → s.occurrences = state.occurrences →
      s.openItems = state.openItems → s.scopes = state.scopes → s.instanceId = state.instanceId →
      Step.occurrenceOf? ctx s ref = none ∧ ∀ {α : Type} (detail : WaitView → Option α), itemDetail? ctx s ref detail = none) →
    ∃ code, Step.step hooks program (some state) input = .error (.rejected code)
  occurrenceOf?_some : ∀ (ctx : Ctx) (state : State) (ref : OccurrenceRef) (occurrence : Occurrence),
    Step.occurrenceOf? ctx state ref = some occurrence →
    occurrence ∈ state.occurrences ∧ ctx.program.publicId occurrence.element = ref.element ∧
      occurrence.activation = ref.activation ∧ state.instanceOf occurrence.scope = ref.processInstanceId
  itemDetail?_some : ∀ {α : Type} (ctx : Ctx) (state : State) (ref : OccurrenceRef) (detail : WaitView → Option α)
    (item : OpenItem) (value : α), itemDetail? ctx state ref detail = some (item, value) →
    item ∈ state.openItems ∧ ctx.program.publicId item.element = ref.element ∧
      (state.occurrence? item.occurrence).map (·.activation) = some ref.activation ∧
      state.instanceOf item.scope = ref.processInstanceId
  instanceOf_congr : ∀ (s t : State), t.scopes = s.scopes → t.instanceId = s.instanceId → t.instanceOf = s.instanceOf

/-! ## Queued work naming a removed scope occurrence -/

/-- `QueuedWorkInert` holds vacuously: the micro-step never commits. Work that does something in a removed scope
occurrence (an arming, a begin, an `occur`) is stale (`PendingStale`), and work that acts from one (a write, a removal, a
compensation, a compensation's failure) is gone (`Laws.Step.write_scope_gone` and its siblings, #121); either fails the
micro-step's body, which a committed micro-step ran (`Laws.Step.microStep_ok`). -/
theorem queuedWorkInert {hooks : Hooks} (pending : PendingStale) : QueuedWorkInert hooks := by
  intro ctx state after next rest scope _ acts issued removed ran
  obtain ⟨_, _, body, _⟩ := Laws.Step.microStep_ok ran
  rw [Laws.Step.dispatchSignal_eq] at body
  generalize popped : ({ state with signals := rest } : State) = queue at body
  have absent : ∀ entry ∈ queue.scopes, entry.id ≠ scope := by
    subst popped
    exact fun entry member same => removed (List.mem_map.mpr ⟨entry, member, same⟩)
  replace issued : scope.value < queue.nextIssue := by subst popped; exact issued
  rcases acts with ⟨host, element, rfl⟩ | rfl | ⟨occurrence, gateway, rfl⟩ | ⟨request, rfl, rfl⟩ |
      ⟨writes, rule, rfl⟩ | ⟨names, rfl⟩ | ⟨element, leave, ⟨writes, rule, rfl⟩⟩ |
      ⟨activity, trigger, ⟨leave, resume, rfl⟩⟩ | ⟨code, message, origin, rfl⟩
  · rw [pending.arm_scope_stale hooks ctx host element _ queue issued absent] at body; cases body
  · rw [pending.armScope_stale hooks ctx _ queue issued absent] at body; cases body
  · rw [pending.armGateway_scope_stale hooks ctx occurrence gateway _ queue issued absent] at body; cases body
  · rw [pending.begin_scope_stale hooks ctx request queue issued absent] at body; cases body
  · rw [Laws.Step.write_scope_gone absent] at body; cases body
  · rw [Laws.Step.remove_scope_gone absent] at body; cases body
  · rw [pending.occur_scope_stale hooks ctx element _ leave writes rule queue issued absent] at body; cases body
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
(`PendingLate.step_unknown`). -/
theorem lateInputRejected {hooks : Hooks} (pending : PendingLate) : LateInputRejected hooks := by
  intro program input before ref formed addressed undesignated
  refine pending.step_unknown hooks program before input ref addressed
    fun ctx s program_ occurrences items scopes named => ?_
  have sameInstance : s.instanceOf = before.instanceOf := pending.instanceOf_congr before s scopes named
  subst program_
  refine ⟨?_, fun detail => ?_⟩
  · refine Option.eq_none_iff_forall_ne_some.mpr fun occurrence found => ?_
    obtain ⟨member, publicId, activation, instance_⟩ := pending.occurrenceOf?_some ctx s ref occurrence found
    exact undesignated occurrence (occurrences ▸ member) ⟨publicId, activation, sameInstance ▸ instance_⟩
  · refine Option.eq_none_iff_forall_ne_some.mpr fun pair found => ?_
    obtain ⟨member, publicId, activation, instance_⟩ := pending.itemDetail?_some ctx s ref detail pair.1 pair.2 found
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

end Kernel.Proofs.Cancellation
