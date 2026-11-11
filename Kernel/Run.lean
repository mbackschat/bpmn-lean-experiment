module

public import Kernel.Step
public import Kernel.Publish
public import Kernel.Host
public import Kernel.Population
public import Kernel.Registry
public import Kernel.AdmissionRegistry
public import Kernel.IL.Codec
public import Kernel.IL.Codec.Stimulus
public import Kernel.Run.Population

/-! # Kernel scenario runner

`kernelRun <program.json> <scenario.json>` prints the [canonical result](../contracts/schemas/canonical-result.schema.json).
Trace rules: a committed input, or a rejected one that is not last, adds its command and state observation and the run
continues; any other outcome adds them and ends the run with that outcome. A program the admission registry refuses
yields only an unsupported deployment carrying the refusal code. A command observation of an input that did not commit
carries the failure's code.

A state observation's open waits are `Kernel.Host.hostView`'s, in the schema's canonical order: process instance,
element, activation, then detail kind, so the order an implementation opens them in is never published.

`kernelRun --host-view <program.json> <scenario.json>` prints `{result, hostRequirements, definitionCapabilities,
hostViews}`, one host view per committed input.

`kernelRun --population <digests.json> <program.json>... <population-scenario.json>` prints the
[engine-population result](../contracts/schemas/engine-population-result.schema.json) for a
[population scenario](../contracts/schemas/engine-population-scenario.schema.json), one deployment source per
deployment in deploy order (`Kernel.Run.Population`) and one digest of its content per step, which the
harness computes so that the kernel never reimplements canonical JSON or SHA-256. Its entry lives here because this is the one module that may import both
registries; `Kernel.Run.Population` reads the scenario and renders the result. A source the reader or admission
refuses is a refused deployment, a result; a malformed population scenario is a harness error with a stable code.

`kernelRun --decode <program.json>...` prints, per program in argument order, `{fixture, refusal}`: `null` when the strict
codec decodes it, else the codec's refusal. It runs nothing, so guard 21 holds every row fixture to the Lean codec in one
process; an unreadable file is a harness error.

`kernelRun --fixture <fixture.json>...` prints, per kernel fixture in argument order, `{fixture, answer}`: the answer of
one host-facing function no scenario run reaches (`fixtureAnswer`), applied to the fixture's admitted programs and input.
A fixture never carries its expected answer; the comparing test reads that from a separate file. A malformed fixture is
a harness error with a stable `fixture-` code.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- A present value, or JSON null: the schema's nullable members. -/
def nullable {α : Type} (value : Option α) (encode : α → Json) : Json :=
  match value with
  | some value => encode value
  | none => Json.null

def inputTagName : InputTag → String
  | .start => "start"
  | .command => "command"
  | .deliver => "deliver"
  | .timerFire => "timerFire"
  | .effectResult => "effectResult"

def definitionRefJson (ref : DefinitionRef) : Json :=
  Json.mkObj [("key", Json.str ref.key), ("version", nullable ref.version toJson),
    ("versionTag", nullable ref.versionTag Json.str), ("deployment", nullable ref.deployment toJson),
    ("tenant", nullable ref.tenant Json.str), ("sourceSha256", nullable ref.sourceSha256 Json.str)]

def effectFields (effect : EffectDetail) : List (String × Json) :=
  [("protocol", Json.str effect.protocol), ("operation", Json.str effect.operation),
    ("arguments", Codec.bindingsToJson effect.arguments), ("failures", toJson effect.failures),
    ("send", nullable effect.send fun send => Json.mkObj [("recipient", nullable send.recipient Json.str),
      ("correlation", Codec.bindingsToJson send.correlation)])]

def userTaskFields (task : UserTaskDetail) : List (String × Json) :=
  [("name", nullable task.name Json.str), ("assignee", nullable task.assignee Json.str),
    ("candidateUsers", toJson task.candidateUsers), ("candidateGroups", toJson task.candidateGroups),
    ("formKey", nullable task.formKey Json.str),
    ("formFields", Json.arr (task.formFields.map fun (key, type) =>
      Json.mkObj [("key", Json.str key), ("type", Json.str type)]).toArray),
    ("dueDate", nullable task.dueDate Json.str), ("followUpDate", nullable task.followUpDate Json.str),
    ("priority", nullable task.priority toJson), ("inputs", Codec.bindingsToJson task.inputs)]

/-- A wait's detail kind and fields, read from the one view field its kind sets (`OpenKind.view`). -/
def detail (view : WaitView) : Option (String × List (String × Json)) :=
  (view.userTask.map fun task => ("userTask", userTaskFields task)) <|>
  (view.incident.map fun incident => ("incident", [("effect", Json.mkObj (effectFields incident.effect)),
    ("generation", toJson incident.generation), ("cancellable", toJson incident.cancellable)])) <|>
  (view.effect.map fun effect => ("effect", effectFields effect)) <|>
  (view.signal.map fun signal => ("signal", Codec.signalAddressToJson signal.address ++ [("payload", toJson signal.payload)])) <|>
  (view.conditional.map fun condition => ("conditional", [("variableName", nullable condition.variableName Json.str),
    ("variableEvents", toJson condition.variableEvents), ("lastValue", nullable condition.lastValue toJson)])) <|>
  (view.deadlineMs.map fun deadline => ("timer", [("deadlineMs", toJson deadline),
    ("recurrence", nullable view.recurrence fun recurrence => Json.mkObj [
      ("periodMs", nullable recurrence.periodMs toJson), ("cron", nullable recurrence.cron Json.str),
      ("remaining", nullable recurrence.remaining toJson)])])) <|>
  (view.channel.map fun channel => ("message", [("channel", Codec.channelToJson channel),
    ("payload", toJson view.payload), ("criteria", toJson view.criteria)]))

/-- One rendered open wait with the key of the canonical order. -/
structure PublishedWait where
  id : OccurrenceRef
  kind : String
  json : Json

def renderWait (wait : Host.OpenWait) : PublishedWait :=
  -- Every view sets exactly one detail field, so the empty fallback never renders.
  let (kind, fields) := (detail wait.view).getD ("", [])
  { id := wait.id, kind
    json := Json.mkObj [("id", referenceJson wait.id), ("definition", nullable wait.definition definitionRefJson),
      ("input", nullable wait.view.input fun tag => Json.str (inputTagName tag)),
      ("detail", Json.mkObj (("kind", Json.str kind) :: fields))] }

/-- The schema's canonical order: process instance, element (both in `String` order), activation, detail kind. -/
def PublishedWait.canonicalLe (left right : PublishedWait) : Bool :=
  let (l, r) := (left.id, right.id)
  decide (l.processInstanceId < r.processInstanceId) || (l.processInstanceId == r.processInstanceId &&
    (decide (l.element.value < r.element.value) || (l.element.value == r.element.value &&
      (l.activation < r.activation || (l.activation == r.activation && decide (left.kind ≤ right.kind))))))

/-- A Signal an input threw to the population: kernel-only, since an observer sees an intent only through its
receivers (PC-SIGNAL-01). -/
def broadcastJson (intent : BroadcastIntent) : Json :=
  Json.mkObj (Codec.signalAddressToJson intent.address ++ [("variables", Codec.bindingsToJson intent.variables)] ++
    (intent.businessKey.map fun key => ("businessKey", Json.str key)).toList ++ [("origin", referenceJson intent.origin)])

/-- `broadcasts` when the input threw a Signal to the population, else nothing. -/
def broadcastsJson (intents : List BroadcastIntent) : List (String × Json) :=
  if intents.isEmpty then [] else [("broadcasts", Json.arr (intents.map broadcastJson).toArray)]

def failureJson (failure : InstanceFailure) : Json :=
  Json.mkObj [("code", Json.str failure.code), ("message", nullable failure.message Json.str),
    ("occurrence", referenceJson failure.occurrence),
    ("related", Json.arr (failure.related.map fun (name, ref) =>
      Json.mkObj [("name", Json.str name), ("occurrence", referenceJson ref)]).toArray)]

def scopeJson (scope : Publish.PublishedScope) : Json :=
  let place : List (String × Json) := match scope.element with
    | some element => [("elementId", Json.str element.value), ("activation", toJson scope.activation)]
    | none => []
  Json.mkObj [("scope", Json.mkObj ([("processInstanceId", Json.str scope.processInstanceId),
      ("role", Json.str (Publish.scopeRoleName scope.role))] ++ place)),
    ("variables", Codec.bindingsToJson scope.variables)]

/-- The state observation; `failure` appears only in a failed state, `broadcasts` only after an input that threw a
Signal to the population. -/
def observationJson (program : Program) (state : State) : Json :=
  let view := Host.hostView program state
  let waits := (view.openWaits.map renderWait).mergeSort PublishedWait.canonicalLe
  let fields : List (String × Json) := [("kind", "state"), ("instanceId", Json.str state.instanceId),
    ("status", Json.str (Publish.statusName view.status)), ("logicalTimeMs", toJson state.logicalTimeMs),
    ("variables", Codec.bindingsToJson (Publish.variables state)),
    ("scopes", Json.arr ((Publish.scopes program state).map scopeJson).toArray),
    ("openWaits", Json.arr (waits.map (·.json)).toArray)]
  Json.mkObj (fields ++
    (view.failure.map fun failure => ("failure", failureJson failure)).toList ++ broadcastsJson view.broadcasts)

/-- `code` appears only on an input that did not commit. -/
def commandJson (commandId outcome : String) (code : Option String) : Json :=
  let fields : List (String × Json) := [("kind", "command"), ("commandId", Json.str commandId),
    ("outcome", Json.str outcome)]
  Json.mkObj (fields ++
    code.toList.map fun code => ("code", Json.str code))

def snapshot (program : Program) (state : Option State) : List Json :=
  state.toList.map (observationJson program)

/-- The step of a single-instance run: a stimulus stating a Timer firing (`Codec.firingStimulusFromJson`) is refused
before the step unless it is on time in the degenerate population (`Population.onTimeRefusal`). A host that serves one
instance per chain steps every input through it with the firing its stimulus stated, so its verdicts are the
runner's. The codec reads the firing from the stimulus, so nothing outside `Kernel.Step` matches the input. -/
def runStep (program : Program) (state : Option State) (input : Input) (firing : Option Codec.TimerFiring) :
    Except Failure State :=
  match firing.bind fun firing => Population.onTimeRefusal program firing.startEvent firing.dueMs with
  | some code => .error (.rejected code)
  | none => Step.step Registry.hooks program state input

/-- A scenario stimulus: its command identifier, its input and the Timer firing it states. -/
abbrev RunStimulus := String × Input × Option Codec.TimerFiring

/-- The trace after deployment and the scenario outcome. -/
def execute (program : Program) : Option State → List RunStimulus → List Json × String
  | _, [] => ([], "committed")
  | state, (commandId, input, firing) :: rest =>
    match runStep program state input firing with
    | .ok next =>
      let (trace, outcome) := execute program (some next) rest
      (commandJson commandId "committed" none :: snapshot program (some next) ++ trace, outcome)
    | .error failure =>
      let name := Codec.failureName failure
      let observed := commandJson commandId name (some (Codec.failureCode failure)) :: snapshot program state
      match failure, rest with
      | .rejected _, _ :: _ =>
        let (trace, outcome) := execute program state rest
        (observed ++ trace, outcome)
      | _, _ => (observed, name)

/-- `code` appears only on a refused deployment. -/
def deploymentJson (outcome : String) (code : Option String) : Json :=
  let fields : List (String × Json) := [("kind", "deployment"), ("outcome", Json.str outcome)]
  Json.mkObj (fields ++ code.toList.map fun code => ("code", Json.str code))

def result (program : Program) (stimuli : List RunStimulus) : Json :=
  let semantic (outcome : String) := Json.mkObj [("kind", "semantic"), ("outcome", Json.str outcome)]
  match AdmissionRegistry.admit program with
  | some code =>
    Json.mkObj [("outcome", semantic "unsupported"), ("trace", Json.arr #[deploymentJson "unsupported" (some code)])]
  | none =>
    let (trace, outcome) := execute program none stimuli
    Json.mkObj [("outcome", semantic outcome), ("trace", Json.arr (deploymentJson "committed" none :: trace).toArray)]

/-- A scenario's stimuli, decoded by the stimulus codec with the Timer firing each states. -/
def stimuliFromJson (json : Json) : Except String (List RunStimulus) := do
  (← json.getObjValAs? (Array Json) "stimuli").toList.mapM Codec.firingStimulusFromJson

def run (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
  if let some code := AdmissionRegistry.admit program then IO.eprintln s!"admission refused: {code}"
  let stimuli ← orFail scenarioPath (stimuliFromJson (← readJson scenarioPath))
  pure (result program stimuli)

/-! ## Host-view mode -/

def roleName : ActivationRole → String
  | .element => "element"
  | .multiInstanceBody => "multiInstanceBody"

def keyJson (key : OccurrenceKey) : Json :=
  Json.mkObj [("processInstanceId", Json.str key.processInstanceId), ("elementId", Json.str key.element.value),
    ("activation", toJson key.activation), ("role", Json.str (roleName key.role))]

def terminalName : Terminal → String
  | .completed => "completed"
  | .cancelled => "cancelled"

def causeJson : Cause → Json
  | .input tag => Json.mkObj [("kind", "input"), ("input", Json.str (inputTagName tag))]
  | .signal name => Json.mkObj [("kind", "signal"), ("signal", Json.str name)]
  | .arrive flow => Json.mkObj [("kind", "arrive"), ("flow", Json.str flow.value)]
  | .idle scope => Json.mkObj [("kind", "idle"), ("scope", toJson scope.value)]

def transitionJson (transition : Transition) : Json :=
  Json.mkObj [("cause", causeJson transition.cause),
    ("element", match transition.element with | some element => Json.str element.value | none => Json.null),
    ("owner", toJson transition.owner.value),
    ("started", Json.arr (transition.started.map fun fact =>
      Json.mkObj [("occurrence", keyJson fact.occurrence), ("owner", toJson fact.owner.value),
        ("sourceType", Json.str fact.sourceType)]).toArray),
    ("ended", Json.arr (transition.ended.map fun (key, terminal) =>
      Json.mkObj [("occurrence", keyJson key), ("terminal", Json.str (terminalName terminal))]).toArray)]

def waitJson (wait : Host.OpenWait) : Json :=
  let view := wait.view
  let optional {α : Type} (name : String) (value : Option α) (encode : α → Json) : List (String × Json) :=
    (value.map fun value => (name, encode value)).toList
  Json.mkObj ([("id", referenceJson wait.id)] ++
    optional "definition" wait.definition toJson ++
    optional "input" view.input (fun tag => Json.str (inputTagName tag)) ++
    optional "deadlineMs" view.deadlineMs toJson ++
    optional "period" (view.recurrence.bind (·.periodMs)) toJson ++
    optional "channel" view.channel Codec.channelToJson ++
    (if view.criteria.isEmpty then [] else [("criteria", Json.arr (view.criteria.map Json.str).toArray)]) ++
    optional "effect" view.effect (fun effect => Json.mkObj [("protocol", Json.str effect.protocol),
      ("operation", Json.str effect.operation), ("arguments", Codec.bindingsToJson effect.arguments),
      ("failures", toJson effect.failures)]) ++
    optional "incident" view.incident (fun incident => Json.mkObj [("generation", toJson incident.generation),
      ("cancellable", toJson incident.cancellable)]) ++
    optional "userTask" view.userTask (fun task => Json.mkObj [
      ("name", match task.name with | some name => Json.str name | none => Json.null),
      ("inputs", Codec.bindingsToJson task.inputs)]))

def failureViewJson (failure : InstanceFailure) : Json :=
  Json.mkObj [("code", Json.str failure.code),
    ("message", match failure.message with | some message => Json.str message | none => Json.null),
    ("occurrence", referenceJson failure.occurrence),
    ("related", Json.mkObj (failure.related.map fun (name, ref) => (name, referenceJson ref)))]

def addressJson (address : Host.WaitAddress) : Json :=
  Json.mkObj ([("occurrence", referenceJson address.occurrence)] ++
    (address.message.map fun (channel, name) => ("message", Json.mkObj ([("channel", Codec.channelToJson channel)] ++
      (name.map fun name => ("name", Json.str name)).toList))).toList ++
    (address.signal.map fun signal => ("signal", Json.mkObj (Codec.signalAddressToJson signal))).toList)

/-- `addresses` appears only when an open wait has one; the scenario contract's `waitJson` stays as it is. -/
def hostViewJson (view : Host.View) : Json :=
  Json.mkObj ([("status", Json.str (Publish.statusName view.status)),
    ("openWaits", Json.arr (view.openWaits.map waitJson).toArray),
    ("journal", Json.arr (view.journal.map transitionJson).toArray)] ++
    (view.failure.map fun failure => ("failure", failureViewJson failure)).toList ++ broadcastsJson view.broadcasts ++
    (if view.addresses.isEmpty then [] else [("addresses", Json.arr (view.addresses.map addressJson).toArray)]))

/-- Every committed input's host view. -/
def hostViews (program : Program) : Option State → List RunStimulus → List Host.View
  | _, [] => []
  | state, (_, input, firing) :: rest =>
    match runStep program state input firing with
    | .ok next => Host.hostView program next :: hostViews program (some next) rest
    | .error (.rejected _) => hostViews program state rest
    | .error _ => []

def requirementsJson (requirements : Host.Requirements) : Json :=
  Json.mkObj [("timers", toJson requirements.timers), ("messages", toJson requirements.messages),
    ("effects", toJson requirements.effects), ("userTasks", toJson requirements.userTasks),
    ("calls", toJson requirements.calls),
    ("maxConcurrentWaits", match requirements.maxConcurrentWaits with | some value => toJson value | none => Json.null)]

/-- A resolved Timer schedule: `{durationMs}` or `{cycle: {periodMs, repetitions}}`, `repetitions` null when
unbounded. -/
def resolvedTimerJson : Timer.Resolved → Json
  | .duration ms => Json.mkObj [("durationMs", toJson ms)]
  | .date instantMs => Json.mkObj [("instantMs", toJson instantMs)]
  | .cycle periodMs repetitions =>
    Json.mkObj [("cycle", Json.mkObj [("periodMs", toJson periodMs), ("repetitions", nullable repetitions toJson)])]
  | .cron text => Json.mkObj [("cron", Json.str text)]

def correlatedChannelJson (group : Host.CorrelatedChannel) : Json :=
  Json.mkObj [("channel", Codec.channelToJson group.channel),
    ("catches", Json.arr (group.catches.map fun entry => Json.mkObj [("elementId", Json.str entry.element.value),
      ("criteria", Json.arr (entry.criteria.map fun criterion =>
        Json.mkObj [("key", Json.str criterion.key), ("value", toJson criterion.value)]).toArray)]).toArray)]

/-- A start's trigger as the engine API offers it: its kind, the vocabulary's `startTrigger` name, and for a Message
start its channel and literal name. -/
def startTriggerJson (start : Host.StartCapability) : Json :=
  match start.channel with
  | some channel => Json.mkObj ([("kind", Json.str "message"), ("channel", Codec.channelToJson channel)] ++
      (start.messageName.map fun name => ("messageName", Json.str name)).toList)
  | none =>
    Json.mkObj [("kind", Json.str (if start.schedule.isSome then "timer" else if start.signal then "signal"
      else if start.condition then "condition" else "none"))]

def capabilitiesJson (capabilities : Host.Capabilities) : Json :=
  Json.mkObj [("starts", Json.arr (capabilities.starts.map fun start =>
      Json.mkObj ([("startEventId", Json.str start.startEventId.value), ("trigger", startTriggerJson start)] ++
        (start.schedule.map fun schedule => ("schedule", resolvedTimerJson schedule)).toList)).toArray),
    ("correlatedChannels", Json.arr (capabilities.correlatedChannels.map correlatedChannelJson).toArray),
    ("relations", Json.arr (capabilities.relations.map Json.str).toArray)]

def runHostView (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
  let stimuli ← orFail scenarioPath (stimuliFromJson (← readJson scenarioPath))
  let views := if (AdmissionRegistry.admit program).isSome then [] else hostViews program none stimuli
  pure (Json.mkObj [("result", result program stimuli),
    ("hostRequirements", requirementsJson (Host.hostRequirements program)),
    ("definitionCapabilities", capabilitiesJson (Host.definitionCapabilities program)),
    ("hostViews", Json.arr (views.map hostViewJson).toArray)])

/-! ## Population mode -/

/-- `kernelRun --population <digests.json> <source.json>... <population-scenario.json>`: one deployment source per
deployment, in deploy order, and one digest per step. A program the admission registry refuses is a refused
deployment. -/
def runPopulation (digestsPath : String) (sourcePaths : List String) (scenarioPath : String) : IO Json := do
  let scenario ← readJson scenarioPath
  let digests ← orFail digestsPath (Lean.fromJson? (α := List String) (← readJson digestsPath))
  let (scenarioId, profile, resources) ← orFail scenarioPath do
    pure (← scenario.getObjValAs? String "id", ← scenario.getObjValAs? String "profile",
      (← scenario.getObjValAs? (Array Json) "definitions").toList)
  let declared ← orFail scenarioPath <| resources.mapM fun resource => do
    pure ({ definitionRef := ← resource.getObjValAs? String "definitionRef"
            ref := ← definitionRefFromJson (← resource.getObjVal? "bpmn") profile } : Declared)
  let sources ← sourcePaths.mapM fun sourcePath => do orFail sourcePath (deploymentSourceFromJson (← readJson sourcePath))
  let stimuli ← orFail scenarioPath
    (stimuliOfPopulation declared sources (← orFail scenarioPath (scenario.getObjValAs? (Array Json) "steps")).toList digests)
  let result ← orFail scenarioPath (Population.runStimuli Registry.hooks AdmissionRegistry.admit stimuli)
  pure (populationResultJson observationJson scenarioId result)

/-- The strict codec's answer for each program file: `refusal` is `null` when it decodes, else the codec's message. -/
def decodePrograms (paths : List String) : IO Json := do
  let answers ← paths.mapM fun (path : String) => do
    let text ← IO.FS.readFile path
    let refusal := match Codec.parseStrict text >>= Codec.programFromJson with
      | .ok _ => Json.null
      | .error message => Json.str message
    pure (Json.mkObj [("fixture", Json.str path), ("refusal", refusal)])
  pure (Json.arr answers.toArray)

/-! ## Fixture mode -/

/-- A fixture's programs, each decoded and admitted: the host applies these functions only to admitted programs. -/
def fixturePrograms (fixture : Json) : Except String (List Program) := do
  (← fixture.getObjValAs? (Array Json) "programs").toList.mapM fun programJson => do
    let program ← Codec.programFromJson programJson
    match AdmissionRegistry.admit program with
    | some code => throw s!"fixture-program-refused: {code}"
    | none => pure program

def onlyProgram : List Program → Except String Program
  | [program] => pure program
  | _ => throw "fixture-program-count"

/-- The instance state after `stimuli`, each of which must commit; matching is asked of a committed state only. -/
def committedState (program : Program) (stimuli : List Json) : Except String State := do
  let mut current : Option State := none
  for stimulus in stimuli do
    let (commandId, input) ← Codec.stimulusFromJson stimulus
    match Step.step Registry.hooks program current input with
    | .ok next => current := some next
    | .error failure => throw s!"fixture-stimulus-not-committed: {commandId} {Codec.failureCode failure}"
  match current with
  | some state => pure state
  | none => throw "fixture-without-instance"

/-- Each program's summary (`deploymentSummary`) registered in order as `deploymentIds` names it, over the summaries
registered before it, as the host's deployment ingress does: its own ordinal, then the versions or the refusal. -/
def registrations (programs : List Program) (deploymentIds : List Nat) : Except String Json := do
  unless programs.length == deploymentIds.length do throw "fixture-deployment-count"
  let (_, answers) := (programs.zip deploymentIds).foldl (init := (([] : List Population.DeploymentSummary), ([] : List Json)))
    fun (registry, answers) (program, deploymentId) =>
      let candidate := Population.deploymentSummary program
      let ordinal := ("ordinal", toJson candidate.deploymentId)
      match Population.registerSummary registry deploymentId candidate with
      | .ok (registered, versions) =>
        (registry ++ [{ candidate with deploymentId := registered, versions }],
          answers ++ [Json.mkObj [ordinal, ("deploymentId", toJson registered), ("versions", toJson versions)]])
      | .error code => (registry, answers ++ [Json.mkObj [ordinal, ("refused", Json.str code)]])
  pure (Json.arr answers.toArray)

/-- The answer of the host-facing function a fixture's `entry` names: `rootStarts`, `refusesSignalVariables`,
`matching` (over the state its stimuli commit, for a delivery's channel and correlation) or `registerSummary`. -/
def fixtureAnswer (fixture : Json) : Except String Json := do
  let input ← fixture.getObjVal? "input"
  match ← fixture.getObjValAs? String "entry" with
  | "rootStarts" =>
    let starts := Host.rootStarts (← onlyProgram (← fixturePrograms fixture))
    pure (Json.arr (starts.map fun (publicId, own) => Json.arr #[Json.str publicId, Json.str own.value]).toArray)
  | "refusesSignalVariables" => pure (Json.bool (Host.refusesSignalVariables (← onlyProgram (← fixturePrograms fixture))))
  | "matching" =>
    let program ← onlyProgram (← fixturePrograms fixture)
    let state ← committedState program (← input.getObjValAs? (List Json) "stimuli")
    let channel ← Codec.channelFromJson (← input.getObjVal? "channel")
    let correlation ← (← input.getObjValAs? (List Json) "correlation").mapM Codec.correlationFromJson
    pure (Json.arr ((Population.matching Registry.hooks program state channel correlation).map referenceJson).toArray)
  | "registerSummary" => registrations (← fixturePrograms fixture) (← input.getObjValAs? (List Nat) "deploymentIds")
  | other => throw s!"fixture-entry-unknown: {other}"

def runFixtures (paths : List String) : IO Json := do
  let answers ← paths.mapM fun (path : String) => do
    pure (Json.mkObj [("fixture", Json.str path), ("answer", ← orFail path (fixtureAnswer (← readJson path)))])
  pure (Json.arr answers.toArray)

end Kernel.Run

def main (args : List String) : IO UInt32 := do
  match args with
  | "--decode" :: paths@(_ :: _) =>
    IO.println (← Kernel.Run.decodePrograms paths).compress
    pure 0
  | "--fixture" :: paths@(_ :: _) =>
    IO.println (← Kernel.Run.runFixtures paths).compress
    pure 0
  | "--population" :: digestsPath :: paths@(_ :: _ :: _) =>
    IO.println (← Kernel.Run.runPopulation digestsPath paths.dropLast paths.getLast!).compress
    pure 0
  | ["--host-view", programPath, scenarioPath] =>
    IO.println (← Kernel.Run.runHostView programPath scenarioPath).compress
    pure 0
  | [programPath, scenarioPath] =>
    IO.println (← Kernel.Run.run programPath scenarioPath).compress
    pure 0
  | _ =>
    IO.eprintln ("usage: kernelRun <program.json> <scenario.json>\n" ++
      "       kernelRun --host-view <program.json> <scenario.json>\n" ++
      "       kernelRun --population <digests.json> <source.json>... <population-scenario.json>\n" ++
      "       kernelRun --decode <program.json>...\n" ++
      "       kernelRun --fixture <fixture.json>...")
    pure 64
