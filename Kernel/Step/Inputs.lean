module

public import Kernel.Hooks

/-! # Step: inputs

What every input states besides its payload (`inputHead`), the clock it advances (`advanceClock`), the ranking of
competing Conditional items it may carry (`admitChoices`), and the transitions of a command (`command`) and an effect
result (`deliverEffectResult`) on a running instance. `Kernel.Step` runs them; the match on `Input` here is
`Kernel.Step`'s own, in its submodule.
-/

public section

namespace Kernel.Step

/-- Advance the clock to an input's logical time, `none` leaving it where it is; a time before the clock is rejected,
since logical time never runs backward. -/
def advanceClock (at? : Option Nat) (state : State) : Outcome :=
  match at? with
  | none => .ok state
  | some atMs =>
    if atMs < state.logicalTimeMs then .error (.rejected "logical-time-backward")
    else .ok { state with logicalTimeMs := atMs }

/-- What every input states besides its payload: its tag, its logical time and its ranking of competing Conditional
items. A Timer firing without its own time happens at the deadline it names; a host that wakes later states the later
time. -/
def inputHead : Input → InputTag × Option Nat × List ConditionChoice
  | .start payload => (.start, payload.atMs, payload.conditionChoices)
  | .command payload => (.command, payload.atMs, payload.conditionChoices)
  | .deliver payload => (.deliver, payload.atMs, payload.conditionChoices)
  | .timerFire payload => (.timerFire, some (payload.atMs.getD payload.logicalTimeMs), payload.conditionChoices)
  | .effectResult payload => (.effectResult, payload.atMs, payload.conditionChoices)
  | .cancelInstance payload => (.cancelInstance, payload.atMs, payload.conditionChoices)

/-- Reject an input's ranking of competing Conditional items before its transition: an element listed twice
(`condition-choice-duplicate`; the schema's `uniqueItems` does not reach a caller that decodes without it), or one that
opens no Conditional item (`condition-choice-not-candidate`, `Hooks.competes`), so a ranking never names what no
contest can contain. -/
def admitChoices (hooks : Hooks) (ctx : Ctx) : Except Failure Unit :=
  let elements := ctx.conditionChoices.map (·.element)
  if elements.eraseDups.length != elements.length then .error (.rejected "condition-choice-duplicate")
  else if elements.all (hooks.competes ctx) then .ok ()
  else .error (.rejected "condition-choice-not-candidate")

/-- The occurrence with the public identity `ref`, the instance rather than the body of a Multi-Instance element: a begun
one, or a reservation an open item holds, as a Conditional arm of an Event-Based Gateway is addressed before it fires
(`conditional-catch/condition-wins`). -/
def occurrenceOf? (ctx : Ctx) (state : State) (ref : OccurrenceRef) : Option Occurrence :=
  state.occurrences.find? fun occurrence =>
    (occurrence.begun || (itemList state.openItems).any (·.id.occurrence == occurrence.id)) && occurrence.role == .element && occurrence.activation == ref.activation &&
      ctx.program.publicId occurrence.element == ref.element && (state.instanceOf occurrence.scope).text == ref.processInstanceId

/-- Run `onActivity` on the Activity an open item belongs to. -/
def atActivity (ctx : Ctx) (item : OpenItem) (onActivity : Header → ActivityPayload → Outcome) : Outcome :=
  match (ctx.program.element? item.element).bind (·.activity?) with
  | some (header, payload) => onActivity header payload
  | none => .error (.semanticFailure .invariant "activity-item-without-activity")

def command (hooks : Hooks) (ctx : Ctx) (input : CommandInput) (state : State) : Outcome :=
  let incident (resolve : OpenItem → IncidentDetail → Outcome) : Outcome :=
    match itemDetail? ctx state input.occurrence (·.incident) with
    | none => .error (.rejected "unknown-incident")
    | some (item, detail) => resolve item detail
  -- A variable command acts from the occurrence's own scope outward, its input-mapped locals first (DATA-SEMANTICS-SPEC,
  -- Scope data), as CIB's `setVariables` on the waiting activity's execution does (`AbstractVariableScope#setVariable`).
  let variables (act : ScopeOccurrenceId → Signal) : Outcome :=
    match occurrenceOf? ctx state input.occurrence with
    | none => .error (.rejected "unknown-occurrence")
    | some occurrence => .ok (state.signal (act (state.ownScope occurrence.id occurrence.scope)))
  match input.action with
  | .completeUserTask values =>
    match item? ctx state input.occurrence (·.userTask) with
    | none => .error (.rejected "unknown-user-task")
    | some item => atActivity ctx item fun header payload =>
      hooks.completeUserTask ctx header payload item values state
  | .retryIncident generation => incident fun item detail => hooks.retryIncident ctx item detail generation state
  | .cancelIncidentProcess generation => incident fun _ detail => hooks.cancelIncidentProcess ctx detail generation state
  | .setVariables values =>
    admitValues ctx.program.options.bounds (values.map (·.2)) *> variables fun scope => .write scope values .outward
  | .removeVariables names => variables fun scope => .remove scope names

def deliverEffectResult (hooks : Hooks) (ctx : Ctx) (input : EffectInput) (state : State) : Outcome :=
  match item? ctx state input.occurrence (·.effect) with
  | none => .error (.rejected "unknown-effect")
  | some item => hooks.effectResult ctx item input.outcome state

end Kernel.Step
