module

public import Kernel.Laws.Step
public import Kernel.Laws.Scopes

/-! # Proofs: cancellation (P3)

The statements of the proof wave's cancellation lane ([PLAN, P3](../../docs/PLAN.md#proof-wave)), from a
`Laws.State.WellFormed` before-state: subtree removal leaves no token, open item, occurrence or variable of the removed
subtree; an input addressed to a removed occurrence is rejected without effect; queued work naming a removed scope
occurrence has no effect; every owning feature is notified once. Each is stated over a hooks parameter and closes when
`Kernel.Proofs.Step` proves it of `Registry.hooks`. No model premise is needed: removal is generic (`State.clearInside`,
`State.cancelOccurrence`) and reads no IL. `Laws.State.ClearsInside` and `Laws.Scopes`' clearing laws are the
micro-step contracts the lane proves these from.

A proof here composes `Laws.Step`'s, `Laws.Hooks`' and `Laws.State`'s lemmas and opens no body. A `Step` fact it needs
that no `Laws` module states yet is an explicit premise named as a pending lemma request (`PendingStale`), never a
model or state premise of the lane statement; the root replaces it with the lemma once that lands. Nothing executable
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
    WellFormed before → Step.step hooks program (some before) input = .ok after →
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
    WellFormed before → AddressedTo input ref → (∀ occurrence ∈ before.occurrences, ¬ Designates program before ref occurrence) →
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
    WellFormed before → Step.step hooks program (some before) input = .ok after →
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

end Kernel.Proofs.Cancellation
