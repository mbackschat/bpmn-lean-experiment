/**
 * What the hosted engine refuses although the kernel executes it: the stable `host.` code the engine API answers with,
 * what it refuses, the bound it enforces and the open issue that tracks it ([kernel status map, Host
 * restrictions](../docs/kernel/KERNEL-STATUS-MAP.md#host-restrictions)).
 *
 * Product 2 may not import the host, so each limit restates its value from `chainCapacity` in
 * `packages/temporal-host/src/capacity.ts` under that table's key. `packages/engine-api/test/host-restriction-disclosures.test.ts`
 * fails when a value differs, when a refused capacity bound or a status-map host restriction has no row here, or when a
 * row names a code neither of them holds.
 */
export const HostLimitUnit = {
  Bytes: "bytes",
  Count: "count",
} as const;

export type HostLimitUnit = typeof HostLimitUnit[keyof typeof HostLimitUnit];

export type HostLimit = Readonly<{
  /** The `chainCapacity` key the value restates. */
  capacity: string;
  value: number;
  unit: HostLimitUnit;
}>;

export type HostRestriction = Readonly<{
  code: string;
  restriction: string;
  limit: HostLimit | null;
  issue: number;
}>;

const KiB = 1_024;
const capacityIssue = 125;

const bytes = (capacity: string, value: number): HostLimit => Object.freeze({ capacity, value, unit: HostLimitUnit.Bytes });
const count = (capacity: string, value: number): HostLimit => Object.freeze({ capacity, value, unit: HostLimitUnit.Count });
const restriction = (code: string, text: string, limit: HostLimit | null, issue: number): HostRestriction =>
  Object.freeze({ code, restriction: text, limit, issue });

export const hostRestrictions: ReadonlyArray<HostRestriction> = Object.freeze([
  restriction("host.capacity.program", "A deployment or start whose compiled process program exceeds the limit; nothing starts.", bytes("programBytes", 192 * KiB), capacityIssue),
  restriction("host.capacity.start", "A start whose input data exceeds the limit; nothing starts.", bytes("startBytes", 64 * KiB), capacityIssue),
  restriction("host.capacity.stimulus", "An input to a running instance, such as a task completion or a Message, whose data exceeds the limit; it is refused before it is applied.", bytes("stimulusBytes", 64 * KiB), capacityIssue),
  restriction("host.capacity.state", "A step that would leave the instance's committed state, its variables and open work, larger than the limit; the step commits nothing.", bytes("stateBytes", 256 * KiB), capacityIssue),
  restriction("host.capacity.publicationBatch", "A step whose execution and occurrence records together exceed the limit, such as a long automatic burst; the step commits nothing.", bytes("publicationBatchBytes", 64 * KiB), capacityIssue),
  restriction("host.capacity.pendingActivities", "A step that would leave more service work pending at once than the limit.", count("pendingActivities", 32), capacityIssue),
  restriction("host.capacity.pendingTimers", "A step that would leave more Timers waiting at once than the limit.", count("pendingTimers", 64), capacityIssue),
  restriction("host.capacity.effectRequest", "A step whose request to one piece of service work exceeds the limit.", bytes("effectRequestBytes", 64 * KiB), capacityIssue),
  restriction("host.capacity.effectResult", "A service-work result larger than the limit: the work fails without retry, and such a result that still arrives halts the instance.", bytes("effectResultBytes", 64 * KiB), capacityIssue),
  restriction("host.capacity.effectFailure", "A service-work failure message longer than the limit: the instance halts with this code in place of the message.", bytes("effectFailureBytes", 16 * KiB), capacityIssue),
  restriction("host.capacity.continuation", "Instance data carried into the next Workflow Run beyond the limit: the step that would need it is refused, and an instance that would exceed it when it continues halts. While a Signal hand-off waits for room in the population's own carried state, every new population command is refused; a Timer start refused that way is not retried, so that occurrence does not start.", bytes("continuationBytes", 448 * KiB), capacityIssue),
  restriction("host.capacity.runs", "An instance that needs more Workflow Runs than the limit halts.", count("runs", 128), capacityIssue),
  restriction("host.capacity.updates", "A command to an instance whose current Workflow Run already accepted the limit's number of commands; it is refused until the instance continues in its next Run.", count("updatesPerRun", 1_500), capacityIssue),
  restriction("host.capacity.updatesInFlight", "A command to an instance while the limit's number of commands to it are still in progress.", count("updatesInFlight", 8), capacityIssue),
  restriction("host.population.fanOutCapacity", "A Signal or other fan-out to several instances stops at the receiver whose answer would exceed the limit; a cascade of Signal starts reaches it early (#126).", bytes("queryBytes", 192 * KiB), capacityIssue),
  restriction("host.call.crossDeployment", "A Call that only a process of another deployment answers: the host compiles each deployment's own document. A Call that no deployment answers keeps the kernel's work.call.calledProcessMissing.", null, 94),
]);
