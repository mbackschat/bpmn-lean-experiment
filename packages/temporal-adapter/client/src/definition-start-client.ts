/**
 * Handle-free concrete Temporal start boundary for definition deployment consumers.
 *
 * The SDK client and Workflow handle remain inside this package. The opaque token is created only by
 * the lazy concrete runtime and is not a portability interface or a second start contract.
 */
import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  Connection,
  WorkflowClient,
} from "@temporalio/client";

import {
  BpmnProcessStartResultKind,
  startBpmnProcess as startBpmnProcessWithHandle,
} from "./process-client.js";

declare const temporalDefinitionStartClientBrand: unique symbol;

export type TemporalDefinitionStartClient = Readonly<{
  [temporalDefinitionStartClientBrand]: true;
}>;

export type LazyTemporalClientRuntimeOptions = Readonly<{
  address: string;
  namespace: string;
  connectTimeoutMs: number;
}>;

export const TemporalDefinitionStartResultKind = {
  Started: "started",
  Rejected: "rejected",
} as const;

export type TemporalDefinitionStartResultKind =
  typeof TemporalDefinitionStartResultKind[
    keyof typeof TemporalDefinitionStartResultKind
  ];

export type TemporalDefinitionStartResult =
  | Readonly<{
      kind: typeof TemporalDefinitionStartResultKind.Started;
    }>
  | Readonly<{
      kind: typeof TemporalDefinitionStartResultKind.Rejected;
      failure: Readonly<{
        code: string;
        evidence: string;
      }>;
    }>;

/** Owns one lazy, reused SDK connection and its concrete Workflow client. */
export class LazyTemporalClientRuntime {
  readonly client: TemporalDefinitionStartClient;
  readonly #connection: Connection;
  #closePromise: Promise<void> | undefined;

  constructor(options: LazyTemporalClientRuntimeOptions) {
    const snapshot = snapshotOptions(options);
    this.#connection = Connection.lazy({
      address: snapshot.address,
      connectTimeout: snapshot.connectTimeoutMs,
    });
    this.client = new WorkflowClient({
      connection: this.#connection,
      namespace: snapshot.namespace,
    }) as unknown as TemporalDefinitionStartClient;
  }

  /** Returns one shared close operation even when lifecycle owners close repeatedly. */
  close(): Promise<void> {
    this.#closePromise ??= this.#connection.close();
    return this.#closePromise;
  }
}

/** Construction is lazy and performs no server handshake or other network I/O. */
export function createLazyTemporalClientRuntime(
  options: LazyTemporalClientRuntimeOptions,
): LazyTemporalClientRuntime {
  return new LazyTemporalClientRuntime(options);
}

/** Calls the existing production start operation and discards its SDK Workflow handle. */
export async function startBpmnProcessWithoutHandle(
  client: TemporalDefinitionStartClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  options: Readonly<{ taskQueue: string }>,
): Promise<TemporalDefinitionStartResult> {
  const started = await startBpmnProcessWithHandle(
    client as unknown as WorkflowClient,
    start,
    semanticProcess,
    options,
  );
  switch (started.kind) {
    case BpmnProcessStartResultKind.Started:
      return { kind: TemporalDefinitionStartResultKind.Started };
    case BpmnProcessStartResultKind.Rejected:
      return {
        kind: TemporalDefinitionStartResultKind.Rejected,
        failure: {
          code: started.failure.code,
          evidence: started.failure.evidence,
        },
      };
    default:
      return assertNever(started);
  }
}

function snapshotOptions(
  options: LazyTemporalClientRuntimeOptions,
): LazyTemporalClientRuntimeOptions {
  requireNonempty(options.address, "address");
  requireNonempty(options.namespace, "namespace");
  if (
    !Number.isSafeInteger(options.connectTimeoutMs) ||
    options.connectTimeoutMs <= 0
  ) {
    throw new RangeError("connectTimeoutMs must be a positive safe integer");
  }
  return {
    address: options.address,
    namespace: options.namespace,
    connectTimeoutMs: options.connectTimeoutMs,
  };
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal definition start: ${String(value)}`);
}
