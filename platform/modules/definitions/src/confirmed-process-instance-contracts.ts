import type {
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

export const ConfirmedProcessInstanceState = {
  Reserved: "reserved",
  Starting: "starting",
  Indeterminate: "indeterminate",
  Confirmed: "confirmed",
  IntegrityFailure: "integrityFailure",
} as const;

export type ConfirmedProcessInstanceState =
  typeof ConfirmedProcessInstanceState[
    keyof typeof ConfirmedProcessInstanceState
  ];

export type ConfirmedProcessInstancePublication = Readonly<{
  instance: PublicProcessInstanceIdentity;
  /** Product 1's serialized opaque locator. It is never a public wire field. */
  locator: string;
}>;

export type DirectProcessInstanceIntent = Readonly<{
  protocol: string;
  intentSha256: string;
}>;

export type DirectProcessInstanceReservation =
  ConfirmedProcessInstancePublication & Readonly<{
    intent: DirectProcessInstanceIntent;
    startCommandBytes: Uint8Array;
  }>;

export type ConfirmedProcessInstanceRecord =
  ConfirmedProcessInstancePublication & Readonly<{
    intent: DirectProcessInstanceIntent | null;
    startCommandBytes: Uint8Array | null;
    state: ConfirmedProcessInstanceState;
    operatePending: boolean;
    workPending: boolean;
  }>;

export type ConfirmedProcessInstanceReservationResult = Readonly<{
  inserted: boolean;
  record: ConfirmedProcessInstanceRecord;
}>;

export type ConfirmedProcessInstanceSubscriber = "operate" | "work";

/** Atomic persistence operations. No method spans a subscriber or host await. */
export interface ConfirmedProcessInstanceRepository {
  confirm(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<ConfirmedProcessInstanceReservationResult>;
  reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): Promise<ConfirmedProcessInstanceReservationResult>;
  get(processInstanceId: string): Promise<ConfirmedProcessInstanceRecord | null>;
  listForReconciliation(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>>;
  listConfirmed(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>>;
  compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): Promise<ConfirmedProcessInstanceRecord | null>;
  acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): Promise<ConfirmedProcessInstanceRecord | null>;
}

/** Operate receives the exact public identity plus Product 1's opaque locator. */
export interface ConfirmedProcessInstanceOperateSubscriber {
  recordConfirmedProcessInstance(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<void>;
}

/** Work subscriber receives the exact public identity plus private opaque locator. */
export interface ConfirmedProcessInstanceWorkSubscriber {
  recordConfirmedProcessInstance(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<void>;
}

/** Product 1 owns locator minting; Definitions persists only its opaque wire value. */
export interface ProcessWorkLocatorFactory {
  canonicalLocator(processInstanceId: string): string;
}

export type DirectProcessInstanceDescription = Readonly<{
  status: "matching" | "missing" | "divergent" | "unavailable";
}>;

export type DirectProcessInstanceDispatchResult =
  | Readonly<{ status: "started" }>
  | Readonly<{
      status: "rejected" | "integrityFailure";
      evidence: string;
    }>;

/** Product 1 start/describe capability over one already persisted exact intent. */
export interface DirectProcessInstanceHost {
  start(
    reservation: DirectProcessInstanceReservation,
  ): Promise<DirectProcessInstanceDispatchResult>;
  describe(
    reservation: DirectProcessInstanceReservation,
  ): Promise<DirectProcessInstanceDescription>;
}

export class ConfirmedProcessInstanceIntegrityError extends Error {
  readonly processInstanceId: string;

  constructor(processInstanceId: string) {
    super(`confirmed Process instance ${processInstanceId} failed integrity validation`);
    this.name = "ConfirmedProcessInstanceIntegrityError";
    this.processInstanceId = processInstanceId;
  }
}

export class ConfirmedProcessInstanceStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored confirmed Process instance is invalid", { cause });
    this.name = "ConfirmedProcessInstanceStoredValueError";
  }
}
