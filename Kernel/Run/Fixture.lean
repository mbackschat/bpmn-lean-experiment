module

public import Kernel.Population
public import Kernel.Run.Population

/-! # Kernel fixtures of the population functions

The population functions a host shares with the population runner (ARCHITECTURE-SPEC "Population ingress"), each
answered over a kernel fixture's admitted programs and input, so the TypeScript kernel's unit cases of these functions
are held to this kernel (`kernelRun --fixture`, `kernelRun --batch`). `Kernel.Run.fixtureAnswer` dispatches to them and
passes the registry's hooks and the instance state a fixture's stimuli commit, since only `Kernel.Run` may import the
registries. Each reads its input in the runner's wire forms: occurrences, Signal addresses and bindings as stimuli state
them, receivers and publications as population scenarios do.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- `key`'s member decoded by `decode`, or `none` when it is JSON null. -/
def nullableAt {α : Type} (json : Json) (key : String) (decode : Json → Except String α) : Except String (Option α) :=
  match json.getObjValD key with
  | .null => pure none
  | value => some <$> decode value

def signalAddressJson (address : SignalAddress) : Json := Json.mkObj (Codec.signalAddressToJson address)

/-- A Signal emission: `{address, variables, businessKey, origin, emitter}`, the last three nullable. -/
def emissionFromJson (json : Json) : Except String Population.Emission := do
  pure { address := ← Codec.signalAddressFromJson (← json.getObjVal? "address")
         variables := ← Codec.bindingsAt json "variables"
         businessKey := ← nullableAt json "businessKey" (·.getStr?)
         origin := ← nullableAt json "origin" Codec.occurrenceFromJson
         emitter := ← nullableAt json "emitter" (·.getStr?) }

def emissionJson (emission : Population.Emission) : Json :=
  Json.mkObj [("address", signalAddressJson emission.address), ("variables", Codec.bindingsToJson emission.variables),
    ("businessKey", nullable emission.businessKey Json.str), ("origin", nullable emission.origin referenceJson),
    ("emitter", nullable emission.emitter Json.str)]

/-- A Signal an instance threw: `{address, variables, businessKey, origin}`, `businessKey` nullable. -/
def intentFromJson (json : Json) : Except String BroadcastIntent := do
  pure { address := ← Codec.signalAddressFromJson (← json.getObjVal? "address")
         variables := ← Codec.bindingsAt json "variables"
         businessKey := ← nullableAt json "businessKey" (·.getStr?)
         origin := ← Codec.occurrenceFromJson (← json.getObjVal? "origin") }

def intentJson (intent : BroadcastIntent) : Json :=
  Json.mkObj [("address", signalAddressJson intent.address), ("variables", Codec.bindingsToJson intent.variables),
    ("businessKey", nullable intent.businessKey Json.str), ("origin", referenceJson intent.origin)]

/-- Work a fan-out still has: `{receiver, emission}` (`emission` nullable for a root receiver) or `{intent, emitter}`. -/
def pendingFromJson (json : Json) : Except String Population.Pending := do
  match json.getObjValD "intent" with
  | .null => pure (.receiver (← nullableAt json "emission" emissionFromJson) (← receiverFromJson (← json.getObjVal? "receiver")))
  | intent => pure (.intent (← json.getObjValAs? String "emitter") (← intentFromJson intent))

/-- A failure by the outcome name and code `failureFields` writes. -/
def failureFromJson (json : Json) : Except String Failure := do
  let code ← json.getObjValAs? String "code"
  match ← json.getObjValAs? String "outcome" with
  | "rejected" => pure (.rejected code)
  | "rolledBack" => pure (.rolledBack code)
  | "semanticFailure" => pure (.semanticFailure code)
  | "unsupported" => pure (.unsupported code)
  | other => throw s!"unknown failure outcome {other}"

/-- A fan-out entry in the form `fanOutEntryJson` writes. -/
def fanOutEntryFromJson (json : Json) : Except String Population.FanOutEntry := do
  match ← json.getObjValAs? String "kind" with
  | "delivered" => .delivered <$> Codec.occurrenceFromJson (← json.getObjVal? "target")
  | "skipped" => .skipped <$> Codec.occurrenceFromJson (← json.getObjVal? "target")
  | "started" => pure (.started (← json.getObjValAs? String "instanceId") (← json.getObjValAs? Nat "deploymentId")
      (← json.getObjValAs? Nat "version") (← json.getObjValAs? String "startEvent"))
  | "failed" => pure (.failed (← receiverFromJson (← json.getObjVal? "target")) (← failureFromJson json))
  | other => throw s!"unknown fan-out entry kind {other}"

def fanOutNextJson : Population.FanOutNext → Json
  | .reach receiver emission =>
    Json.mkObj [("kind", "reach"), ("receiver", receiverJson receiver), ("emission", nullable emission emissionJson)]
  | .snapshot intent emission => Json.mkObj [("kind", "snapshot"), ("intent", intentJson intent), ("emission", emissionJson emission)]
  | .done entries => Json.mkObj [("kind", "done"), ("entries", Json.arr (entries.map fanOutEntryJson).toArray)]

/-- One step of a fan-out script over `machine`: the machine after it and the step's answer. -/
def fanOutOp (machine : Population.FanOutMachine) (op : Json) : Except String (Population.FanOutMachine × Json) := do
  match ← op.getObjValAs? String "op" with
  | "next" => pure (machine, fanOutNextJson (Population.fanOutNext machine))
  | "pass" => pure (Population.fanOutPass machine, Json.null)
  | "record" =>
    let intents ← (← op.getObjValAs? (Array Json) "intents").toList.mapM intentFromJson
    pure (Population.fanOutRecord machine (← fanOutEntryFromJson (← op.getObjVal? "entry")) intents
      (← op.getObjValAs? String "emitter"), Json.null)
  | "snapshot" =>
    let receivers ← (← op.getObjValAs? (Array Json) "receivers").toList.mapM receiverFromJson
    let order ← nullableAt op "order" fun json => do (← json.getArr?).toList.mapM receiverFromJson
    pure <| match Population.fanOutSnapshot machine receivers order with
      | .ok next => (next, Json.mkObj [("ok", Json.bool true)])
      | .error code => (machine, Json.mkObj [("error", Json.str code)])
  | other => throw s!"fixture-fan-out-op-unknown: {other}"

/-- The answers of a fan-out script: a machine begun as `input` states, then each of its `ops` in turn. -/
def fanOutScript (input : Json) : Except String Json := do
  let root ← (← input.getObjValAs? (Array Json) "root").toList.mapM pendingFromJson
  let machine := Population.fanOutBegin (← input.getObjValAs? String "commandId") root (← input.getObjValAs? Nat "budget")
  let (_, answers) ← (← input.getObjValAs? (Array Json) "ops").toList.foldlM (init := (machine, ([] : List Json)))
    fun (machine, answers) op => do
      let (next, answer) ← fanOutOp machine op
      pure (next, answers ++ [answer])
  pure (Json.arr answers.toArray)

/-- `linearizeReceivers` over `{waiting: [{processInstanceId, occurrences}], starts: [{deploymentId, receivers}]}`. -/
def linearizedAnswer (input : Json) : Except String Json := do
  let waiting ← (← input.getObjValAs? (Array Json) "waiting").toList.mapM fun entry => do
    pure (← entry.getObjValAs? String "processInstanceId",
      ← (← entry.getObjValAs? (Array Json) "occurrences").toList.mapM Codec.occurrenceFromJson)
  let starts ← (← input.getObjValAs? (Array Json) "starts").toList.mapM fun entry => do
    pure (← entry.getObjValAs? Nat "deploymentId", ← (← entry.getObjValAs? (Array Json) "receivers").toList.mapM receiverFromJson)
  pure (Json.arr ((Population.linearizeReceivers waiting starts).map receiverJson).toArray)

/-- `signalReceiversOf` an instance's state for `{address, emitter}`, `emitter` nullable. -/
def signalReceiversAnswer (program : Program) (state : State) (input : Json) : Except String Json := do
  let address ← Codec.signalAddressFromJson (← input.getObjVal? "address")
  let emitter ← nullableAt input "emitter" (·.getStr?)
  pure (Json.arr ((Population.signalReceiversOf program state address emitter).map referenceJson).toArray)

/-- Each of `targets` reached in turn with the broadcast `{address, variables, atMs}`, a committed reach advancing the
state: `{skipped: true}`, `{outcome: "committed"}` or the failure's `{outcome, code}`. -/
def reachAnswers (hooks : Hooks) (program : Program) (state : State) (input : Json) : Except String Json := do
  let address ← Codec.signalAddressFromJson (← input.getObjVal? "address")
  let variables ← Codec.bindingsAt input "variables"
  let atMs ← input.getObjValAs? Nat "atMs"
  let targets ← (← input.getObjValAs? (Array Json) "targets").toList.mapM Codec.occurrenceFromJson
  let (_, answers) := targets.foldl (init := (state, ([] : List Json))) fun (state, answers) target =>
    match Population.reachOccurrence hooks program state address variables target atMs with
    | .skipped => (state, answers ++ [Json.mkObj [("skipped", Json.bool true)]])
    | .stepped (.ok next) => (next, answers ++ [Json.mkObj [("outcome", "committed")]])
    | .stepped (.error failure) => (state, answers ++ [Json.mkObj (failureFields failure)])
  pure (Json.arr answers.toArray)

/-- `messageReceivers` of an instance's state for a `publication`: each reached occurrence with its channel. -/
def messageReceiversAnswer (hooks : Hooks) (program : Program) (state : State) (input : Json) : Except String Json := do
  let publication ← publicationFromJson (← input.getObjVal? "publication")
  pure (Json.arr ((Population.messageReceivers hooks program state publication).map fun (ref, channel) =>
    Json.mkObj [("occurrence", referenceJson ref), ("channel", Codec.channelToJson channel)]).toArray)

/-- `messageStartCandidates` of a program for the address of a `publication`: each start with its channel. -/
def startCandidatesAnswer (program : Program) (input : Json) : Except String Json := do
  let publication ← publicationFromJson (← input.getObjVal? "publication")
  pure (Json.arr ((Population.messageStartCandidates program publication.message).map fun (startEvent, channel) =>
    Json.mkObj [("startEvent", Json.str startEvent.value), ("channel", Codec.channelToJson channel)]).toArray)

/-- `conditionalStartVerdict` over a Conditional start input `{instanceId, startEvent, variables, businessKey, atMs}`:
`{holds}` or the failure's `{outcome, code}`. -/
def conditionalVerdictAnswer (hooks : Hooks) (program : Program) (input : Json) : Except String Json := do
  let start : StartInput := {
    instanceId := ← input.getObjValAs? String "instanceId", startEvent := some ⟨← input.getObjValAs? String "startEvent"⟩
    variables := ← Codec.bindingsAt input "variables", trigger := .condition
    businessKey := ← nullableAt input "businessKey" (·.getStr?), atMs := some (← input.getObjValAs? Nat "atMs") }
  pure <| match Population.conditionalStartVerdict hooks program start with
    | .ok holds => Json.mkObj [("holds", Json.bool holds)]
    | .error failure => Json.mkObj (failureFields failure)

/-- `timerStartCheck` over each program's summary registered as `registry` states it (`{deploymentId, versions,
deployedAtMs}`, in program order), for each of `checks` (`{deploymentId, startEvent, dueMs, atMs, consumed}`). -/
def timerChecks (programs : List Program) (input : Json) : Except String Json := do
  let entries ← input.getObjValAs? (Array Json) "registry"
  unless entries.size == programs.length do throw "fixture-deployment-count"
  let registry ← (programs.zip entries.toList).mapM fun (program, entry) => do
    pure { Population.deploymentSummary program with
      deploymentId := ← entry.getObjValAs? Nat "deploymentId", versions := ← entry.getObjValAs? (List (String × Nat)) "versions"
      deployedAtMs := ← entry.getObjValAs? Nat "deployedAtMs" }
  let answers ← (← input.getObjValAs? (Array Json) "checks").toList.mapM fun check => do
    pure (nullable (Population.timerStartCheck registry (← check.getObjValAs? Nat "deploymentId")
      (← check.getObjValAs? String "startEvent") (← check.getObjValAs? Nat "dueMs") (← check.getObjValAs? Nat "atMs")
      (← check.getObjValAs? Bool "consumed")) Json.str)
  pure (Json.arr answers.toArray)

/-- The identity of an instance a population start creates, `startedInstanceId`, or `cascadeInstanceId` when
`emitter`, the throw's occurrence, is not null. -/
def instanceIdAnswer (input : Json) : Except String Json := do
  let commandId ← input.getObjValAs? String "commandId"
  let deploymentId ← input.getObjValAs? Nat "deploymentId"
  let startEvent ← input.getObjValAs? String "startEvent"
  pure <| Json.str <| match ← nullableAt input "emitter" Codec.occurrenceFromJson with
    | some emitter => Population.cascadeInstanceId commandId deploymentId startEvent emitter
    | none => Population.startedInstanceId commandId deploymentId startEvent

end Kernel.Run
