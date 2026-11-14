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

[#121](https://github.com/mbackschat/bpmn-lean-experiment/issues/121) falsifies `QueuedWorkInert` today: a queued
`Signal.write` to a removed scope occurrence reaches the instance root (P1). Nothing executable imports this module.
-/

public section

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

/-- Nothing but the journal changed. -/
structure Inert (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  variables : after.variables = before.variables
  signals : after.signals = before.signals
  slots : after.slots = before.slots
  nextIssue : after.nextIssue = before.nextIssue
  status : after.status = before.status

/-- Queued work naming a scope occurrence that was issued and has since been removed has no effect: the closure
micro-step that runs it either fails the input or changes nothing but the journal (`Kernel/Step/Stale.lean`). It is
stated of any closure state, since the closure breaks `WellFormed` exactly here. -/
def QueuedWorkInert (hooks : Hooks) : Prop :=
  ∀ (ctx : Ctx) (state after : State) (next : Signal) (rest : List Signal) (scope : ScopeOccurrenceId),
    state.signals = next :: rest → ActsIn next scope → scope.value < state.nextIssue → scope ∉ scopeIds state →
    Step.microStep hooks ctx (.signal (Step.signalName next)) none State.root (Step.dispatchSignal hooks ctx next)
      { state with signals := rest } = .ok after →
    Inert { state with signals := rest } after

/-- Every begun occurrence a committed input removes ends exactly once in the input's journal, which is when `Step`
hands a cancelled one to `Hooks.cancelled`, the owning features' notice: the journal's cancelled facts and the
notices are made together (`State.clearInside`, `State.cancelOccurrence`). -/
def RemovedEndOnce (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (before after : State) (occurrence : Occurrence),
    WellFormed before → Step.step hooks program (some before) input = .ok after →
    occurrence ∈ before.occurrences → occurrence.begun = true → occurrence.id ∉ occurrenceIds after →
    ∃ earlier terminal later, after.journal.flatMap (·.ended) = earlier ++ (before.keyOf occurrence, terminal) :: later ∧
      ∀ fact ∈ earlier ++ later, fact.1 ≠ before.keyOf occurrence

end Kernel.Proofs.Cancellation
