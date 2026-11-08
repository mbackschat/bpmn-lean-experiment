/**
 * Admission of Activities, transcribed from `Kernel/Admission/Work.lean`. A refusal carries a stable code.
 *
 * Boundaries are admitted by `admission/subscriptions.ts` through the admission registry. Input and output mappings
 * are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs, an
 * effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an
 * effect's result patch); elsewhere `feature/work.ts` would evaluate a mapping and drop its binding.
 */
import {
  CallBindingTag,
  ValueSourceTag,
  WorkTag,
  assertNever,
  type ActivityPayload,
  type CallWork,
  type Envelope,
  type ReceiveWork,
  type ValueSource,
  type Work,
} from "../il/types.js";

export function mapsData(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User:
      return true;
    case WorkTag.Service:
      return true;
    case WorkTag.None:
      return false;
    case WorkTag.Manual:
      return false;
    case WorkTag.Receive:
      return false;
    case WorkTag.Send:
      return false;
    case WorkTag.Script:
      return false;
    case WorkTag.Rule:
      return false;
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

/**
 * The work one instance of a Multi-Instance Activity may do: a User Task (`feature/work.ts` `bodyWait`). The
 * Multi-Instance shape itself is admitted by `admission/multi-instance.ts`.
 */
export function instanceBody(work: Work): boolean {
  switch (work.tag) {
    case WorkTag.User:
      return true;
    case WorkTag.None:
      return false;
    case WorkTag.Manual:
      return false;
    case WorkTag.Receive:
      return false;
    case WorkTag.Service:
      return false;
    case WorkTag.Send:
      return false;
    case WorkTag.Script:
      return false;
    case WorkTag.Rule:
      return false;
    case WorkTag.Call:
      return false;
  }
  return assertNever(work);
}

export function envelope(work: Work, envelope: Envelope): string | null {
  if (envelope.inputs.length !== 0 && !mapsData(work)) {
    return "activity.inputMappings";
  }
  if (envelope.outputs.length !== 0 && !mapsData(work)) {
    return "activity.outputMappings";
  }
  if (envelope.multiInstance !== null && !instanceBody(work)) {
    return "activity.multiInstanceBody";
  }
  // A compensation subject must report its completion (`Signal.completed`), which `feature/work.ts` does for a
  // single User Task or Service Task only.
  if (envelope.compensationHandler !== null && (!mapsData(work) || envelope.multiInstance !== null)) {
    return "activity.compensationHandler";
  }
  return null;
}

export function receive(work: ReceiveWork): string | null {
  if (work.message.correlation.length !== 0) {
    return "work.receive.correlation";
  }
  const name = work.message.name;
  if (name === null) {
    return null;
  }
  switch (name.tag) {
    case ValueSourceTag.Literal:
      return null;
    case ValueSourceTag.Expression:
      return "work.receive.messageExpression";
  }
  return assertNever(name);
}

/**
 * A Call names its called process literally, binds the latest version, carries no business key and maps its data
 * explicitly; its mappings live in `CallWork`, never in the envelope.
 */
export function call(work: CallWork): string | null {
  const calledElement = (): string | null => {
    switch (work.calledElement.tag) {
      case ValueSourceTag.Literal:
        return null;
      case ValueSourceTag.Expression:
        return "work.call.calledElementExpression";
    }
    return assertNever(work.calledElement);
  };
  const binding = (): string | null => {
    switch (work.binding.tag) {
      case CallBindingTag.Latest:
        return null;
      case CallBindingTag.Deployment:
        return "work.call.binding";
      case CallBindingTag.Version:
        return "work.call.binding";
      case CallBindingTag.VersionTag:
        return "work.call.binding";
    }
    return assertNever(work.binding);
  };
  return (
    calledElement() ??
    binding() ??
    (work.businessKey !== null
      ? "work.call.businessKey"
      : work.propagateAllInputs || work.propagateAllOutputs
        ? "work.call.propagateAll"
        : null)
  );
}

function isExpression(source: ValueSource): boolean {
  switch (source.tag) {
    case ValueSourceTag.Literal:
      return false;
    case ValueSourceTag.Expression:
      return true;
  }
  return assertNever(source);
}

export function activity(payload: ActivityPayload): string | null {
  const work = (): string | null => {
    const work = payload.work;
    switch (work.tag) {
      case WorkTag.None:
        return null;
      case WorkTag.Manual:
        return null;
      case WorkTag.User:
        return work.payload.candidateGroups.some(isExpression) ? "work.user.candidateGroupExpression" : null;
      case WorkTag.Receive:
        return receive(work.payload);
      case WorkTag.Service:
        return null;
      case WorkTag.Send:
        return "work.send";
      case WorkTag.Script:
        return "work.script";
      case WorkTag.Rule:
        return "work.rule";
      case WorkTag.Call:
        return call(work.payload);
    }
    return assertNever(work);
  };
  return work() ?? envelope(payload.work, payload.envelope);
}
