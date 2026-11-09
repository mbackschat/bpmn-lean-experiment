/**
 * The one generic Workflow that hosts a process instance on the kernel. It holds the kernel state, applies every
 * input through the kernel's `step`, and drives timers and Activities from the host view alone; it never interprets
 * BPMN. Temporal facts (Run IDs, Workflow Tasks, Activity attempts, retries, Event History) never reach the kernel:
 * an Activity's transport failures are retried by Temporal, and only its business result becomes an input.
 *
 * Inputs arrive as Updates whose validators run the kernel on the current state, so a rejected input is refused
 * before it enters Event History and never changes state. Host arrivals (a due timer, an Activity's result) are
 * queued as they resolve and applied one at a time in that recorded order (`nextArrival`), which is the schedule the
 * kernel sees; one that the kernel rejects is stale (its wait closed first) and is dropped.
 *
 * Under durable scheduling every input the host applies carries Workflow time in epoch milliseconds as its logical time,
 * which absolute Date and Cron Timers need; the kernel advances its clock to it. A caller's stimulus that states its own
 * time is refused (`hostOwnsLogicalTime`) rather than overridden. Under external scheduling the caller's stimuli keep
 * the logical times they state, since a scenario's times are its explicit inputs.
 *
 * The Run continues as new once its history reaches the budget derived from the program's requirements: it stops
 * starting Activities, waits until none is in flight, no arrival is queued and every Update handler has finished,
 * and carries `{program, state, publication cursor}`. Durable timers do not cross Runs; the next Run re-arms them
 * from the carried state at their remaining logical delay.
 *
 * Under a correlation scope the instance registers its open correlated waits with the ingress of their address
 * (`correlation.ts`) whenever they change, one Activity at a time from the main loop, and clears them when it ends or
 * halts. That registration is a barrier: an input's Update returns only once the waits its commit opened are
 * registered, and a start's caller waits on the `settle` Update, so a publication sent after the caller saw the commit
 * finds them. The `correlationMatches` query answers which open waits a delivery would reach now.
 */
import {
  ApplicationFailure,
  CancellationScope,
  allHandlersFinished,
  condition,
  continueAsNew,
  isCancellation,
  scheduleActivity,
  setHandler,
  sleep,
  workflowInfo,
  type ActivityOptions,
} from "@temporalio/workflow";

import {
  ArrivalKind,
  applyInput,
  arrivalCommandId,
  arrivalInput,
  assertNever,
  clockStimulus,
  historyBudget,
  hostOwnsLogicalTime,
  nextArrival,
  planHost,
  timerDelayMs,
  type Applied,
  type Arrival,
} from "./host-machine.js";
import { afterRegistration, correlatedWaits, registrationsDue, type ChannelWaits, type Registered } from "./correlation.js";
import { Route, type DecodedStimulus, type EffectResult, type HostView, type JsonValue, type KernelPort } from "./port.js";
import {
  RunKind,
  ResultKind,
  Scheduling,
  commandUpdate,
  correlationQuery,
  deliverUpdate,
  effectResultUpdate,
  hostViewQuery,
  observationQuery,
  publicationQuery,
  rejectionType,
  settleUpdate,
  timerFireUpdate,
  type CommandResult,
  type Halt,
  type HostActivities,
  type HostConfig,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
import { appendJournal, initialCursor, openLog, readPage } from "./publication.js";

/** The kernel's status name for an instance that has not ended (`Kernel.Publish.statusName`). */
const running = "running";

/** Transport retries only: unbounded, since a CIB-visible failure is a returned result, never an exhausted retry. */
const transportRetry = {
  initialInterval: "1s",
  backoffCoefficient: 2,
  maximumInterval: "1m",
} satisfies NonNullable<ActivityOptions["retry"]>;

function rejection(code: string): ApplicationFailure {
  return ApplicationFailure.create({ message: code, type: rejectionType, nonRetryable: true });
}

/** Whether the host itself submits the inputs of `route` under `scheduling`. */
function hostScheduled(route: Route, scheduling: Scheduling): boolean {
  switch (route) {
    case Route.TimerFire:
    case Route.EffectResult:
      return scheduling === Scheduling.Durable;
    case Route.Start:
    case Route.Command:
    case Route.Deliver:
      return false;
  }
  return assertNever(route);
}

function commandResult(applied: Applied<unknown>, revision: number): CommandResult {
  return applied.committed
    ? { outcome: "committed", code: null, revision }
    : { outcome: applied.outcome, code: applied.code, revision };
}

export function createRunProcess<P, S, I>(port: KernelPort<P, S, I>): (args: RunProcessArgs) => Promise<ProcessResult> {
  return (args) => hostProcess(port, args);
}

async function hostProcess<P, S, I>(port: KernelPort<P, S, I>, args: RunProcessArgs): Promise<ProcessResult> {
  const config: HostConfig = args.config;
  const program = port.decodeProgram(args.program);
  const refusal = port.admit(program);
  if (refusal !== null) return { kind: ResultKind.Refused, code: refusal };
  const budget = historyBudget(port.requirements(program), config.historyEventBudget);
  const durable = config.scheduling === Scheduling.Durable;
  /** The stimulus as the kernel receives it, `null` when it states a time the host owns. */
  const timed = (stimulus: JsonValue): JsonValue | null => durable ? clockStimulus(stimulus, Date.now()) : stimulus;

  /** The committed state and its host view; `null` until a start commits. */
  let instance: { readonly state: S; readonly view: HostView } | null = null;
  let log = openLog(args.kind === RunKind.Start ? initialCursor : args.cursor);
  let halt: Halt | null = null;
  let commits = 0;
  const correlationScope = args.correlationScope;
  /** What the ingresses hold for this chain; a continued Run carries it. */
  let registered: readonly Registered[] = args.kind === RunKind.Continue ? args.registered : [];
  const ended = (): boolean => instance === null || instance.view.status !== running;
  /** The registrations the instance still owes its ingresses; an ended or halted instance owes the clearing of all. */
  const registrationsOwed = (): Registered[] => {
    if (correlationScope === null) return [];
    const desired: ReadonlyMap<string, ChannelWaits> = halt === null ? correlatedWaits(instance?.view ?? null) : new Map();
    return registrationsDue(desired, registered);
  };
  /** The registration barrier: resolves once the waits committed so far are registered, or nothing will register them. */
  const settled = async (): Promise<void> => {
    if (registrationsOwed().length > 0) await condition(() => registrationsOwed().length === 0 || halt !== null || ended());
  };

  setHandler(observationQuery, () =>
    instance === null ? null : port.observation(program, instance.state));
  setHandler(hostViewQuery, () =>
    ({ revision: log.cursor.revision, view: instance?.view ?? null, halt, registering: registrationsOwed().length > 0 }));
  setHandler(publicationQuery, (afterRevision, limit) => readPage(log, afterRevision, limit));
  setHandler(correlationQuery, (question) => instance === null || halt !== null ? []
    : port.matching(program, instance.state, question.channel, question.correlation));
  setHandler(settleUpdate, async () => {
    await settled();
    return log.cursor.revision;
  });

  const commit = (commandId: string, input: I): Applied<S> => {
    const applied = applyInput(port, program, instance?.state ?? null, input);
    if (applied.committed) {
      instance = { state: applied.state, view: applied.view };
      log = appendJournal(log, commandId, applied.view.journal);
      commits += 1;
    }
    return applied;
  };

  if (args.kind === RunKind.Start) {
    const start = timed(args.start);
    if (start === null) return { kind: ResultKind.NotStarted, outcome: "rejected", code: hostOwnsLogicalTime };
    const decoded = port.decodeStimulus(start);
    if (port.route(decoded.input) !== Route.Start) {
      throw ApplicationFailure.create({ message: "the start argument is not a start stimulus", nonRetryable: true });
    }
    const started = commit(decoded.commandId, decoded.input);
    if (!started.committed) return { kind: ResultKind.NotStarted, outcome: started.outcome, code: started.code };
  } else {
    const state = port.decodeState(args.state);
    instance = { state, view: port.hostView(program, state) };
  }

  /** The decoded input an Update may carry, or the refusal its validator throws. */
  const admitted = (route: Route, stimulus: JsonValue): DecodedStimulus<I> => {
    if (halt !== null) throw rejection("host-halted");
    if (hostScheduled(route, config.scheduling)) throw rejection("host-scheduled-input");
    const clocked = timed(stimulus);
    if (clocked === null) throw rejection(hostOwnsLogicalTime);
    let decoded: DecodedStimulus<I>;
    try {
      decoded = port.decodeStimulus(clocked);
    } catch (error) {
      throw rejection(`malformed-stimulus: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (port.route(decoded.input) !== route) throw rejection("wrong-update");
    return decoded;
  };

  const updates = [
    [commandUpdate, Route.Command],
    [deliverUpdate, Route.Deliver],
    [timerFireUpdate, Route.TimerFire],
    [effectResultUpdate, Route.EffectResult],
  ] as const;
  for (const [update, route] of updates) {
    setHandler(update, async (stimulus) => {
      const { commandId, input } = admitted(route, stimulus);
      const result = commandResult(commit(commandId, input), log.cursor.revision);
      await settled();
      return result;
    }, {
      validator: (stimulus) => {
        const verdict = port.step(program, instance?.state ?? null, admitted(route, stimulus).input);
        if (!verdict.committed && verdict.rejected) throw rejection(verdict.code);
      },
    });
  }

  const activityOptions = (activityId: string): ActivityOptions =>
    ({ activityId, startToCloseTimeout: config.effectStartToCloseMs, retry: transportRetry });

  /** Registers what the instance owes its ingresses, one channel at a time, each at the current publication revision. */
  const register = async (): Promise<void> => {
    if (correlationScope === null) return;
    for (;;) {
      const [next] = registrationsOwed();
      if (next === undefined) return;
      const registration = { workflowId: workflowInfo().workflowId, revision: log.cursor.revision, waits: next.waits };
      await scheduleActivity<void>("registerCorrelation" satisfies keyof HostActivities,
        [{ correlationScope, channel: next.channel, registration }],
        { startToCloseTimeout: config.effectStartToCloseMs, retry: transportRetry });
      registered = afterRegistration(registered, next);
    }
  };
  const timers = new Map<string, CancellationScope>();
  const effects = new Map<string, CancellationScope>();
  const arrivals: Arrival[] = [];

  /** Owns `work` under `key` until its arrival is applied or it is withdrawn; a withdrawn scope's outcome is dropped. */
  const own = <T>(owned: Map<string, CancellationScope>, key: string, work: () => Promise<T>, arrive: (value: T) => Arrival) => {
    const scope = new CancellationScope();
    owned.set(key, scope);
    scope.run(work).then(
      (value) => { if (owned.get(key) === scope) arrivals.push(arrive(value)); },
      (error: unknown) => {
        if (owned.get(key) !== scope || isCancellation(error)) return;
        // Only a non-retryable Activity failure gets here (a host refusal, such as a Script language admission
        // should have refused): no input exists for it, so the schedule halts.
        halt ??= { commandId: `host:${key}`, outcome: "hostFailure", code: error instanceof Error ? error.message : String(error) };
      },
    );
  };

  const reconcile = (draining: boolean): void => {
    if (!durable || instance === null) return;
    const plan = planHost(instance.view, { timers: new Set(timers.keys()), effects: new Set(effects.keys()) },
      (wait) => port.scriptOf(program, wait), !draining);
    for (const key of plan.cancelTimers) { timers.get(key)?.cancel(); timers.delete(key); }
    for (const key of plan.cancelEffects) { effects.get(key)?.cancel(); effects.delete(key); }
    for (const { key, timer, deadlineMs } of plan.armTimers) {
      own(timers, key, () => sleep(timerDelayMs(deadlineMs, Date.now())),
        () => ({ kind: ArrivalKind.Timer, key, timer, deadlineMs }));
    }
    for (const request of plan.startEffects) {
      own(effects, request.key, () => scheduleActivity<EffectResult>("executeEffect" satisfies keyof HostActivities,
        [request], activityOptions(request.key)),
        (result) => ({ kind: ArrivalKind.Effect, key: request.key, effect: request.occurrence, result }));
    }
    for (const request of plan.evaluateScripts) {
      own(effects, request.key, () => scheduleActivity<EffectResult>("evaluateScript" satisfies keyof HostActivities,
        [request], activityOptions(request.key)),
        (result) => ({ kind: ArrivalKind.Effect, key: request.key, effect: request.occurrence, result }));
    }
  };

  const ownerOf = (arrival: Arrival): Map<string, CancellationScope> => {
    switch (arrival.kind) {
      case ArrivalKind.Timer: return timers;
      case ArrivalKind.Effect: return effects;
    }
    return assertNever(arrival);
  };

  // A Run rolls over only after committing an input, so a budget below a fresh Run's own history cannot chain Runs
  // that make no progress.
  const rolloverDue = (): boolean =>
    commits > 0 && (workflowInfo().historyLength >= budget || workflowInfo().continueAsNewSuggested);
  let reconciled = -1;
  for (;;) {
    if (ended() || halt !== null) break;
    const draining = rolloverDue();
    if (reconciled !== commits || draining) {
      reconcile(draining);
      reconciled = commits;
    }
    await register();
    if (reconciled !== commits) continue;
    if (draining && effects.size === 0 && arrivals.length === 0) {
      await condition(allHandlersFinished);
      if (arrivals.length === 0 && halt === null && instance !== null && !ended()) {
        return continueAsNew<(next: RunProcessArgs) => Promise<ProcessResult>>({
          kind: RunKind.Continue,
          program: args.program,
          config,
          correlationScope,
          state: port.encodeState(instance.state),
          cursor: log.cursor,
          registered,
        });
      }
    }
    await condition(() => arrivals.length > 0 || commits !== reconciled || halt !== null ||
      (draining ? effects.size === 0 : rolloverDue()));
    while (arrivals.length > 0 && halt === null && !ended()) {
      const [arrival] = arrivals.splice(nextArrival(arrivals), 1);
      if (arrival === undefined) break;
      ownerOf(arrival).delete(arrival.key);
      const commandId = arrivalCommandId(arrival);
      const applied = commit(commandId, arrivalInput(port, arrival, Date.now()));
      if (!applied.committed && !applied.rejected) halt = { commandId, outcome: applied.outcome, code: applied.code };
    }
  }

  for (const scope of [...timers.values(), ...effects.values()]) scope.cancel();
  await register();
  await condition(allHandlersFinished);
  if (halt !== null) return { kind: ResultKind.Halted, halt, revision: log.cursor.revision };
  return { kind: ResultKind.Ended, status: instance?.view.status ?? running, revision: log.cursor.revision };
}
