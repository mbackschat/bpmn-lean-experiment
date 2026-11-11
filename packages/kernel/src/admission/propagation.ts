/** Admission of throw Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import {
  ExpressionTag, MappingDialect, MessageThrowForms, SignalPayload, ThrowTag, ValueSourceTag, assertNever, type Expression,
  type Mapping, type MessageThrow, type ProfileOptions, type QName, type SignalThrow, type SignalTrigger, type Throw, type ValueSource,
} from "../il/types.js";

/**
 * What a throw's admission asks of its site, which the registry fills from the other admissions at that site: a Signal
 * address's refusal (`admission/subscriptions.ts#signalAddress`, the one rule catches, starts and throws share), an
 * Events-level expression's refused as the given code, its mappings' refusal, and a delegate token's
 * (`admission/work.ts#handlerKey`, CIB-LIM-0017).
 */
export interface ThrowSite {
  readonly signalAddress: (signalRef: QName | null, name: ValueSource | null) => string | null;
  readonly eventsExpression: (refusal: string, expression: Expression) => string | null;
  readonly mappings: (list: readonly Mapping[]) => string | null;
  readonly handlerKey: (token: string | null) => string | null;
}

/** A CIB business key expression: a String literal, else read at the Events level. */
function businessKey(site: ThrowSite, expression: Expression): string | null {
  return expression.tag === ExpressionTag.Literal ? null : site.eventsExpression("throw.signal.businessKey", expression);
}

/**
 * A Signal throw (PC-SIGNAL-01). The `camunda:in` copies and business key are CIB's (CIB-EXT-0040), admitted with the
 * Signal payload CIB installs (`SignalPayload.Variables`), refused where a Signal carries no data (BPMN 2.0.2 §10.5.1).
 * Refused under every profile: `camunda:async`, whose delivery runs in separate jobs; `local="true"`, whose locals
 * depend on CIB's execution tree; and Data Input Associations, which CIB never executes.
 */
function signalThrow(options: ProfileOptions, site: ThrowSite, record: SignalThrow): string | null {
  if (record.asynchronous) return "throw.signal.asynchronous";
  if (record.localOnly) return "throw.signal.localVariables";
  if (record.payload.some((entry) => entry.dialect === MappingDialect.DataAssociation)) return "throw.signal.dataInput";
  const carried = ((): string | null => {
    switch (options.signalPayload) {
      case SignalPayload.None:
        if (record.payload.length > 0 || record.propagateAll !== null) return "throw.signal.payload";
        return record.businessKey === null ? null : "throw.signal.businessKey";
      case SignalPayload.Variables:
        return null;
    }
    return assertNever(options.signalPayload);
  })();
  return carried ?? site.signalAddress(record.signalRef, record.name) ?? site.mappings(record.payload) ??
    (record.businessKey === null ? null : businessKey(site, record.businessKey));
}

/**
 * A Message throw (PC-MESSAGE-09). BPMN 2.0.2 Tables 10.88 and 10.89 send a Message and name no transport, so the
 * standards profile refuses it bound, by a CIB handler attribute, or unbound, where passing on would drop the send;
 * `MessageThrowForms.CibForms` runs both of CIB's forms (CIB-EXT-0039, CIB-INT-0027). Its Data Input Associations are
 * refused under every profile: CIB never executes them. CIB resolves a bound throw's delegate token as a Service Task's,
 * so a declared name equal to it is refused as one (CIB-LIM-0017).
 */
function messageThrow(options: ProfileOptions, site: ThrowSite, record: MessageThrow): string | null {
  if (record.payload.length > 0) return "throw.message.payload";
  switch (options.messageThrowForms) {
    case MessageThrowForms.Refused:
      return record.binding === null ? "throw.message.unbound" : "throw.message.bound";
    case MessageThrowForms.CibForms:
      return site.handlerKey(record.handlerKey);
  }
  return assertNever(options.messageThrowForms);
}

/**
 * `inTransaction` says whether the throw's parent is a Transaction: a Cancel End is used only within a Transaction
 * Sub-Process (BPMN 2.0.2 §10.3.5, §10.5.5 Cancel Event; `BpmnParse#parseEndEvents` refuses it elsewhere) (PC-TX-02).
 */
export function throwRecord(options: ProfileOptions, site: ThrowSite, inTransaction: boolean, thrown: Throw): string | null {
  switch (thrown.tag) {
    case ThrowTag.None:
    case ThrowTag.Escalation:
    case ThrowTag.Terminate:
      return null;
    case ThrowTag.Cancel:
      return inTransaction ? null : "throw.cancel.outsideTransaction";
    case ThrowTag.Error:
      return thrown.payload.message !== null && thrown.payload.message.tag === ValueSourceTag.Expression
        ? "throw.error.message"
        : null;
    case ThrowTag.Message:
      return messageThrow(options, site, thrown.payload);
    case ThrowTag.Signal:
      return signalThrow(options, site, thrown.payload);
    case ThrowTag.Compensation:
      if (thrown.payload.activity !== null) return "throw.compensation.activity";
      if (!thrown.payload.waitForCompletion) return "throw.compensation.asynchronous";
      return null;
  }
  return assertNever(thrown);
}

/**
 * What other admissions read of a throw: whether it terminates its scope or throws Compensation, and the Signal it
 * references, whose name `admission/subscriptions.ts#signalDefinitionNames` compares.
 */
export type Reading = Readonly<{ terminates: boolean; compensates: boolean; signal: SignalTrigger | null }>;

export function reading(thrown: Throw): Reading {
  const none: Reading = { terminates: false, compensates: false, signal: null };
  switch (thrown.tag) {
    case ThrowTag.Terminate:
      return { ...none, terminates: true };
    case ThrowTag.Compensation:
      return { ...none, compensates: true };
    case ThrowTag.Signal:
      return { ...none, signal: { signalRef: thrown.payload.signalRef, name: thrown.payload.name } };
    case ThrowTag.None:
    case ThrowTag.Message:
    case ThrowTag.Error:
    case ThrowTag.Escalation:
    case ThrowTag.Cancel:
      return none;
  }
  return assertNever(thrown);
}
