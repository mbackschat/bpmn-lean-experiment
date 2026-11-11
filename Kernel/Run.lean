module

public import Kernel.Step
public import Kernel.Publish
public import Kernel.Host
public import Kernel.Population
public import Kernel.Registry
public import Kernel.AdmissionRegistry
public import Kernel.IL.Codec
public import Kernel.IL.Codec.Stimulus

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
[population scenario](../contracts/schemas/engine-population-scenario.schema.json), one program per scenario definition
in the same order and one digest of its canonical wire form per step, which the harness computes so that the kernel
never reimplements canonical JSON or SHA-256. The population mode lives here because this is the one module that may
import both registries. A program admission refuses is a refused deployment, a result; a malformed population
scenario is a harness error, three of them with stable codes: `population-time-backward`, `population-time-mismatch`
and `population-unknown-definition`.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- An already public reference (`Host.publicRef`, `Population.occurrence`): the schema's `occurrenceId`. -/
def referenceJson (ref : OccurrenceRef) : Json :=
  Json.mkObj [("processInstanceId", Json.str ref.processInstanceId), ("elementId", Json.str ref.element.value),
    ("activation", toJson ref.activation)]

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

/-- The trace after deployment and the scenario outcome. -/
def execute (program : Program) : Option State → List (String × Input) → List Json × String
  | _, [] => ([], "committed")
  | state, (commandId, input) :: rest =>
    match Step.step Registry.hooks program state input with
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

def result (program : Program) (stimuli : List (String × Input)) : Json :=
  let semantic (outcome : String) := Json.mkObj [("kind", "semantic"), ("outcome", Json.str outcome)]
  match AdmissionRegistry.admit program with
  | some code =>
    Json.mkObj [("outcome", semantic "unsupported"), ("trace", Json.arr #[deploymentJson "unsupported" (some code)])]
  | none =>
    let (trace, outcome) := execute program none stimuli
    Json.mkObj [("outcome", semantic outcome), ("trace", Json.arr (deploymentJson "committed" none :: trace).toArray)]

def readJson (path : String) : IO Json := do
  match Codec.parseStrict (← IO.FS.readFile path) with
  | .ok json => pure json
  | .error message => throw (IO.userError s!"{path}: {message}")

def orFail {α : Type} (path : String) : Except String α → IO α
  | .ok value => pure value
  | .error message => throw (IO.userError s!"{path}: {message}")

/-- A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. -/
def definitionRefFromJson (resource : Json) (profile : String) : Except String Population.DeploymentRef := do
  let overlay ← match ← resource.getObjVal? "sourceOverlay" with
    | .null => pure none
    | overlay =>
      pure (some { id := ← overlay.getObjValAs? String "id", sha256 := ← overlay.getObjValAs? String "sha256" })
  pure { sourceId := ← resource.getObjValAs? String "id", sourceSha256 := ← resource.getObjValAs? String "sha256"
         overlay, profile }

def stimuliFromJson (json : Json) : Except String (List (String × Input)) := do
  (← json.getObjValAs? (Array Json) "stimuli").toList.mapM Codec.stimulusFromJson

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

def hostViewJson (view : Host.View) : Json :=
  Json.mkObj ([("status", Json.str (Publish.statusName view.status)),
    ("openWaits", Json.arr (view.openWaits.map waitJson).toArray),
    ("journal", Json.arr (view.journal.map transitionJson).toArray)] ++
    (view.failure.map fun failure => ("failure", failureViewJson failure)).toList ++ broadcastsJson view.broadcasts)

/-- Every committed input's host view. -/
def hostViews (program : Program) : Option State → List (String × Input) → List Host.View
  | _, [] => []
  | state, (_, input) :: rest =>
    match Step.step Registry.hooks program state input with
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

def capabilitiesJson (capabilities : Host.Capabilities) : Json :=
  Json.mkObj [("starts", Json.arr (capabilities.starts.map fun start =>
      Json.mkObj ([("startEventId", Json.str start.startEventId.value)] ++
        (start.channel.map fun channel => ("channel", Codec.channelToJson channel)).toList ++
        (start.messageName.map fun name => ("messageName", Json.str name)).toList ++
        (start.timer.map fun timer => ("timer", resolvedTimerJson timer)).toList)).toArray),
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

/-- An instance step names its instance and definition; every step of one instance names the same definition. -/
structure Script where
  instanceId : String
  definitionRef : String

/-- A scenario definition with the program the harness compiled for it. -/
structure Declared where
  definitionRef : String
  ref : Population.DeploymentRef
  program : Program

/-- A malformed population scenario: a harness refusal with its stable code (contract §2.2, §7). -/
def harnessRefusal {α : Type} (code detail : String) : Except String α :=
  throw s!"{code}: {detail}"

def declaredOf (declared : List Declared) (definitionRef : String) : Except String Declared :=
  match declared.find? (·.definitionRef == definitionRef) with
  | some entry => pure entry
  | none => harnessRefusal "population-unknown-definition" definitionRef

def optional (json : Json) (key : String) : Option Json :=
  (json.getObjVal? key).toOption

/-- A command's optional business key. -/
def businessKeyOf (json : Json) : Except String (Option String) :=
  match optional json "businessKey" with
  | none => pure none
  | some _ => some <$> json.getObjValAs? String "businessKey"

/-- `{processKey}` names a key's current deployment, `{deploymentId}` one deployment; absent, no definition. -/
def selectorFromJson : Option Json → Except String (Option Population.DefinitionSelector)
  | none => pure none
  | some json =>
    match optional json "processKey" with
    | some _ => (some ∘ .processKey) <$> json.getObjValAs? String "processKey"
    | none => (some ∘ .deployment) <$> json.getObjValAs? Nat "deploymentId"

/-- A discovery order's entry: `{kind: "occurrence", occurrence}` or `{kind: "start", deploymentId, startEvent}`. -/
def receiverFromJson (json : Json) : Except String Population.Receiver := do
  match ← json.getObjValAs? String "kind" with
  | "occurrence" => .occurrence <$> Codec.occurrenceFromJson (← json.getObjVal? "occurrence")
  | "start" => pure (.start (← json.getObjValAs? Nat "deploymentId") (← json.getObjValAs? String "startEvent"))
  | other => throw s!"unknown receiver kind {other}"

def orderFromJson (json : Json) : Except String (Option (List Population.Receiver)) := do
  match optional json "order" with
  | none => pure none
  | some _ => some <$> (← json.getObjValAs? (Array Json) "order").toList.mapM receiverFromJson

def publishModeFromJson : String → Except String Population.PublishMode
  | "any" => pure .any
  | "executionsOnly" => pure .executionsOnly
  | "startOnly" => pure .startOnly
  | other => throw s!"unknown publication mode {other}"

def publicationFromJson (json : Json) : Except String Population.Publication := do
  let address ← json.getObjVal? "address"
  let message : Population.MessageAddress ← match optional address "channel", optional address "name" with
    | some channel, none => .channel <$> Codec.channelFromJson channel
    | none, some _ => .name <$> address.getObjValAs? String "name"
    | _, _ => throw "a publication names a channel or a name"
  pure { commandId := ← json.getObjValAs? String "commandId"
         definition := ← selectorFromJson (optional address "definition")
         message
         criteria := ← (← json.getObjValAs? (Array Json) "criteria").toList.mapM Codec.correlationFromJson
         payload := ← (optional json "payload").mapM Codec.valueAt
         variables := ← Codec.bindingsAt json "variables"
         businessKey := ← businessKeyOf json
         mode := ← publishModeFromJson (← json.getObjValAs? String "mode") }

/-- A population command step, or `none` for another step kind. -/
def commandFromJson (json : Json) : String → Except String (Option Population.Command)
  | "publish" => (some ∘ .publish) <$> publicationFromJson json
  | "broadcast" => do
    pure (some (.broadcast { commandId := ← json.getObjValAs? String "commandId"
                             address := ← Codec.signalAddressFromJson (← json.getObjVal? "address")
                             variables := ← Codec.bindingsAt json "variables", order := ← orderFromJson json }))
  | "evaluateConditions" => do
    pure (some (.evaluateConditions { commandId := ← json.getObjValAs? String "commandId"
                                      definition := ← selectorFromJson (optional json "definition")
                                      variables := ← Codec.bindingsAt json "variables"
                                      businessKey := ← businessKeyOf json
                                      order := ← orderFromJson json }))
  | "timerStart" => do
    pure (some (.timerStart { commandId := ← json.getObjValAs? String "commandId"
                              deploymentId := ← json.getObjValAs? Nat "deploymentId"
                              startEvent := ← json.getObjValAs? String "startEvent"
                              dueMs := ← json.getObjValAs? Nat "dueMs" }))
  | _ => pure none

/-- An instance step's input. Its stimulus keeps its own `at`, which must equal the step's when both are given; a step
`at` the stimulus lacks becomes the input's. -/
def instanceInput (stimulus : Json) (stepAt : Option Nat) : Except String (String × Input) :=
  match stepAt, optional stimulus "at" with
  | some stepAt, some own =>
    if (own.getNat?).toOption == some stepAt then Codec.stimulusFromJson stimulus
    else harnessRefusal "population-time-mismatch" s!"stimulus at {own.compress}, step at {stepAt}"
  | some stepAt, none => Codec.stimulusFromJson (stimulus.setObjVal! "at" (toJson stepAt))
  | none, _ => Codec.stimulusFromJson stimulus

/-- An instance step, with the scripts seen so far: an instance's start must name the step's instance. -/
def instanceStimulus (declared : List Declared) (scripts : List Script) (json : Json) (stepAt : Option Nat) :
    Except String (List Script × Population.Stimulus) := do
  let script : Script :=
    { instanceId := ← json.getObjValAs? String "instanceId", definitionRef := ← json.getObjValAs? String "definitionRef" }
  discard <| declaredOf declared script.definitionRef
  let stimulus ← json.getObjVal? "stimulus"
  if (stimulus.getObjValAs? String "kind").toOption == some "start" then
    let started ← stimulus.getObjValAs? String "instanceId"
    unless started == script.instanceId do throw s!"step of {script.instanceId} starts {started}"
  let (commandId, input) ← instanceInput stimulus stepAt
  match scripts.findIdx? (·.instanceId == script.instanceId) with
  | some index =>
    unless (scripts[index]?.map (·.definitionRef)) == some script.definitionRef do
      throw s!"instance {script.instanceId} names two definitions"
    pure (scripts, .input index script.definitionRef commandId input)
  | none => pure (scripts ++ [script], .input scripts.length script.definitionRef commandId input)

/-- The population's stimuli, in scenario order: the definitions no `deploy` step names deploy at 0 in list order,
then every step at its logical time, which a step gives as `at` or inherits from the step before (0 for the first) and
which never decreases. `digests` holds each step's digest of its canonical wire form, which the harness computes. -/
def stimuliOfPopulation (declared : List Declared) (steps : List Json) (digests : List String) :
    Except String (List Population.Stimulus) := do
  unless digests.length == steps.length do throw s!"{steps.length} steps, {digests.length} digests"
  let mut deployedByStep : List String := []
  for json in steps do
    if (← json.getObjValAs? String "kind") == "deploy" then
      deployedByStep := deployedByStep ++ [(← declaredOf declared (← json.getObjValAs? String "definitionRef")).definitionRef]
  let mut stimuli : List Population.Stimulus := (declared.filter fun entry => !deployedByStep.contains entry.definitionRef).map
    fun entry => .deploy entry.definitionRef entry.ref entry.program 0
  let mut scripts : List Script := []
  let mut clock := 0
  for (json, index) in steps.zipIdx do
    let stepAt ← match optional json "at" with
      | none => pure none
      | some _ => some <$> json.getObjValAs? Nat "at"
    if let some stepAt := stepAt then
      if stepAt < clock then harnessRefusal "population-time-backward" s!"step {index} at {stepAt} after {clock}"
      clock := stepAt
    match ← json.getObjValAs? String "kind" with
    | "deploy" =>
      let entry ← declaredOf declared (← json.getObjValAs? String "definitionRef")
      stimuli := stimuli ++ [.deploy entry.definitionRef entry.ref entry.program clock]
    | "instance" =>
      let (known, stimulus) ← instanceStimulus declared scripts json stepAt
      scripts := known
      stimuli := stimuli ++ [stimulus]
    | kind =>
      match ← commandFromJson json kind with
      | some command => stimuli := stimuli ++ [.command command clock (digests.getD index "")]
      | none => throw s!"unsupported population step {kind}"
  pure stimuli

def failureFields (failure : Failure) : List (String × Json) :=
  [("outcome", Json.str (Codec.failureName failure)), ("code", Json.str (Codec.failureCode failure))]

def receiverJson : Population.Receiver → Json
  | .occurrence ref => Json.mkObj [("kind", "occurrence"), ("occurrence", referenceJson ref)]
  | .start deploymentId startEvent =>
    Json.mkObj [("kind", "start"), ("deploymentId", toJson deploymentId), ("startEvent", Json.str startEvent)]

def fanOutEntryJson : Population.FanOutEntry → Json
  | .delivered target => Json.mkObj [("kind", "delivered"), ("target", referenceJson target)]
  | .started instanceId deploymentId version startEvent =>
    Json.mkObj [("kind", "started"), ("instanceId", Json.str instanceId), ("deploymentId", toJson deploymentId),
      ("version", toJson version), ("startEvent", Json.str startEvent)]
  | .skipped target => Json.mkObj [("kind", "skipped"), ("target", referenceJson target)]
  | .failed target failure =>
    Json.mkObj ([("kind", Json.str "failed"), ("target", receiverJson target)] ++ failureFields failure)

def resolutionJson : Population.Resolution → Json
  | .committed target => Json.mkObj [("kind", "committed"), ("target", referenceJson target)]
  | .failed target failure =>
    Json.mkObj ([("kind", Json.str "failed"), ("target", referenceJson target)] ++ failureFields failure)
  | .fanOut entries => Json.mkObj [("kind", "fanOut"), ("entries", Json.arr (entries.map fanOutEntryJson).toArray)]
  | .noMatch => Json.mkObj [("kind", "noMatch")]
  | .ambiguous => Json.mkObj [("kind", "ambiguous")]
  | .rejected code => Json.mkObj [("kind", "rejected"), ("code", Json.str code)]
  | .unsupported code => Json.mkObj [("kind", "unsupported"), ("code", Json.str code)]

def deploymentResultJson (deployment : Population.DeploymentResult) : Json :=
  let outcome := match deployment.outcome with
    | .deployed => Json.mkObj [("kind", "deployed")]
    | .refused code => Json.mkObj [("kind", "deploymentRefused"), ("code", Json.str code)]
  Json.mkObj [("deploymentId", toJson deployment.deploymentId), ("definitionRef", Json.str deployment.definitionRef),
    ("versions", Json.arr (deployment.versions.map fun (key, version) =>
      Json.mkObj [("key", Json.str key), ("version", toJson version)]).toArray),
    ("outcome", outcome)]

def populationResultJson (scenarioId : String) (result : Population.Result) : Json :=
  let inputFailures := if result.inputFailures.isEmpty then [] else
    [("inputFailures", Json.arr (result.inputFailures.map fun (commandId, failure) =>
      Json.mkObj ([("commandId", Json.str commandId)] ++ failureFields failure)).toArray)]
  let fields : List (String × Json) := [("kind", "enginePopulationResult"), ("scenarioId", Json.str scenarioId),
    ("deployments", Json.arr (result.deployments.map deploymentResultJson).toArray),
    ("steps", Json.arr (result.steps.map fun stepped =>
      Json.mkObj [("commandId", Json.str stepped.commandId), ("ordinal", toJson stepped.ordinal),
        ("at", toJson stepped.atMs), ("resolution", resolutionJson stepped.resolution)]).toArray),
    ("processStates", Json.arr (result.instances.map fun member =>
      observationJson member.deployment.program member.state).toArray)]
  Json.mkObj (inputFailures ++ fields)

/-- `kernelRun --population <digests.json> <program.json>... <population-scenario.json>`: one program per scenario
definition, in order, and one digest per step. A program the admission registry refuses is a refused deployment. -/
def runPopulation (digestsPath : String) (programPaths : List String) (scenarioPath : String) : IO Json := do
  let scenario ← readJson scenarioPath
  let digests ← orFail digestsPath (Lean.fromJson? (α := List String) (← readJson digestsPath))
  let (scenarioId, profile, resources) ← orFail scenarioPath do
    pure (← scenario.getObjValAs? String "id", ← scenario.getObjValAs? String "profile",
      (← scenario.getObjValAs? (Array Json) "definitions").toList)
  unless resources.length == programPaths.length do
    throw (IO.userError s!"{scenarioPath}: {resources.length} definitions, {programPaths.length} programs")
  let declared ← (resources.zip programPaths).mapM fun (resource, programPath) => do
    let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
    let (definitionRef, ref) ← orFail scenarioPath do
      pure (← resource.getObjValAs? String "definitionRef", ← definitionRefFromJson (← resource.getObjVal? "bpmn") profile)
    unless program.identity.sourceSha256 == ref.sourceSha256 && program.identity.profile == profile do
      throw (IO.userError s!"{programPath}: program identity differs from definition {definitionRef}")
    pure ({ definitionRef, ref, program } : Declared)
  let stimuli ← orFail scenarioPath
    (stimuliOfPopulation declared (← orFail scenarioPath (scenario.getObjValAs? (Array Json) "steps")).toList digests)
  let result ← orFail scenarioPath (Population.runStimuli Registry.hooks AdmissionRegistry.admit stimuli)
  pure (populationResultJson scenarioId result)

end Kernel.Run

def main (args : List String) : IO UInt32 := do
  match args with
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
      "       kernelRun --population <digests.json> <program.json>... <population-scenario.json>")
    pure 64
