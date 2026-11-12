/** Admission of throw Events, transcribed from `Kernel/Admission/Propagation.lean`. A refusal carries a stable code. */
import {
  CompensationReferenceScope, ExpressionTag, MappingDialect, MessageThrowForms, SignalPayload, ThrowTag, ValueSourceTag, assertNever,
  type ElementId, type Expression,
  type Mapping, type MessageThrow, type ProfileOptions, type QName, type SignalThrow, type Throw, type ValueSource,
} from "../il/types.js";

/**
 * Where a Compensation throw's `activityRef` names an element: at the throw's own level or, from inside a Compensation
 * Event Sub-Process, at its parent's level, where BPMN 2.0.2 Tables 10.88 and 10.89 make it visible; at the parent's
 * level of another kind of Event Sub-Process; or elsewhere.
 */
export enum ReferenceLevel {
  Visible = "visible",
  EventSubProcessParent = "eventSubProcessParent",
  Elsewhere = "elsewhere",
}

/** The element a Compensation throw names: where it lies, and whether it is an Activity. */
export interface Reference {
  readonly level: ReferenceLevel;
  readonly activity: boolean;
}

/**
 * What a throw's admission asks of its site, which the registry fills from the other admissions at that site: a Signal
 * address's refusal (`admission/subscriptions.ts#signalAddress`, the one rule catches, starts and throws share), an
 * Events-level expression's refused as the given code, its mappings' refusal, a delegate token's
 * (`admission/work.ts#handlerKey`, CIB-LIM-0017), and where a Compensation throw's reference lies.
 */
export interface ThrowSite {
  readonly signalAddress: (signalRef: QName | null, name: ValueSource | null) => string | null;
  readonly eventsExpression: (refusal: string, expression: Expression) => string | null;
  readonly mappings: (list: readonly Mapping[]) => string | null;
  readonly handlerKey: (token: string | null) => string | null;
  readonly reference: (target: ElementId) => Reference;
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
 * so a declared name equal to it is refused as one (CIB-LIM-0017), and a token no binding matched, which the reader
 * carries as an empty operation, as an unbound Service Task is (CIB-LIM-0051).
 */
function messageThrow(options: ProfileOptions, site: ThrowSite, record: MessageThrow): string | null {
  if (record.payload.length > 0) return "throw.message.payload";
  switch (options.messageThrowForms) {
    case MessageThrowForms.Refused:
      return record.binding === null ? "throw.message.unbound" : "throw.message.bound";
    case MessageThrowForms.CibForms:
      if (record.binding !== null && (record.binding.protocol.length === 0 || record.binding.operation.length === 0)) {
        return "throw.message.unboundImplementation";
      }
      return site.handlerKey(record.handlerKey);
  }
  return assertNever(options.messageThrowForms);
}

/**
 * Where a throw sits for a Cancel End: not directly in a Transaction, or directly in one with or without a Cancel
 * boundary.
 */
/**
 * A Compensation throw's `activityRef` names an Activity visible from the throw (BPMN 2.0.2 §10.7.2, Table 10.94,
 * Tables 10.88 and 10.89). CIB resolves it from any Event Sub-Process at the parent's level (CIB-EXT-0047), which
 * `CompensationReferenceScope.EventSubProcessParent` admits, and deploys a reference to a non-Activity of the level,
 * which compensates nothing (CIB-EXT-0046); every other reference CIB refuses at deployment (`BpmnParse.java:1695-1720`).
 */
function compensationReference(options: ProfileOptions, reference: Reference): string | null {
  const resolved = reference.activity ? null : "throw.compensation.notActivity";
  switch (reference.level) {
    case ReferenceLevel.Visible:
      return resolved;
    case ReferenceLevel.EventSubProcessParent:
      switch (options.compensationReferenceScope) {
        case CompensationReferenceScope.EventSubProcessParent:
          return resolved;
        case CompensationReferenceScope.Visible:
          return "throw.compensation.activityLevel";
      }
      return assertNever(options.compensationReferenceScope);
    case ReferenceLevel.Elsewhere:
      return "throw.compensation.activityLevel";
  }
  return assertNever(reference.level);
}

export enum CancelSite {
  Outside = "outside",
  Uncaught = "uncaught",
  Caught = "caught",
}

function cancelRecord(cancelSite: CancelSite): string | null {
  switch (cancelSite) {
    case CancelSite.Outside:
      return "throw.cancel.outsideTransaction";
    case CancelSite.Uncaught:
      return "throw.cancel.uncaught";
    case CancelSite.Caught:
      return null;
  }
  return assertNever(cancelSite);
}

/**
 * What a throw is read for besides its refusal: whether its raise may reach a catcher (an Error, Escalation or Cancel,
 * or a bound Message throw, whose effect may fail with a business Error), whether it begins compensation handlers (a
 * Compensation throw, or a Cancel End, which compensates its Transaction, §10.3.5). What its receivers install is
 * `il/footprint.ts` `writes`'s.
 */
export type Thrown = Readonly<{ refusal: string | null; raises: boolean; compensates: boolean }>;

const nothingThrown: Thrown = { refusal: null, raises: false, compensates: false };

/**
 * `cancelSite` says where the throw sits: a Cancel End is used only within a Transaction Sub-Process (BPMN 2.0.2
 * §10.3.5, §10.5.5 Cancel Event; `BpmnParse#parseEndEvents` refuses it elsewhere), whose Cancel boundary directs the flow
 * after the cancellation (§10.3.5); CIB deploys one without the boundary and rolls back the command that reaches it
 * (CIB-LIM-0043) (PC-TX-02).
 */
export function throwReading(options: ProfileOptions, site: ThrowSite, cancelSite: CancelSite, record: Throw): Thrown {
  switch (record.tag) {
    case ThrowTag.None:
    case ThrowTag.Terminate:
      return nothingThrown;
    case ThrowTag.Escalation:
      return { ...nothingThrown, raises: true };
    case ThrowTag.Cancel:
      return { ...nothingThrown, refusal: cancelRecord(cancelSite), raises: true, compensates: true };
    case ThrowTag.Error:
      return { ...nothingThrown, raises: true,
        refusal: record.payload.message !== null && record.payload.message.tag === ValueSourceTag.Expression ? "throw.error.message" : null };
    case ThrowTag.Message:
      return { ...nothingThrown, refusal: messageThrow(options, site, record.payload), raises: record.payload.binding !== null };
    case ThrowTag.Signal:
      return { ...nothingThrown, refusal: signalThrow(options, site, record.payload) };
    case ThrowTag.Compensation:
      return { ...nothingThrown, compensates: true,
        refusal: (record.payload.activity === null ? null : compensationReference(options, site.reference(record.payload.activity))) ??
          (record.payload.waitForCompletion ? null : "throw.compensation.asynchronous") };
  }
  return assertNever(record);
}

export const throwRecord = (options: ProfileOptions, site: ThrowSite, cancelSite: CancelSite, record: Throw): string | null =>
  throwReading(options, site, cancelSite, record).refusal;
