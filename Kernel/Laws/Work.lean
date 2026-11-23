module

public import Kernel.Hooks
public import Kernel.Feature.Work
public import Kernel.Laws.Flow.Sources
import Kernel.Laws.Step.Elements
import Kernel.Laws.State.Called
import all Kernel.Feature.Work
import all Kernel.Feature.Work.Call

/-! # Laws of Work

The rules of the [work semantics](../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#service-tasks-and-effects) and the
[script semantics](../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#selected-contract), independent of
`Kernel.Feature.Work`'s code: a Script Task's arguments are every visible variable once, its nearest owner's, nearest
owner first; its result patch is empty or names its result variable once, anything else rejected; an `unsupported`
effect result ends the input as `unsupported` with the host's code; a technical failure is `unsupported` unless the
profile opens incidents, and then the next incident generation; a retry naming another generation than the open
incident's is stale; and a business failure carries outputs only where the profile maps them on the error path.

The laws take the profile's choices as Booleans and name no profile or work constructor: each states one rule, and the
caller supplies the case. Where the Script result is written is `Kernel.Laws.Data`'s nearest-owner write, and a
snapshot entry's value is what that module's `Reads` gives for its name. Nothing executable imports this module.

Each law is followed by its non-vacuity witness: values that satisfy it and, where the law could otherwise hold of
everything, values that violate it.
-/

@[expose] public section

namespace Kernel.Laws.Work

open Kernel

/-! ## Script Tasks -/

/-- A Script Task's arguments over the bindings visible from its scope occurrence, innermost first (item 3): one entry
per visible name, in the order the names are first visible, each the first visible binding of its name. -/
def Snapshot (visible snapshot : List (String × Value)) : Prop :=
  snapshot.map (·.1) = (visible.map (·.1)).eraseDups ∧ ∀ entry ∈ snapshot, visible.find? (·.1 == entry.1) = some entry

/-- A Script Task's result patch (item 5 and the patch rule after it): the empty patch writes nothing, the one-entry
patch on the result variable is accepted, a name given twice is `duplicate-output`, and among distinct names one that
is not the result variable is `undeclared-output`. -/
def ScriptPatch (resultVariable : Option String) (patch : List (String × Value))
    (outcome : Except Failure (List (String × Value))) : Prop :=
  (patch = [] → outcome = .ok []) ∧
  (∀ name value, resultVariable = some name → patch = [(name, value)] → outcome = .ok [(name, value)]) ∧
  (¬ (patch.map (·.1)).Nodup → outcome = .error (.rejected "duplicate-output")) ∧
  ((patch.map (·.1)).Nodup → (∃ entry ∈ patch, resultVariable ≠ some entry.1) →
    outcome = .error (.rejected "undeclared-output"))

/-! ## Effect results -/

/-- An `unsupported` effect result ends the input as `unsupported` with the host's code, for every effect kind and
under every profile: a value or behavior the portable domain cannot represent is never a technical failure. -/
def UnsupportedResult {α : Type} (code : String) (outcome : Except Failure α) : Prop :=
  outcome = .error (.unsupported code)

/-- A technical failure (§13.3.3 defines only a fault): `unsupported` without incidents, else the incident of the next
generation, one more than the effect's failures so far (CIB-EXT-0013). -/
def TechnicalFailure (incidents : Bool) (failures : Nat) (generation : Except Failure Nat) : Prop :=
  (incidents = false → generation = .error (.unsupported "effect-technical-failure")) ∧
  (incidents = true → generation = .ok (failures + 1))

/-- A retry reopens the effect only when it names the open incident's generation; any other is stale, so a command
never resolves an incident its issuer did not observe. -/
def Retry (open_ named : Nat) (outcome : Except Failure Unit) : Prop :=
  (named = open_ → outcome = .ok ()) ∧ (named ≠ open_ → outcome = .error (.rejected "incident-generation-stale"))

/-- A business failure writes no outputs (§13.3.2) unless the profile maps them on the error path (`mapped`), so a
non-empty patch without that mapping is rejected. -/
def ErrorPathPatch (mapped : Bool) (patch : List (String × Value)) (outcome : Except Failure Unit) : Prop :=
  mapped = false → patch ≠ [] → outcome = .error (.rejected "error-path-outputs-not-accepted")

/-! ## Non-vacuity -/

/-- The witness of `script-effect.test.ts`: the Sub-Process's `b` shadows the root's. -/
theorem snapshot_nearest_first :
    Snapshot [("b", .string "inner"), ("a", .int 1), ("b", .string "outer")]
      [("b", .string "inner"), ("a", .int 1)] := by
  refine ⟨by decide +kernel, fun entry member => ?_⟩
  simp only [List.mem_cons, List.not_mem_nil, or_false] at member
  rcases member with rfl | rfl <;> simp [List.find?]

/-- The shadowed value is rejected. -/
theorem snapshot_shadowed_rejected :
    ¬ Snapshot [("b", .string "inner"), ("a", .int 1), ("b", .string "outer")]
      [("b", .string "outer"), ("a", .int 1)] :=
  fun ⟨_, values⟩ => by simpa [List.find?] using values ("b", .string "outer") (by simp)

/-- A name given twice is rejected. -/
theorem snapshot_repeated_rejected : ¬ Snapshot [("a", .int 1)] [("a", .int 1), ("a", .int 1)] :=
  fun ⟨names, _⟩ => absurd names (by decide +kernel)

theorem patch_result : ScriptPatch (some "total") [("total", .int 2)] (.ok [("total", .int 2)]) :=
  ⟨nofun, fun _ _ _ same => by simp at same; simp [same], fun distinct => by simp at distinct,
    fun _ ⟨_, member, differs⟩ => by simp at member; simp [member] at differs⟩

theorem patch_empty : ScriptPatch none [] (.ok []) :=
  ⟨fun _ => rfl, fun _ _ _ => nofun, fun distinct => by simp at distinct, fun _ ⟨_, member, _⟩ => by simp at member⟩

/-- Writing a name without a result variable is rejected. -/
theorem patch_without_result_rejected : ¬ ScriptPatch none [("total", .int 2)] (.ok [("total", .int 2)]) :=
  fun law => by simpa using law.2.2.2 (by simp) ⟨("total", .int 2), by simp, by simp⟩

/-- Keeping the first of a twice-given result variable is rejected. -/
theorem patch_twice_rejected :
    ¬ ScriptPatch (some "total") [("total", .int 1), ("total", .int 2)] (.ok [("total", .int 1)]) :=
  fun law => by simpa using law.2.2.1 (by simp)

theorem unsupported_result :
    UnsupportedResult "result-outside-domain" (.error (.unsupported "result-outside-domain") : Except Failure Unit) :=
  rfl

/-- Turning an unsupported result into a technical failure's answer is rejected. -/
theorem unsupported_as_failure_rejected :
    ¬ UnsupportedResult "result-outside-domain"
      (.error (.unsupported "effect-technical-failure") : Except Failure Unit) := by
  simp [UnsupportedResult]

theorem failure_without_incidents : TechnicalFailure false 0 (.error (.unsupported "effect-technical-failure")) :=
  ⟨fun _ => rfl, nofun⟩

theorem failure_next_generation : TechnicalFailure true 1 (.ok 2) := ⟨nofun, fun _ => rfl⟩

/-- Reopening the generation already failed is rejected. -/
theorem failure_same_generation_rejected : ¬ TechnicalFailure true 1 (.ok 1) := fun law => by
  simpa using law.2 rfl

theorem retry_fresh : Retry 2 2 (.ok ()) := ⟨fun _ => rfl, fun differs => absurd rfl differs⟩

theorem retry_stale : Retry 2 1 (.error (.rejected "incident-generation-stale")) := ⟨nofun, fun _ => rfl⟩

/-- Retrying a stale generation is rejected. -/
theorem retry_stale_rejected : ¬ Retry 2 1 (.ok ()) := fun law => by simpa using law.2 (by decide +kernel)

theorem error_path_refused :
    ErrorPathPatch false [("x", .int 1)] (.error (.rejected "error-path-outputs-not-accepted")) :=
  fun _ _ => rfl

/-- Accepting an unmapped error path's outputs is rejected. -/
theorem error_path_accepted_rejected : ¬ ErrorPathPatch false [("x", .int 1)] (.ok ()) := fun law => by
  simpa using law rfl (by simp)

/-! ## Preservation

What Work's completion and incident hooks keep of an invariant: a submission and an effect's result queue writes and the
completion of the occurrence their item waits for, or raise its business error; a technical failure under an incident
profile and a retry change only what the item waits for; cancelling an incident's process queues the instance's
cancelled end. -/

/-- What Work's completion and incident hooks need of the state operations they apply, for an invariant `inv` of an
instance that runs `program`. -/
structure WorkOps (program : Program) (inv : State → Prop) : Prop where
  write : ∀ state scope writes rule, inv state → inv (state.signal (.write scope writes rule))
  /-- The completion of the occurrence an open item of an element the program declares no start Event waits for. -/
  complete : ∀ state item leave writes rule, inv state → item ∈ itemList state.openItems →
    (program.element? item.element).bind (·.start?) = none → (∀ selected, leave = .flows selected → selected = []) →
    inv (state.signal (.complete item.id.occurrence leave writes rule))
  /-- The completion of the occurrence that owns a scope occurrence. -/
  completeOwner : ∀ state scope occurrence leave writes rule, inv state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    (∀ selected, leave = .flows selected → selected = []) → inv (state.signal (.complete occurrence.id leave writes rule))
  /-- A business Error raised from the occurrence an effect item waits for, in the item's scope occurrence and at its
  occurrence's activation. -/
  raise : ∀ state item code message patch, inv state → item ∈ itemList state.openItems → item.kind.view.effect.isSome = true →
    inv (state.signal (.raise (.error code message)
      { element := item.element, scope := item.scope, thrower := item.id.occurrence, host := some item.id.occurrence,
        patch := patch,
        activation := ((state.occurrence? item.id.occurrence).map (·.activation)).getD 0 }))
  cancel : ∀ state, inv state → inv (state.signal (.endInstance .cancelled none))
  /-- What open items wait for replaced, each keeping everything else, only for an item that waits for an effect or an
  incident. -/
  rekind : ∀ state (change : OpenItem → OpenItem), inv state →
    (∀ item, change item = { item with kind := (change item).kind }) →
    (∀ item ∈ itemList state.openItems, change item ≠ item →
      item.kind.view.effect.isSome = true ∨ item.kind.view.incident.isSome = true) →
    inv { state with openItems := state.openItems.map fun _ item => change item }
  /-- An item that waits for an effect or an incident, or of an Activity, is no start Event's; open items differ in
  identity. -/
  workKind : ∀ state item, inv state → item ∈ itemList state.openItems →
    (item.kind.view.effect.isSome = true ∨ item.kind.view.incident.isSome = true) →
    (program.element? item.element).bind (·.start?) = none
  activity : ∀ element header payload, (program.element? element).bind (·.activity?) = some (header, payload) →
    (program.element? element).bind (·.start?) = none
  distinct : ∀ state, inv state → ∀ item ∈ itemList state.openItems, ∀ other ∈ itemList state.openItems, item.id = other.id → item = other
  /-- Queuing a signal keeps the open items. -/
  queued : ∀ (state : State) signal, (state.signal signal).openItems = state.openItems
  /-- Queuing a signal keeps the occurrences and the scope occurrences. -/
  kept : ∀ (state : State) signal,
    (state.signal signal).occurrences = state.occurrences ∧ (state.signal signal).scopes = state.scopes
  /-- The completion of a begun occurrence. -/
  completeBegun : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → (∀ selected, leave = .flows selected → selected = []) →
    inv (state.signal (.complete occurrence.id leave writes rule))
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    ∃ entry ∈ state.scopes, entry.id = occurrence.scope
  hold : ∀ state held, inv state → inv (state.hold held)
  /-- An Activity's own scope occurrence, of its element, entered below its occurrence's, which owns it; it is no
  called root. -/
  enter : ∀ state element locals occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    element = occurrence.element →
    inv (state.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      (state.enterScope element occurrence.scope locals (some occurrence.id)).1.occurrences = state.occurrences ∧
      ∀ root ∈ (state.enterScope element occurrence.scope locals (some occurrence.id)).1.scopes,
        root.calledInstance.isSome → root ∈ state.scopes
  /-- An item for a begun occurrence of an element the program declares no start Event, numbered under its element's
  counter. -/
  openItem : ∀ state kind occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    (program.element? occurrence.element).bind (·.start?) = none → occurrence.role = .element →
    inv (state.openItem kind occurrence) ∧ (state.openItem kind occurrence).occurrences = state.occurrences
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    element = occurrence.element → inv (state.signal (.arm occurrence.id element occurrence.scope))
  /-- A begun Call's called root, entered below its scope occurrence under the instance's program, for a Call of an
  Activity the program declares, numbered under its element's counter, that owns no called root yet, as `Step.begin`
  has just begun it. -/
  enterCalled : ∀ state call variables definition, inv state → call ∈ state.occurrences → call.begun = true →
    call.role = .element → ((program.element? call.element).bind (·.activity?)).isSome →
    (∀ root ∈ state.scopes, root.calledInstance.isSome → root.occurrence ≠ some call.id) →
    inv (state.enterCalled program call variables definition).1 ∧
      (state.enterCalled program call variables definition).1.occurrences = state.occurrences ∧
      ∃ entry ∈ (state.enterCalled program call variables definition).1.scopes,
        entry.id = (state.enterCalled program call variables definition).2
  armScope : ∀ state scope, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    inv (state.signal (.armScope scope))
  /-- A begin that names no reservation, of a top-level element of the process the called root it begins in runs. -/
  begin : ∀ state element scope, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    Laws.Flow.CalledAnchor program state element scope →
    inv (state.signal (.begin { element, scope }))

/-- `reopen` replaces only what an open item that waits for an effect or an incident waits for. -/
theorem reopen_keeps {inv : State → Prop} (ops : WorkOps program inv) {state : State} (holds : inv state)
    {item : OpenItem} (member : item ∈ itemList state.openItems)
    (waits : item.kind.view.effect.isSome = true ∨ item.kind.view.incident.isSome = true)
    (kind : OpenKind) : inv (Feature.Work.reopen state item.id kind) :=
  ops.rekind state _ holds (fun item => by split <;> rfl) fun other inside changed => by
    split at changed
    · rename_i same
      rw [ops.distinct state holds other inside item member (beq_iff_eq.mp same)]
      exact waits
    · exact absurd rfl changed

/-- A completion of the item's occurrence after a write. -/
theorem installed_keeps {inv : State → Prop} (ops : WorkOps program inv) {state : State} {item : OpenItem}
    (holds : inv state) (member : item ∈ itemList state.openItems) (unstarted : (program.element? item.element).bind (·.start?) = none)
    (scope : ScopeOccurrenceId) (values writes : List (String × Value)) (rule : WriteRule) (leave : Leave)
    (completion : WriteRule) (unnamed : ∀ selected, leave = .flows selected → selected = []) :
    inv ((state.signal (.write scope values rule)).signal (.complete item.id.occurrence leave writes completion)) :=
  ops.complete _ _ _ _ _ (ops.write _ _ _ _ holds) (Laws.State.items_same member (ops.queued _ _).symm) unstarted unnamed

/-- `Hooks.completeUserTask` keeps `inv` for an open item. -/
theorem completeUserTask_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {header : Header}
    {payload : ActivityPayload} {item : OpenItem} {values : List (String × Value)} {state after : State}
    (holds : inv state) (member : item ∈ itemList state.openItems)
    (activity : (program.element? item.element).bind (·.activity?) = some (header, payload))
    (ran : Feature.Work.completeUserTask ctx header payload item values state = .ok after) : inv after := by
  have unstarted := ops.activity _ _ _ activity
  unfold Feature.Work.completeUserTask at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact installed_keeps ops holds member unstarted _ _ _ _ _ _ fun _ same => by cases same
    | exact ops.complete _ _ _ _ _ holds member unstarted fun _ same => by cases same

/-- `Hooks.effectResult` keeps `inv` for an open item. -/
theorem effectResult_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {item : OpenItem}
    {outcome : EffectOutcome} {state after : State} (holds : inv state) (member : item ∈ itemList state.openItems)
    (effect : item.kind.view.effect.isSome = true)
    (ran : Feature.Work.effectResult ctx item outcome state = .ok after) : inv after := by
  have unstarted := ops.workKind _ _ holds member (.inl effect)
  unfold Feature.Work.effectResult Feature.Work.effectCompletion at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact installed_keeps ops holds member unstarted _ _ _ _ _ _ fun _ same => by cases same
    | exact ops.complete _ _ _ _ _ holds member unstarted fun _ same => by cases same
    | exact ops.raise _ _ _ _ _ holds member effect
    | exact reopen_keeps ops holds member (.inl effect) _

/-- `Hooks.retryIncident` keeps `inv`. -/
theorem retryIncident_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {item : OpenItem}
    {incident : IncidentDetail} {generation : Nat} {state after : State} (holds : inv state)
    (member : item ∈ itemList state.openItems) (waits : item.kind.view.incident = some incident)
    (ran : Feature.Work.retryIncident ctx item incident generation state = .ok after) : inv after := by
  unfold Feature.Work.retryIncident Feature.Work.staleIncident at ran
  split at ran
  · cases ran
  · split at ran
    · cases ran
      exact reopen_keeps ops holds member (.inr (by rw [waits]; rfl)) _
    · cases ran
    · cases ran

/-- A Timer's incident, which no feature opens before the job model's stage (AD8), is refused when retried: the shape is
carried, its retry is not chosen. -/
theorem retryIncident_timer (ctx : Ctx) (item : OpenItem) (timer : TimerDetail) (generation : Nat) (cancellable : Bool)
    (state : State) :
    Feature.Work.retryIncident ctx item { subject := .job (.timer timer), generation, cancellable } generation state =
      .error (.unsupported "timer-incident-retry") := by
  simp [Feature.Work.retryIncident]

/-- `Hooks.cancelIncidentProcess` keeps `inv`. -/
theorem cancelIncidentProcess_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {incident : IncidentDetail}
    {generation : Nat} {state after : State} (holds : inv state)
    (ran : Feature.Work.cancelIncidentProcess ctx incident generation state = .ok after) : inv after := by
  unfold Feature.Work.cancelIncidentProcess Feature.Work.staleIncident at ran
  repeat' split at ran
  all_goals cases ran
  exact ops.cancel _ holds

/-- A raising Activity's Error-path leave (`Feature.Work.mappedErrorOutputs`) writes through `write`, outward only, and
then queues the Activity's raised completion: whatever those keep, it keeps. -/
theorem mappedErrorOutputs_keeps {motive : State → Prop}
    {write : Ctx → ScopeOccurrenceId → List (String × Value) → WriteRule → State → Outcome} {ctx : Ctx} {origin : Origin}
    {installed : List (String × Value)} {state after : State}
    (writes : ∀ scope values state after, motive state → write ctx scope values .outward state = .ok after → motive after)
    (complete : ∀ state host, origin.host = some host → motive state →
      motive (state.signal (.complete host .raised [] .outward)))
    (holds : motive state) (ran : Feature.Work.mappedErrorOutputs write ctx origin installed state = .ok after) :
    motive after := by
  unfold Feature.Work.mappedErrorOutputs at ran
  cases hosted : origin.host with
  | none => simp [hosted] at ran
  | some host =>
    simp only [hosted, bind, Except.bind] at ran
    repeat' split at ran
    all_goals first | (simp at ran; done) | cases ran
    all_goals first | exact complete _ _ hosted (writes _ _ _ _ holds ‹_›) |
      exact complete _ _ hosted (writes _ _ _ _ (writes _ _ _ _ holds ‹_›) ‹_›)

/-- `Hooks.triggerActivity` keeps `inv` for an open item: a delivery completes the Receive Task its item waits for. -/
theorem triggerActivity_keeps {inv : State → Prop} (ops : WorkOps program inv) {hooks : Feature.Work.WorkHooks} {ctx : Ctx}
    {header : Header} {payload : ActivityPayload} {item : OpenItem} {fired : Fired} {state after : State}
    (holds : inv state) (member : item ∈ itemList state.openItems)
    (activity : (program.element? item.element).bind (·.activity?) = some (header, payload))
    (ran : Feature.Work.triggerActivity hooks ctx header payload item fired state = .ok after) : inv after := by
  unfold Feature.Work.triggerActivity at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals exact ops.complete _ _ _ _ _ holds member (ops.activity _ _ _ activity) fun _ same => by cases same

/-- `Hooks.completeCall` keeps `inv`: a called instance's end completes the Call that owns its root. -/
theorem completeCall_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {header : Header}
    {payload : ActivityPayload} {root : ScopeOccurrence} {owner : Occurrence} {state after : State} (holds : inv state)
    (member : root ∈ state.scopes) (owned : owner ∈ state.occurrences) (link : root.occurrence = some owner.id)
    (ran : Feature.Work.completeCall ctx header payload root owner state = .ok after) : inv after := by
  unfold Feature.Work.completeCall at ran
  split at ran
  · unfold Feature.Work.Call.returnFromCall at ran
    simp only [bind, Except.bind] at ran
    split at ran
    · cases ran
    · cases ran
      exact ops.completeOwner _ _ _ _ _ _ holds member owned link fun _ same => by cases same
  all_goals cases ran

/-- An Activity's inputs, entered as its own scope occurrence, keep `inv` and its begun occurrence, and add no called
root. -/
theorem enterLocal_keeps {inv : State → Prop} (ops : WorkOps program inv) {header : Header} {inputs : List (String × Value)}
    {occurrence : Occurrence} {state : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (begun : occurrence.begun = true) (named : header.id = occurrence.element) :
    inv (Feature.Work.enterLocal header inputs occurrence state) ∧
      occurrence ∈ (Feature.Work.enterLocal header inputs occurrence state).occurrences ∧
      ∀ root ∈ (Feature.Work.enterLocal header inputs occurrence state).scopes, root.calledInstance.isSome →
        root ∈ state.scopes := by
  unfold Feature.Work.enterLocal
  split
  · exact ⟨holds, member, fun _ inside _ => inside⟩
  · obtain ⟨entered, same, called⟩ := ops.enter state header.id inputs occurrence holds member begun named
    exact ⟨entered, same ▸ member, called⟩

/-- Opening a begun occurrence's work item, arming its boundaries or not, keeps `inv`. -/
theorem openWork_keeps {inv : State → Prop} (ops : WorkOps program inv) {kind : OpenKind} {header : Header}
    {payload : ActivityPayload} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (named : header.id = occurrence.element) : inv (Feature.Work.openWork kind header payload occurrence state) := by
  obtain ⟨opened, same⟩ := ops.openItem state kind occurrence holds member begun unstarted role
  unfold Feature.Work.openWork
  split
  · exact opened
  · exact ops.arm _ _ _ opened (same ▸ member) begun named

/-- A decision task's result write and completion keep `inv`. -/
theorem evaluateDecision_keeps {inv : State → Prop} (ops : WorkOps program inv) {hooks : Feature.Work.WorkHooks} {ctx : Ctx}
    {payload : ActivityPayload} {work : RuleWork} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (ran : Feature.Work.evaluateDecision hooks ctx payload work occurrence state = .ok after) : inv after := by
  unfold Feature.Work.evaluateDecision at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact ops.completeBegun _ _ _ _ _ holds member begun fun _ same => by cases same
    | exact ops.completeBegun _ _ _ _ _ (ops.write _ _ _ _ holds) (by rw [(ops.kept _ _).1]; exact member) begun fun _ same => by cases same

/-- A begun Call entering its called root, then arming its boundaries or not, its root's Event Sub-Processes and its
none start keeps `inv`. -/
theorem called_keeps {inv : State → Prop} (ops : WorkOps program inv) {occurrence : Occurrence} {state : State}
    (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (role : occurrence.role = .element) (isActivity : ((program.element? occurrence.element).bind (·.activity?)).isSome)
    (unowned : ∀ root ∈ state.scopes, root.calledInstance.isSome → root.occurrence ≠ some occurrence.id)
    (variables : List (String × Value)) (process : CalledProcess) (listed : process ∈ program.processes)
    (start : ElementId) (top : ∃ child ∈ program.processChildren process, child.header.id = start)
    (armed : State → State)
    (arming : ∀ current, inv current → occurrence ∈ current.occurrences →
      inv (armed current) ∧ (armed current).scopes = current.scopes ∧
        (armed current).slots.instances = current.slots.instances) :
    inv (((armed (state.enterCalled program occurrence variables process.definition).1).signal
      (.armScope (state.enterCalled program occurrence variables process.definition).2)).signal
        (.begin { element := start, scope := (state.enterCalled program occurrence variables process.definition).2 })) := by
  obtain ⟨entered, same, root⟩ :=
    ops.enterCalled state occurrence variables process.definition holds member begun role isActivity unowned
  obtain ⟨armedHolds, armedScopes, armedInstances⟩ := arming _ entered (by rw [same]; exact member)
  have anchored : Laws.Flow.CalledAnchor program
      ((armed (state.enterCalled program occurrence variables process.definition).1).signal
        (.armScope (state.enterCalled program occurrence variables process.definition).2)) start
      (state.enterCalled program occurrence variables process.definition).2 := by
    obtain ⟨⟨entry, inside, named, called⟩, recorded⟩ :=
      Laws.State.enterCalled_root state program occurrence variables process.definition
    obtain ⟨child, child_inside, child_named⟩ := top
    rw [Laws.State.signal_eq]
    exact ⟨⟨entry, armedScopes ▸ inside, named, called⟩, _, armedInstances ▸ recorded, rfl, process, listed, rfl, child,
      child_inside, child_named⟩
  have stands : ∃ entry ∈ (armed (state.enterCalled program occurrence variables process.definition).1).scopes,
      entry.id = (state.enterCalled program occurrence variables process.definition).2 := by
    rw [armedScopes]
    exact root
  exact ops.begin _ _ _ (ops.armScope _ _ armedHolds stands) (by rw [(ops.kept _ _).2]; exact stands) anchored

/-- The process a Call resolves is one the program declares. -/
theorem calledProcess_mem {ctx : Ctx} {header : Header} {work : CallWork} {process : CalledProcess}
    (resolved : Feature.Work.Call.calledProcess ctx header work = .ok process) : process ∈ ctx.program.processes := by
  unfold Feature.Work.Call.calledProcess at resolved
  split at resolved
  · cases resolved
  rw [apply_ite (fun x : Except Failure CalledProcess => x = .ok process)] at resolved
  split at resolved
  · cases resolved
  split at resolved
  · rename_i found
    cases resolved
    have member : process ∈ ctx.program.calledProcessFor ctx.program.options.calledElementResolution
        (ctx.program.callerDeployment header) work := by
      rw [found]; exact List.mem_singleton_self _
    exact Laws.IL.calledProcessFor_mem member
  · cases resolved

/-- The none start a Call begins is one of its called process's top-level elements. -/
theorem findSome?_start {children : List Element} {start : Header}
    (found : children.findSome? (fun child => child.start?.bind fun (start, payload) =>
      if payload.subscription.isNone then some start else none) = some start) :
    ∃ child ∈ children, child.header.id = start.id := by
  obtain ⟨child, inside, picked⟩ := List.exists_of_findSome?_eq_some found
  cases typed : child.start? with
  | none => rw [typed] at picked; cases picked
  | some pair =>
    rw [typed] at picked
    obtain ⟨header, payload⟩ := pair
    simp only [Option.bind_some] at picked
    split at picked
    · cases picked
      exact ⟨child, inside, by rw [Laws.Step.start?_header typed]⟩
    · cases picked

/-- A Call's invocation keeps `inv`: it enters the called root, arms its boundaries or not, then queues the root's
Event Sub-Process arming and its none start's begin. -/
theorem invoke_keeps {inv : State → Prop} {ctx : Ctx} (ops : WorkOps ctx.program inv) {header : Header}
    {payload : ActivityPayload} {work : CallWork} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (role : occurrence.role = .element)
    (isActivity : ((ctx.program.element? occurrence.element).bind (·.activity?)).isSome)
    (unowned : ∀ root ∈ state.scopes, root.calledInstance.isSome → root.occurrence ≠ some occurrence.id)
    (named : header.id = occurrence.element)
    (ran : Feature.Work.Call.invoke ctx header payload work occurrence state = .ok after) : inv after := by
  unfold Feature.Work.Call.invoke at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals have listed := calledProcess_mem (by assumption)
  all_goals have top := findSome?_start (by assumption)
  · exact called_keeps ops holds member begun role isActivity unowned _ _ listed _ top (fun current => current)
      fun _ held _ => ⟨held, rfl, rfl⟩
  · exact called_keeps ops holds member begun role isActivity unowned _ _ listed _ top (fun current => current.signal
      (.arm occurrence.id header.id occurrence.scope)) fun _ held present =>
        ⟨ops.arm _ _ _ held present begun named, (ops.kept _ _).2,
          (congrArg (fun t : State => t.slots.instances) (Laws.State.signal_eq _ _)).trans rfl⟩

/-- `Hooks.arriveActivity` keeps `inv` for a begun occurrence that owns no scope occurrence yet. -/
theorem arriveActivity_keeps {inv : State → Prop} {hooks : Feature.Work.WorkHooks} {ctx : Ctx}
    (ops : WorkOps ctx.program inv) {header : Header} {payload : ActivityPayload} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none) (role : occurrence.role = .element)
    (unowned : ∀ scope ∈ state.scopes, scope.occurrence ≠ some occurrence.id) (named : header.id = occurrence.element)
    (activity : (ctx.program.element? occurrence.element).bind (·.activity?) = some (header, payload))
    (ran : Feature.Work.arriveActivity hooks ctx header payload occurrence state = .ok after) : inv after := by
  unfold Feature.Work.arriveActivity at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals first
    | (cases ran; done)
    | (cases ran; exact ops.hold _ _ holds)
    | (cases ran; exact ops.completeBegun _ _ _ _ _ (enterLocal_keeps ops holds member begun named).1
        (enterLocal_keeps ops holds member begun named).2.1 begun fun _ same => by cases same)
    | (cases ran; exact openWork_keeps ops (enterLocal_keeps ops holds member begun named).1
        (enterLocal_keeps ops holds member begun named).2.1 begun unstarted role named)
    | exact evaluateDecision_keeps ops (enterLocal_keeps ops holds member begun named).1
        (enterLocal_keeps ops holds member begun named).2.1 begun ran
    | exact invoke_keeps ops (enterLocal_keeps ops holds member begun named).1
        (enterLocal_keeps ops holds member begun named).2.1 begun role (by rw [activity]; rfl)
        (fun root inside _ => unowned root ((enterLocal_keeps ops holds member begun named).2.2 root inside ‹_›)) named ran

/-! ## Calls

What a Call's own hooks do, for the former lanes of a called instance (`Kernel.Proofs.Former.Calls`): its arrival holds
the occurrence or invokes the called instance, and its return queues the completion of the Call occurrence that owns
the called root. -/

/-- An Activity's inputs, when there are any, enter its own scope occurrence below its occurrence's, which owns it. -/
theorem enterLocal_eq (header : Header) (inputs : List (String × Value)) (occurrence : Occurrence) (state : State) :
    Feature.Work.enterLocal header inputs occurrence state =
      if inputs.isEmpty then state else (state.enterScope header.id occurrence.scope inputs (some occurrence.id)).1 := by
  unfold Feature.Work.enterLocal; rfl

/-- The work record that names a Call is that Call's. -/
theorem work_call {work : Work} {call : CallWork} (named : work.call? = some call) : work = .call call := by
  cases work with
  | call found => rw [Laws.IL.call?_call] at named; rw [Option.some.inj named]
  | none => rw [Laws.IL.call?_none] at named; cases named
  | manual => rw [Laws.IL.call?_manual] at named; cases named
  | user _ => rw [Laws.IL.call?_user] at named; cases named
  | receive _ => rw [Laws.IL.call?_receive] at named; cases named
  | service _ => rw [Laws.IL.call?_service] at named; cases named
  | send _ => rw [Laws.IL.call?_send] at named; cases named
  | script _ => rw [Laws.IL.call?_script] at named; cases named
  | rule _ => rw [Laws.IL.call?_rule] at named; cases named

/-- A Call's mappings copied are the mappings evaluated, all available. -/
theorem copy_ok {ctx : Ctx} {unavailable : String} {context : EvalContext} {mappings : List Mapping}
    {bindings : List (String × Value)} (copied : Feature.Work.Call.copy ctx unavailable context mappings = .ok bindings) :
    ctx.evaluateMappings context mappings = .ok (some bindings) := by
  unfold Feature.Work.Call.copy at copied
  simp only [bind, Except.bind] at copied
  split at copied
  · cases copied
  · rename_i evaluated
    split at copied
    · cases copied
      exact evaluated
    · cases copied

/-- An arrival at a Call holds its occurrence while its InputSet is unavailable, or enters the Activity's inputs as its
own scope occurrence (`Feature.Work.enterLocal`) and invokes the called instance: it enters the called root with the
Call's inputs evaluated against what the Call's scope occurrence then sees, arms the Call's boundaries or not, and
queues the root's Event Sub-Process arming and its none start's begin. -/
theorem arriveActivity_call {hooks : Feature.Work.WorkHooks} {ctx : Ctx} {header : Header} {payload : ActivityPayload}
    {work : CallWork} {occurrence : Occurrence} {state after : State} (called : payload.work.call? = some work)
    (ran : Feature.Work.arriveActivity hooks ctx header payload occurrence state = .ok after) :
    (∃ held, after = state.hold held) ∨
      ∃ inputs entered installed definition start, entered = Feature.Work.enterLocal header inputs occurrence state ∧
        ctx.evaluateMappings (entered.evalContext ctx.program occurrence.scope) work.inputs = .ok (some installed) ∧
        ∃ armed, (armed = (entered.enterCalled ctx.program occurrence installed definition).1 ∨
            armed = (entered.enterCalled ctx.program occurrence installed definition).1.signal
              (.arm occurrence.id header.id occurrence.scope)) ∧
          after = (armed.signal (.armScope (entered.enterCalled ctx.program occurrence installed definition).2)).signal
            (.begin { element := start, scope := (entered.enterCalled ctx.program occurrence installed definition).2 })
    := by
  unfold Feature.Work.arriveActivity at ran
  simp only [work_call called, bind, Except.bind] at ran
  split at ran
  · cases ran
  · split at ran
    · split at ran
      · cases ran
      · rename_i inputs _ _
        refine .inr ⟨inputs, Feature.Work.enterLocal header inputs occurrence state, ?_⟩
        unfold Feature.Work.Call.invoke at ran
        simp only [bind, Except.bind] at ran
        repeat' split at ran
        all_goals first | (cases ran; done) | skip
        all_goals cases ran
        · exact ⟨_, _, _, rfl, copy_ok (by assumption), _, .inl rfl, rfl⟩
        · exact ⟨_, _, _, rfl, copy_ok (by assumption), _, .inr rfl, rfl⟩
    · cases ran
      exact .inl ⟨_, rfl⟩

/-- A return from a called instance queues only the completion of the Call occurrence `owner`, writing the Call's
outputs outward, and changes nothing else. -/
theorem completeCall_queues {ctx : Ctx} {header : Header} {payload : ActivityPayload} {root : ScopeOccurrence}
    {owner : Occurrence} {state after : State}
    (ran : Feature.Work.completeCall ctx header payload root owner state = .ok after) :
    ∃ outputs, after = state.signal (.complete owner.id .outgoing outputs .outward) := by
  unfold Feature.Work.completeCall at ran
  split at ran
  · unfold Feature.Work.Call.returnFromCall at ran
    simp only [bind, Except.bind] at ran
    split at ran
    · cases ran
    · cases ran
      exact ⟨_, rfl⟩
  all_goals cases ran

end Kernel.Laws.Work
