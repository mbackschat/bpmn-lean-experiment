module

public import Kernel.IL.Timer
public import Kernel.Population.Messages

/-! # Population: Timer starts

A Timer-start occurrence named by its due instant and fired at a command's logical time (PC-TIMER-04): the schedule's
origin and due instants are population semantics, so a host asks this check rather than reimplementing it
([specification](../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
-/

public section

namespace Kernel.Population

/-- The identity of the instance a Timer-start occurrence starts (population contract §4): bound to the occurrence, not
to a command, so one occurrence can never start two instances under any firing time or command identity. -/
def timerInstanceId (deploymentId : Nat) (startEvent : String) (dueMs : Nat) : String :=
  let deployment := toString deploymentId
  s!"timer:{deployment.utf8ByteSize}:{deployment}:{startEvent.utf8ByteSize}:{startEvent}:{dueMs}"

/-- A program's root Timer starts whose schedule resolves to what a host arms, in document order. -/
def timerStarts (program : Program) : List (Header × Timer.Resolved) :=
  ((program.children none).filterMap Element.start?).filterMap fun (header, start) =>
    (start.subscription.bind (·.trigger.timer?)).bind fun trigger =>
      (Timer.resolve trigger.schedule).toOption.map (header, ·)

/-- Whether an occurrence of a start resolved as `resolved`, deployed at `originMs`, may fire at `atMs`: `dueMs` must be
one of its due instants (`timer-occurrence-unknown`) and the firing not before it (`timer-not-due`). -/
def timerFiring (originMs dueMs atMs : Nat) (resolved : Timer.Resolved) : Option String :=
  if !Timer.occurs originMs dueMs resolved then some "timer-occurrence-unknown"
  else if atMs < dueMs then some "timer-not-due"
  else none

/-- A single-instance Timer start is the degenerate population: one deployment at 0, its occurrence named by the
trigger's time and fired on time (population contract §2.2, PC-TIMER-04). The start `named`, else the sole Timer start,
is checked; any other start is left to the step. -/
def onTimeRefusal (program : Program) (named : Option ElementId) (dueMs : Nat) : Option String :=
  match (timerStarts program).filter fun (header, _) => named.all (· == header.id) with
  | [(_, resolved)] => timerFiring 0 dueMs dueMs resolved
  | _ => none

/-- Fire a Timer-start occurrence at `atMs` (PC-TIMER-04, M8-INT-A, CIB-INT-0031). It is rejected unless the deployment
is registered (`definition-not-deployed`), `startEvent` is one of its root Timer starts (`no-start-event`), the
occurrence is due (`timerFiring`), the deployment is still current for its key, as CIB deletes every Timer-start job of
a key it redeploys (`timer-start-superseded`, `BpmnDeployer.java:251-258`), and the occurrence is unconsumed
(`timer-start-occurrence-consumed`). The instance takes the firing time; a committed start consumes the occurrence. -/
def timerStart (hooks : Hooks) (registry : List Deployment) (instances : List Instance)
    (consumed : List TimerOccurrence) (atMs : Nat) (fired : TimerStart) :
    Except String (List Instance × List TimerOccurrence × Resolution) := do
  let refuse (code : String) := (instances, consumed, Resolution.rejected code)
  let some deployment := registry.find? (·.deploymentId == fired.deploymentId)
    | return refuse "definition-not-deployed"
  let program := deployment.program
  let reached (start : Header × Timer.Resolved) : Bool := (program.publicId start.1.id).value == fired.startEvent
  let some (header, resolved) := (timerStarts program).find? reached
    | return refuse "no-start-event"
  let superseded := (current registry deployment.key).all (·.deploymentId != deployment.deploymentId)
  let spent := consumed.any fun occurrence => occurrence.deploymentId == fired.deploymentId &&
    occurrence.startEvent == fired.startEvent && occurrence.dueMs == fired.dueMs
  let refusal := timerFiring deployment.deployedAtMs fired.dueMs atMs resolved <|>
    (if superseded then some "timer-start-superseded" else none) <|>
    (if spent then some "timer-start-occurrence-consumed" else none)
  if let some code := refusal then return refuse code
  let instanceId := timerInstanceId fired.deploymentId fired.startEvent fired.dueMs
  let (started, entry) ← startInstance hooks deployment fired.startEvent
    { instanceId, startEvent := some header.id, trigger := .timer atMs, atMs := some atMs }
  let occurrence : TimerOccurrence :=
    { deploymentId := fired.deploymentId, startEvent := fired.startEvent, dueMs := fired.dueMs }
  pure (instances ++ started.toList, consumed ++ (started.map fun _ => occurrence).toList, .fanOut [entry])

end Kernel.Population
