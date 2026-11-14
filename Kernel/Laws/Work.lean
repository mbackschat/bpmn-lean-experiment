module

public import Kernel.Hooks
public import Kernel.Feature.Work
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
  /-- The completion of the occurrence an open item waits for. -/
  complete : ∀ state item leave writes rule, inv state → item ∈ state.openItems →
    inv (state.signal (.complete item.occurrence leave writes rule))
  /-- The completion of the occurrence that owns a scope occurrence. -/
  completeOwner : ∀ state scope occurrence leave writes rule, inv state → scope ∈ state.scopes →
    occurrence ∈ state.occurrences → scope.occurrence = some occurrence.id →
    inv (state.signal (.complete occurrence.id leave writes rule))
  raise : ∀ state event origin, inv state → inv (state.signal (.raise event origin))
  cancel : ∀ state, inv state → inv (state.signal (.endInstance .cancelled none))
  /-- What open items wait for replaced, each keeping everything else. -/
  rekind : ∀ state (change : OpenItem → OpenItem), inv state →
    (∀ item, change item = { item with kind := (change item).kind }) → inv { state with openItems := state.openItems.map change }
  /-- Queuing a signal keeps the open items. -/
  queued : ∀ (state : State) signal, (state.signal signal).openItems = state.openItems
  /-- Queuing a signal keeps the occurrences and the scope occurrences. -/
  kept : ∀ (state : State) signal,
    (state.signal signal).occurrences = state.occurrences ∧ (state.signal signal).scopes = state.scopes
  /-- The completion of a begun occurrence. -/
  completeBegun : ∀ state occurrence leave writes rule, inv state → occurrence ∈ state.occurrences →
    occurrence.begun = true → inv (state.signal (.complete occurrence.id leave writes rule))
  housed : ∀ state occurrence, inv state → occurrence ∈ state.occurrences →
    ∃ entry ∈ state.scopes, entry.id = occurrence.scope
  hold : ∀ state held, inv state → inv (state.hold held)
  /-- An Activity's own scope occurrence, entered below its occurrence's, which owns it. -/
  enter : ∀ state element locals occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.enterScope element occurrence.scope locals (some occurrence.id)).1 ∧
      (state.enterScope element occurrence.scope locals (some occurrence.id)).1.occurrences = state.occurrences
  /-- An item for a begun occurrence of an element the program declares no start Event. -/
  openItem : ∀ state kind occurrence, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    (program.element? occurrence.element).bind (·.start?) = none → inv (state.openItem kind occurrence) ∧ (state.openItem kind occurrence).occurrences = state.occurrences
  arm : ∀ state occurrence element, inv state → occurrence ∈ state.occurrences → occurrence.begun = true →
    inv (state.signal (.arm occurrence.id element occurrence.scope))
  /-- A begun Call's called root, entered below its scope occurrence. -/
  enterCalled : ∀ state program call variables definition, inv state → call ∈ state.occurrences →
    call.begun = true → inv (state.enterCalled program call variables definition).1 ∧
      (state.enterCalled program call variables definition).1.occurrences = state.occurrences ∧
      ∃ entry ∈ (state.enterCalled program call variables definition).1.scopes,
        entry.id = (state.enterCalled program call variables definition).2
  armScope : ∀ state scope, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    inv (state.signal (.armScope scope))
  /-- A begin that names no reservation. -/
  begin : ∀ state element scope, inv state → (∃ entry ∈ state.scopes, entry.id = scope) →
    inv (state.signal (.begin { element, scope }))

/-- `reopen` replaces only what the item waits for. -/
theorem reopen_keeps {inv : State → Prop} (ops : WorkOps program inv) {state : State} (holds : inv state) (id : Nat)
    (kind : OpenKind) : inv (Feature.Work.reopen state id kind) :=
  ops.rekind state _ holds fun item => by split <;> rfl

/-- A completion of the item's occurrence after a write. -/
theorem installed_keeps {inv : State → Prop} (ops : WorkOps program inv) {state : State} {item : OpenItem}
    (holds : inv state) (member : item ∈ state.openItems) (scope : ScopeOccurrenceId)
    (values writes : List (String × Value)) (rule : WriteRule) (leave : Leave) (completion : WriteRule) :
    inv ((state.signal (.write scope values rule)).signal (.complete item.occurrence leave writes completion)) :=
  ops.complete _ _ _ _ _ (ops.write _ _ _ _ holds) (by rw [ops.queued]; exact member)

/-- `Hooks.completeUserTask` keeps `inv` for an open item. -/
theorem completeUserTask_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {header : Header}
    {payload : ActivityPayload} {item : OpenItem} {values : List (String × Value)} {state after : State}
    (holds : inv state) (member : item ∈ state.openItems)
    (ran : Feature.Work.completeUserTask ctx header payload item values state = .ok after) : inv after := by
  unfold Feature.Work.completeUserTask at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact installed_keeps ops holds member _ _ _ _ _ _
    | exact ops.complete _ _ _ _ _ holds member

/-- `Hooks.effectResult` keeps `inv` for an open item. -/
theorem effectResult_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {item : OpenItem}
    {outcome : EffectOutcome} {state after : State} (holds : inv state) (member : item ∈ state.openItems)
    (ran : Feature.Work.effectResult ctx item outcome state = .ok after) : inv after := by
  unfold Feature.Work.effectResult Feature.Work.effectCompletion at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals first
    | exact installed_keeps ops holds member _ _ _ _ _ _
    | exact ops.complete _ _ _ _ _ holds member
    | exact ops.raise _ _ _ holds
    | exact reopen_keeps ops holds _ _

/-- `Hooks.retryIncident` keeps `inv`. -/
theorem retryIncident_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {item : OpenItem}
    {incident : IncidentDetail} {generation : Nat} {state after : State} (holds : inv state)
    (ran : Feature.Work.retryIncident ctx item incident generation state = .ok after) : inv after := by
  unfold Feature.Work.retryIncident Feature.Work.staleIncident at ran
  split at ran
  · cases ran
  · cases ran
    exact reopen_keeps ops holds _ _

/-- `Hooks.cancelIncidentProcess` keeps `inv`. -/
theorem cancelIncidentProcess_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {incident : IncidentDetail}
    {generation : Nat} {state after : State} (holds : inv state)
    (ran : Feature.Work.cancelIncidentProcess ctx incident generation state = .ok after) : inv after := by
  unfold Feature.Work.cancelIncidentProcess Feature.Work.staleIncident at ran
  repeat' split at ran
  all_goals cases ran
  exact ops.cancel _ holds

/-- `Hooks.triggerActivity` keeps `inv` for an open item: a delivery completes the Receive Task its item waits for. -/
theorem triggerActivity_keeps {inv : State → Prop} (ops : WorkOps program inv) {hooks : Feature.Work.WorkHooks} {ctx : Ctx}
    {header : Header} {payload : ActivityPayload} {item : OpenItem} {fired : Fired} {state after : State}
    (holds : inv state) (member : item ∈ state.openItems)
    (ran : Feature.Work.triggerActivity hooks ctx header payload item fired state = .ok after) : inv after := by
  unfold Feature.Work.triggerActivity at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals exact ops.complete _ _ _ _ _ holds member

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
      exact ops.completeOwner _ _ _ _ _ _ holds member owned link
  all_goals cases ran

/-- An Activity's inputs, entered as its own scope occurrence, keep `inv` and its begun occurrence. -/
theorem enterLocal_keeps {inv : State → Prop} (ops : WorkOps program inv) {header : Header} {inputs : List (String × Value)}
    {occurrence : Occurrence} {state : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (begun : occurrence.begun = true) :
    inv (Feature.Work.enterLocal header inputs occurrence state) ∧
      occurrence ∈ (Feature.Work.enterLocal header inputs occurrence state).occurrences := by
  unfold Feature.Work.enterLocal
  split
  · exact ⟨holds, member⟩
  · obtain ⟨entered, same⟩ := ops.enter state header.id inputs occurrence holds member begun
    exact ⟨entered, same ▸ member⟩

/-- Opening a begun occurrence's work item, arming its boundaries or not, keeps `inv`. -/
theorem openWork_keeps {inv : State → Prop} (ops : WorkOps program inv) {kind : OpenKind} {header : Header}
    {payload : ActivityPayload} {occurrence : Occurrence} {state : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (program.element? occurrence.element).bind (·.start?) = none) :
    inv (Feature.Work.openWork kind header payload occurrence state) := by
  obtain ⟨opened, same⟩ := ops.openItem state kind occurrence holds member begun unstarted
  unfold Feature.Work.openWork
  split
  · exact opened
  · exact ops.arm _ _ _ opened (same ▸ member) begun

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
    | exact ops.completeBegun _ _ _ _ _ holds member begun
    | exact ops.completeBegun _ _ _ _ _ (ops.write _ _ _ _ holds) (by rw [(ops.kept _ _).1]; exact member) begun

/-- A begun Call entering its called root, then arming its boundaries or not, its root's Event Sub-Processes and its
none start keeps `inv`. -/
theorem called_keeps {inv : State → Prop} (ops : WorkOps program inv) {occurrence : Occurrence} {state : State}
    (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true) (program : Program)
    (variables : List (String × Value)) (definition : DefinitionRef) (start : ElementId) (armed : State → State)
    (arming : ∀ current, inv current → occurrence ∈ current.occurrences →
      inv (armed current) ∧ (armed current).scopes = current.scopes) :
    inv (((armed (state.enterCalled program occurrence variables definition).1).signal
      (.armScope (state.enterCalled program occurrence variables definition).2)).signal
        (.begin { element := start, scope := (state.enterCalled program occurrence variables definition).2 })) := by
  obtain ⟨entered, same, root⟩ := ops.enterCalled state program occurrence variables definition holds member begun
  obtain ⟨armedHolds, armedScopes⟩ := arming _ entered (by rw [same]; exact member)
  have stands : ∃ entry ∈ (armed (state.enterCalled program occurrence variables definition).1).scopes,
      entry.id = (state.enterCalled program occurrence variables definition).2 := by
    rw [armedScopes]
    exact root
  exact ops.begin _ _ _ (ops.armScope _ _ armedHolds stands) (by rw [(ops.kept _ _).2]; exact stands)

/-- A Call's invocation keeps `inv`: it enters the called root, arms its boundaries or not, then queues the root's
Event Sub-Process arming and its none start's begin. -/
theorem invoke_keeps {inv : State → Prop} (ops : WorkOps program inv) {ctx : Ctx} {header : Header} {payload : ActivityPayload}
    {work : CallWork} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (ran : Feature.Work.Call.invoke ctx header payload work occurrence state = .ok after) : inv after := by
  unfold Feature.Work.Call.invoke at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  · exact called_keeps ops holds member begun _ _ _ _ (fun current => current) fun _ held _ => ⟨held, rfl⟩
  · exact called_keeps ops holds member begun _ _ _ _ (fun current => current.signal (.arm occurrence.id header.id
      occurrence.scope)) fun _ held present => ⟨ops.arm _ _ _ held present begun, (ops.kept _ _).2⟩

/-- `Hooks.arriveActivity` keeps `inv` for a begun occurrence. -/
theorem arriveActivity_keeps {inv : State → Prop} {hooks : Feature.Work.WorkHooks} {ctx : Ctx}
    (ops : WorkOps ctx.program inv) {header : Header} {payload : ActivityPayload} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences) (begun : occurrence.begun = true)
    (unstarted : (ctx.program.element? occurrence.element).bind (·.start?) = none)
    (ran : Feature.Work.arriveActivity hooks ctx header payload occurrence state = .ok after) : inv after := by
  unfold Feature.Work.arriveActivity at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals first
    | (cases ran; done)
    | (cases ran; exact ops.hold _ _ holds)
    | (cases ran; exact ops.completeBegun _ _ _ _ _ (enterLocal_keeps ops holds member begun).1
        (enterLocal_keeps ops holds member begun).2 begun)
    | (cases ran; exact openWork_keeps ops (enterLocal_keeps ops holds member begun).1
        (enterLocal_keeps ops holds member begun).2 begun unstarted)
    | exact evaluateDecision_keeps ops (enterLocal_keeps ops holds member begun).1
        (enterLocal_keeps ops holds member begun).2 begun ran
    | exact invoke_keeps ops (enterLocal_keeps ops holds member begun).1
        (enterLocal_keeps ops holds member begun).2 begun ran

end Kernel.Laws.Work
