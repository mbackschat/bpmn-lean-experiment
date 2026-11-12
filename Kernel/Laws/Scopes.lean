module

public import Kernel.Hooks
public import Kernel.Laws.State
import all Kernel.Feature.Scopes

/-! # Laws of Scopes

The rules of the [scopes semantics](../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#interpretation), independent
of `Kernel.Feature.Scopes`' and `Kernel.Step`'s code: a token reaching a Scope creates exactly one fresh scope
occurrence, owned by the arriving occurrence, holding exactly the inputs evaluated at that entry, so a re-entered Scope
reads no local of an earlier occurrence; each traversal's occurrence has an activation one greater than the previous;
a scope occurrence completes exactly when nothing remains in it, and its completion removes it and continues the parent
once, one token per outgoing flow; a command addressed to an occurrence that is no longer live is rejected; a Terminate
End clears its scope occurrence keeping only itself; and an interrupting Event Sub-Process start clears its parent
keeping only the handler, while a non-interrupting one leaves the parent's work running.

The laws take the evaluated inputs, the outgoing flows and the occurrences a clearing keeps as parameters, since
computing them is the IL's and `Kernel.Feature.Data`'s; clearing is `Kernel.Laws.State.ClearsInside`. Nothing
executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Scopes

open Kernel
open Kernel.Laws.State (ClearsInside)

/-! ## Entry -/

/-- A token reaching a Scope (`isScope`) as the occurrence `arriving` creates exactly one fresh scope occurrence owned by
it, a child of the arriving occurrence's scope occurrence, whose own variables are exactly `inputs` (`SUBPROC`,
`NSC-ENTER-01`, `SRE-INIT-01`). -/
def Enters (isScope : Bool) (arriving : Occurrence) (inputs : List (String × Value)) (before after : State) : Prop :=
  isScope = true → ∃ fresh ∈ after.scopes, (∀ old ∈ before.scopes, old.id ≠ fresh.id) ∧
    fresh.occurrence = some arriving.id ∧ fresh.parent = some arriving.scope ∧
    (∀ other ∈ after.scopes, other.occurrence = some arriving.id → other.id = fresh.id) ∧
    ∀ locals ∈ after.variables, locals.scope = fresh.id → locals.entries = inputs

/-- An element's next activation in an instance (`SRE-FRESH-01`): one greater than the count of its earlier
occurrences there, the first being 1, so no identity is reused. -/
def NextActivation (processInstance : String) (element : ElementId) (counts : List ActivationCount) (activation : Nat) : Prop :=
  (∀ counter ∈ counts, counter.processInstance = processInstance → counter.element = element → counter.role = .element →
    activation = counter.count + 1) ∧
  ((∀ counter ∈ counts, ¬ (counter.processInstance = processInstance ∧ counter.element = element ∧ counter.role = .element)) →
    activation = 1)

/-! ## Completion -/

/-- Nothing remains in `scope`: no token, no open item that keeps it alive, no begun occurrence, no child scope
occurrence and no parked join or held wait (`SUBPROC-QUIESCE-01`); a passive item, a dormant Event Sub-Process start,
keeps nothing alive. -/
def Idle (s : State) (scope : ScopeOccurrenceId) : Prop :=
  (∀ token ∈ s.tokens, token.busyScope ≠ scope) ∧
  (∀ item ∈ s.openItems, item.passive = false → item.scope ≠ scope) ∧
  (∀ occurrence ∈ s.occurrences, occurrence.begun = true → occurrence.scope ≠ scope) ∧
  (∀ child ∈ s.scopes, child.parent ≠ some scope) ∧
  (∀ join ∈ s.slots.parked, join.scope ≠ scope) ∧ ∀ wait ∈ s.slots.held, wait.scope ≠ scope

/-- A scope occurrence completes exactly when it is idle, whatever the declaration order and the other live occurrences
of its element. -/
def CompletesWhenIdle (s : State) (scope : ScopeOccurrenceId) (completes : Bool) : Prop :=
  completes = true ↔ Idle s scope

/-- An idle scope occurrence's completion removes it and continues its parent once: one token on each outgoing flow
in `parent`, every other token kept (`SCPH-EXIT-01`, `NSC-QUIESCE-01`). -/
def ContinuesOnce (scope parent : ScopeOccurrenceId) (outgoing : List FlowId) (before after : State) : Prop :=
  Idle before scope →
    (∀ left ∈ after.scopes, left.id ≠ scope) ∧
    ∃ kept, after.tokens = kept ++ outgoing.map (Token.flow · parent) ∧ ∀ token ∈ kept, token ∈ before.tokens

/-- A command addressed to an occurrence that is no longer live (`live = false`), a completed Scope's or an earlier
iteration's, is rejected (`SUBPROC-REFUSE-01`, `SRE-STALE-01`). -/
def StaleRejected (live : Bool) (result : Except Failure State) : Prop :=
  live = false → ∃ code, result = .error (.rejected code)

/-! ## Terminate and Event Sub-Processes -/

/-- A Terminate End (`terminates`) arriving in `scope` as occurrence `own` clears the scope occurrence, keeping it and
only its own occurrence (`TEND-REGION-01`, §13.5.6). -/
def TerminateClears (terminates : Bool) (scope : ScopeOccurrenceId) (own : Nat) (before after : State) : Prop :=
  terminates = true → ClearsInside before after scope [own]

/-- An interrupting Event Sub-Process start (`interrupting`) clears its parent scope occurrence, keeping only the
handler's occurrence and its start's reservation (`kept`) (§13.5.4, IMESP). -/
def InterruptingStart (interrupting : Bool) (parent : ScopeOccurrenceId) (kept : List Nat) (before after : State) :
    Prop :=
  interrupting = true → ClearsInside before after parent kept

/-- A non-interrupting one leaves every occurrence and open item of its parent running. -/
def NonInterruptingStart (interrupting : Bool) (before after : State) : Prop :=
  interrupting = false →
    (∀ occurrence ∈ before.occurrences, occurrence ∈ after.occurrences) ∧ ∀ item ∈ before.openItems, item ∈ after.openItems

/-! ## Non-vacuity

The states of `Kernel.Laws.State`: the root scope 0 holds the Sub-Process occurrence 1, whose scope occurrence 2 holds
the waiting occurrence 3. -/

open Kernel.Laws.State (processRoot subScope subProcess innerTask outerTask innerItem outerItem rootScope childScope
  sample cleared sample_clears survivor_rejected terminating terminated terminate_clears)

def entering : State := { instanceId := "p", scopes := [rootScope], occurrences := [subProcess] }

def entered : State :=
  { entering with
    scopes := [rootScope, childScope]
    variables := [{ scope := subScope, entries := [("x", .int 1)] }] }

theorem enters_fresh : Enters true subProcess [("x", .int 1)] entering entered := fun _ =>
  ⟨childScope, by simp [entered], by simp [entering, rootScope, childScope, processRoot, subScope],
    rfl, rfl, by simp [entered, rootScope, childScope, subProcess], by simp [entered, childScope]⟩

def staleLocals : ScopeVariables := { scope := subScope, entries := [("x", .int 1), ("old", .int 2)] }

/-- A re-entered Scope that still holds a local of an earlier occurrence is rejected. -/
theorem stale_local_rejected :
    ¬ Enters true subProcess [("x", .int 1)] entering { entered with variables := [staleLocals] } := fun law => by
  obtain ⟨fresh, mem, rest⟩ := law rfl
  obtain ⟨_, owned, more⟩ := rest
  obtain ⟨_, _, inputs⟩ := more
  simp [entered, entering] at mem
  rcases mem with rfl | rfl
  · simp [rootScope, subProcess] at owned
  · have := inputs staleLocals (by simp) (by simp [staleLocals, childScope])
    simp [staleLocals] at this

def firstCount : ActivationCount := { processInstance := "p", element := ⟨"Sub"⟩, role := .element, count := 1 }

def counts : List ActivationCount := [firstCount]

theorem second_traversal : NextActivation "p" ⟨"Sub"⟩ counts 2 :=
  ⟨by simp [counts, firstCount], fun none => absurd ⟨rfl, rfl, rfl⟩ (none firstCount (by simp [counts]))⟩

/-- Reusing the first traversal's activation is rejected. -/
theorem reused_activation_rejected : ¬ NextActivation "p" ⟨"Sub"⟩ counts 1 := fun law => by
  have := law.1 firstCount (by simp [counts]) rfl rfl rfl
  simp [firstCount] at this

theorem first_traversal : NextActivation "p" ⟨"Sub"⟩ [] 1 := ⟨by simp, fun _ => rfl⟩

theorem cleared_idle (kind : OpenKind) : Idle (cleared kind) subScope := by
  simp [Idle, cleared, sample, outerTask, subProcess, outerItem, rootScope, childScope, processRoot, subScope]

/-- Completing a scope occurrence whose task still waits is rejected. -/
theorem busy_completes_rejected (kind : OpenKind) : ¬ CompletesWhenIdle (sample kind) subScope true := fun law =>
  ((law.1 rfl).2.1 (innerItem kind) (by simp [sample]) rfl) rfl

theorem idle_completes (kind : OpenKind) : CompletesWhenIdle (cleared kind) subScope true :=
  ⟨fun _ => cleared_idle kind, fun _ => rfl⟩

def outFlow : FlowId := ⟨"AfterSub"⟩

def continued (kind : OpenKind) : State :=
  { cleared kind with scopes := [rootScope], tokens := [Token.flow outFlow processRoot] }

theorem continues_once (kind : OpenKind) : ContinuesOnce subScope processRoot [outFlow] (cleared kind) (continued kind) :=
  fun _ => ⟨by simp [continued, rootScope, processRoot, subScope], [], rfl, by simp⟩

/-- Keeping the completed scope occurrence is rejected. -/
theorem keeps_completed_rejected (kind : OpenKind) :
    ¬ ContinuesOnce subScope processRoot [outFlow] (cleared kind) { continued kind with scopes := [rootScope, childScope] } :=
  fun law => (law (cleared_idle kind)).1 childScope (by simp) rfl

/-- Continuing the parent twice is rejected. -/
theorem continues_twice_rejected (kind : OpenKind) :
    ¬ ContinuesOnce subScope processRoot [outFlow] (cleared kind)
      { continued kind with tokens := [Token.flow outFlow processRoot, Token.flow outFlow processRoot] } := fun law => by
  obtain ⟨kept, split, keptOld⟩ := (law (cleared_idle kind)).2
  cases kept
  · simp at split
  · rename_i token _
    exact absurd (keptOld token (by simp)) (by simp [cleared, sample])

theorem stale_rejected : StaleRejected false (.error (.rejected "unknown-user-task")) := fun _ => ⟨_, rfl⟩

/-- Applying a command to a completed occurrence is rejected. -/
theorem stale_applied_rejected (kind : OpenKind) : ¬ StaleRejected false (.ok (continued kind)) := fun law => by
  obtain ⟨_, same⟩ := law rfl
  simp at same

theorem terminate_witness (kind : OpenKind) : TerminateClears true subScope 8 (terminating kind) (terminated kind) :=
  fun _ => terminate_clears kind

theorem interrupting_witness (kind : OpenKind) : InterruptingStart true subScope [] (sample kind) (cleared kind) :=
  fun _ => sample_clears kind

/-- An interrupting start that leaves the parent's waiting task is rejected. -/
theorem interrupting_survivor_rejected (kind : OpenKind) :
    ¬ InterruptingStart true subScope [] (sample kind) (sample kind) :=
  fun law => survivor_rejected kind (law rfl)

theorem non_interrupting_keeps (kind : OpenKind) : NonInterruptingStart false (sample kind) (sample kind) := fun _ =>
  ⟨fun _ mem => mem, fun _ mem => mem⟩

/-- A non-interrupting start that cancels the parent's waiting task is rejected. -/
theorem non_interrupting_cancels_rejected (kind : OpenKind) :
    ¬ NonInterruptingStart false (sample kind) (cleared kind) := fun law => by
  have := (law rfl).1 innerTask (by simp [sample])
  simp [cleared, innerTask, subProcess, outerTask] at this

end Kernel.Laws.Scopes
