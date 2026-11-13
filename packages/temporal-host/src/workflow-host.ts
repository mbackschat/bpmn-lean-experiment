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
 * The Run continues as new once a rollover trigger fires (`capacity.ts`, `rolloverDue`: Event History against the budget
 * derived from the program's requirements and the table's trigger, history bytes, accepted Updates, retained
 * publication): it stops starting Activities, waits until none is in flight, no arrival is queued and every Update
 * handler has finished, and carries `{program, state, publication cursor, run ordinal}`. Durable timers do not cross
 * Runs; the next Run re-arms them from the carried state at their remaining logical delay. A chain needing a Run beyond
 * the table's count, or a carried argument beyond its bound, halts instead.
 *
 * Every committed candidate is first judged against the chain's capacity bounds (`chain-candidate.ts`), so an overflow
 * commits, publishes and starts nothing: a caller's Update is refused in its validator, a population delivery or start
 * fails with the bound's code, and a host arrival halts the chain as an unsupported arrival does.
 *
 * Under a population scope the instance registers its open Message and Signal waits' addresses with the population
 * ingress whenever they change, one Activity at a time from the main loop, and clears them when it ends or halts. That
 * registration is a barrier: an input's Update returns only once the waits its commit opened are registered, and a
 * start's caller waits on the `settle` Update, so a population command sent after the caller saw the commit finds them.
 *
 * The Signals a committed input throws are handed to the ingress after the registration, one emit at a time in commit
 * order. An emit the ingress cannot hold is deferred: the chain keeps it in its carry, unaccepted, offers nothing after
 * it, and offers it again only when the ingress wakes it (`emitWake`). Every held emit counts in the continuation bound
 * of each later candidate (`judge`), so a further Signal throw the chain could not carry is refused before it commits.
 * No deadlock: an offer is one Activity whose ingress handler answers at once, accepted or deferred, so a deferral never
 * holds the main loop and registration is never delayed behind a capacity wait; the wake's handler only marks the chain's
 * state. So the ingress fan-out's wait on a chain's `populationDeliver`, which waits on registration, never waits on room
 * the fan-out itself must free.
 */
import {
  ActivityFailure,
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
  type Arrival,
} from "./host-machine.js";
import { canonicalJson } from "./canonical-json.js";
import {
  CapacityBound,
  canonicalBytes,
  capacityCode,
  chainCapacity,
  eventBudget,
  failureProjection,
  rolloverDue as runRolloverDue,
  successorRun,
  textPage,
  updateFence,
} from "./capacity.js";
import { continuationBytes, judgeCommitted, type ChainFrame, type Judged } from "./chain-candidate.js";
import type {
  EmitVerdict,
  EmitWake,
  PopulationActivities,
  PopulationCarry,
  PopulationDelivery,
  PopulationScope,
  UnsettledEmit,
} from "./population-contract.js";
import {
  Route,
  type DecodedStimulus,
  type EffectResult,
  type HostView,
  type JsonValue,
  type KernelPort,
  type PopulationPort,
  type ReachOutcome,
  type WaitAddressView,
} from "./port.js";
import {
  RunKind,
  ResultKind,
  Scheduling,
  commandUpdate,
  deliverUpdate,
  effectResultUpdate,
  emitSettledUpdate,
  emitWakeUpdate,
  hostViewQuery,
  pendingIntentsQuery,
  populationDeliverUpdate,
  populationMessageQuery,
  populationSignalQuery,
  populationStartOutcomeQuery,
  populationStartedUpdate,
  observationQuery,
  stateQuery,
  publicationQuery,
  rejectionType,
  settleUpdate,
  snapshotView,
  timerFireUpdate,
  type CommandResult,
  type Halt,
  type HostActivities,
  type HostConfig,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
import { initialCursor, openLog, readPage } from "./publication.js";

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

/**
 * The halt a non-retryable effect Activity failure leaves. Temporal hands the Workflow an `ActivityFailure` whose
 * message is the server's "Activity task failed" and whose cause is the Activity's own refusal, so the refusal is read
 * from the cause. An effect result over its bound halts as the arrival loop and the memory host halt it, `unsupported`
 * with the bound's code; any other refusal (a Script language admission should have refused) is a host failure.
 */
export function effectFailureHalt(key: string, error: unknown): Halt {
  const refusal = error instanceof ActivityFailure && error.cause !== undefined ? error.cause : error;
  const commandId = arrivalCommandId({ key });
  const effectResultBound = capacityCode(CapacityBound.EffectResult);
  if (refusal instanceof ApplicationFailure && refusal.type === effectResultBound) {
    return { commandId, outcome: "unsupported", code: effectResultBound };
  }
  return { commandId, outcome: "hostFailure", code: failureProjection(refusal instanceof Error ? refusal.message : String(refusal)) };
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

function commandResult(applied: Judged<unknown>, revision: number): CommandResult {
  return applied.committed
    ? { outcome: "committed", code: null, revision }
    : { outcome: applied.outcome, code: applied.code, revision };
}

/** The code of a population start whose Conditional predicate did not hold, so that no instance started. */
const conditionNotHeldCode = "conditional-start-not-held";

/** How many population deliveries a chain remembers, so a delivery retried across Continue-As-New applies once. */
const deliveryLedgerCapacity = 1_024;

export function createRunProcess<P, S, I, M>(
  port: KernelPort<P, S, I>,
  population: PopulationPort<P, S, M>,
): (args: RunProcessArgs) => Promise<ProcessResult> {
  return (args) => hostProcess(port, population, args);
}

async function hostProcess<P, S, I, M>(port: KernelPort<P, S, I>, populationPort: PopulationPort<P, S, M>, args: RunProcessArgs): Promise<ProcessResult> {
  const config: HostConfig = args.config;
  const program = port.decodeProgram(args.program);
  const refusal = port.admit(program);
  if (refusal !== null) return { kind: ResultKind.Refused, code: refusal };
  const budget = eventBudget(historyBudget(port.requirements(program)), config.historyEventBudget);
  const frame: ChainFrame<P, S, I> = {
    port, program, programBytes: canonicalBytes(args.program), config, population: args.population,
    run: args.kind === RunKind.Continue ? args.run : 1,
  };
  const durable = config.scheduling === Scheduling.Durable;
  /** The stimulus as the kernel receives it, `null` when it states a time the host owns. */
  const timed = (stimulus: JsonValue): JsonValue | null => durable ? clockStimulus(stimulus, Date.now()) : stimulus;

  /** The committed state and its host view; `null` until a start commits. */
  let instance: { readonly state: S; readonly view: HostView } | null = null;
  let log = openLog(args.kind === RunKind.Continue ? args.cursor : initialCursor);
  let halt: Halt | null = null;
  let commits = 0;
  const scope: PopulationScope | null = args.population;
  const carried: PopulationCarry | null = args.kind === RunKind.Continue ? args.carry : null;
  /** The canonical addresses the population ingress holds for this chain, `null` before the first registration. */
  let populationRegistered: string | null = carried === null ? null : canonicalJson(carried.registeredAddresses);
  let deliveries: (readonly [string, ReachOutcome])[] = [...(carried?.deliveries ?? [])];
  let emits: UnsettledEmit[] = [...(carried?.emits ?? [])];
  let startOutcome: ReachOutcome | null = carried?.startOutcome ?? null;
  const ended = (): boolean => instance === null || instance.view.status !== running;
  /** The open waits' addresses the population ingress should hold: none once the instance ended or halted. */
  const addressesDue = (): readonly WaitAddressView[] => {
    const view = instance?.view;
    return view === undefined || halt !== null || view.status !== running ? [] : view.addresses ?? [];
  };
  const populationOwed = (): boolean => scope !== null && canonicalJson(addressesDue()) !== (populationRegistered ?? canonicalJson([]));
  /** The registration barrier: resolves once the waits committed so far are registered, or nothing will register them. */
  const settled = async (): Promise<void> => {
    if (populationOwed()) await condition(() => !populationOwed() || halt !== null || ended());
  };
  /** The emit barrier: resolves once the ingress accepted every hand-off committed so far; it never refuses one, it defers it. */
  const emitted = async (): Promise<void> => {
    if (emits.some((emit) => !emit.accepted)) await condition(() => emits.every((emit) => emit.accepted));
  };
  /** The emit the ingress deferred, offered again only once woken; only the first unaccepted emit is ever offered. */
  let deferredEmit: string | null = null;
  /** The ingress Run that last handed its deferred emits back: a deferral it answered is void even if it arrives later. */
  let handedBack: string | null = null;
  /** Whether an emit waits to be offered: some is unaccepted and the ingress deferred none of them. */
  const offerDue = (): boolean => scope !== null && deferredEmit === null && emits.some((emit) => !emit.accepted);

  setHandler(observationQuery, (from) =>
    textPage(instance === null ? null : port.observation(program, instance.state), from));
  setHandler(stateQuery, (from) => textPage(instance === null ? null : port.encodeState(instance.state), from));
  setHandler(hostViewQuery, (from) => textPage({
    revision: log.cursor.revision, view: instance === null ? null : snapshotView(instance.view), halt,
    registering: populationOwed(),
  }, from));
  setHandler(populationSignalQuery, (question) => instance === null || halt !== null
    ? { instanceId: null, receivers: [], refusesVariables: false }
    : {
        instanceId: populationPort.instanceIdOf(instance.state),
        receivers: populationPort.signalReceivers(program, instance.state, question.address, question.emitter),
        refusesVariables: populationPort.refusesSignalVariables(program),
      });
  setHandler(populationMessageQuery, (publication) => instance === null || halt !== null ? { kind: "receivers", receivers: [] } as const
    : populationPort.messageReceivers(program, instance.state, publication));
  setHandler(pendingIntentsQuery, (commandId, from) =>
    textPage(emits.find((emit) => emit.commandId === commandId)?.held ?? null, from));
  setHandler(populationStartOutcomeQuery, (from) => textPage(startOutcome, from));
  /** Every Update this Run accepted, which the table bounds per Run, and the caller inputs running now. */
  let accepted = 0;
  let inFlight = 0;
  const counted = <A extends unknown[], R>(handler: (...args: A) => Promise<R> | R) => async (...given: A): Promise<R> => {
    accepted += 1;
    return handler(...given);
  };
  setHandler(emitSettledUpdate, counted((commandId: string) => {
    emits = emits.filter((emit) => emit.commandId !== commandId);
  }));
  setHandler(emitWakeUpdate, counted((wake: EmitWake) => {
    switch (wake.kind) {
      case "accepted":
        emits = emits.map((emit) => emit.commandId === wake.commandId ? { ...emit, accepted: true } : emit);
        if (deferredEmit === wake.commandId) deferredEmit = null;
        return;
      case "reoffer":
        handedBack = wake.run;
        deferredEmit = null;
        return;
    }
  }));
  setHandler(publicationQuery, (afterRevision, limit) => readPage(log, afterRevision, limit));
  setHandler(settleUpdate, counted(async () => {
    await settled();
    await emitted();
    return log.cursor.revision;
  }));

  /** What the chain carries beside its state once a candidate with `view` commits, with its ledger and emit entries. */
  const carryOf = (view: HostView, delivery: readonly [string, ReachOutcome] | null, emit: UnsettledEmit | null): PopulationCarry => ({
    registeredAddresses: scope === null || view.status !== running ? [] : (view.addresses ?? []) as unknown as JsonValue,
    deliveries: delivery === null ? deliveries : [...deliveries, delivery].slice(-deliveryLedgerCapacity),
    emits: emit === null ? emits : [...emits, emit],
    startOutcome,
  });
  /** The emit a committed non-population input leaves, `null` when it threw no Signal or the chain has no population. */
  const emitOf = (commandId: string, state: S): UnsettledEmit | null => {
    const intents = populationPort.intentsOf(program, state);
    return scope === null || intents.length === 0 ? null
      : { commandId, held: { instanceId: populationPort.instanceIdOf(state), intents }, accepted: false };
  };
  /** One input through the kernel, judged against the chain's bounds; nothing is committed. */
  const judge = (commandId: string, input: I): Judged<S> => {
    const applied = applyInput(port, program, instance?.state ?? null, input);
    if (!applied.committed) return { ...applied, capacity: false };
    const emit = emitOf(commandId, applied.state);
    return judgeCommitted(frame, log, commandId, applied.state, (view) => carryOf(view, null, emit));
  };
  const commitJudged = (judged: Extract<Judged<S>, { committed: true }>): void => {
    instance = { state: judged.state, view: judged.view };
    log = judged.log;
    commits += 1;
  };
  /**
   * One input through the kernel. The Signals a committed input throws go to the population ingress (`emit`); a
   * population input's go back to the fan-out that made it, in its answer, and are never emitted.
   */
  const commit = (commandId: string, input: I): Judged<S> => {
    const judged = judge(commandId, input);
    if (judged.committed) {
      commitJudged(judged);
      const emit = emitOf(commandId, judged.state);
      if (emit !== null) emits = [...emits, emit];
    }
    return judged;
  };
  /**
   * A population step's committed state, its intents returned to the fan-out; a candidate over a bound fails with the
   * bound's code and commits nothing. `entry` makes the outcome the delivery ledger's entry under that identifier.
   */
  const reached = (commandId: string, step: ReturnType<PopulationPort<P, S, M>["populationStart"]>, entry: string | null): ReachOutcome => {
    if (step.kind !== "committed") return step;
    const intents = populationPort.intentsOf(program, step.state);
    const outcome: ReachOutcome = { kind: "committed", instanceId: populationPort.instanceIdOf(step.state), intents };
    const judged = judgeCommitted(frame, log, commandId, step.state,
      (view) => carryOf(view, entry === null ? null : [entry, outcome], null));
    if (!judged.committed) return { kind: "failed", failure: populationPort.capacityFailure(judged.code) };
    commitJudged(judged);
    return outcome;
  };
  /** A stimulus the population derived, refused whole when it exceeds the bound a caller's input has. */
  const derivedRefusal = (bound: CapacityBound, stimulus: JsonValue, limit: number): ReachOutcome | null =>
    canonicalBytes(stimulus) > limit ? { kind: "failed", failure: populationPort.capacityFailure(capacityCode(bound)) } : null;
  setHandler(populationDeliverUpdate, counted(async ({ deliveryId, delivery }: PopulationDelivery) => {
    const known = deliveries.find(([held]) => held === deliveryId)?.[1];
    if (known !== undefined) return known;
    if (instance === null || halt !== null) return { kind: "skipped" } as const;
    const outcome = derivedRefusal(CapacityBound.Stimulus, delivery, chainCapacity.stimulusBytes) ?? (() => {
      const step = populationPort.populationReach(program, instance.state, delivery, Date.now());
      return step.kind === "skipped" ? step : reached(deliveryId, step, deliveryId);
    })();
    deliveries = [...deliveries, [deliveryId, outcome] as const].slice(-deliveryLedgerCapacity);
    await settled();
    return outcome;
  }));
  setHandler(populationStartedUpdate, counted(async () => {
    // A directly started chain holds the identity: it never gets a start outcome, so the start is refused, not waited on.
    if (startOutcome === null && args.kind !== RunKind.PopulationStart) return { kind: "identityInUse" } as const;
    await condition(() => startOutcome !== null);
    await settled();
    if (startOutcome === null) throw new TypeError("population start without an outcome");
    return startOutcome;
  }));

  /** The program's and the start stimulus's own bounds, measured again at their Workflow consumer. */
  const startRefusal = (start: JsonValue): CapacityBound | null =>
    frame.programBytes > chainCapacity.programBytes ? CapacityBound.Program
      : canonicalBytes(start) > chainCapacity.startBytes ? CapacityBound.Start : null;

  if (args.kind === RunKind.PopulationStart) {
    const refused = startRefusal(args.request);
    startOutcome = refused !== null
      ? { kind: "failed", failure: populationPort.capacityFailure(capacityCode(refused)) }
      : reached(`population:${workflowInfo().workflowId}`, populationPort.populationStart(program, args.request, Date.now()), null);
    if (startOutcome.kind !== "committed") {
      await condition(allHandlersFinished);
      const code = startOutcome.kind === "failed" ? populationPort.failureCode(startOutcome.failure) : conditionNotHeldCode;
      return { kind: ResultKind.NotStarted, outcome: startOutcome.kind, code };
    }
  } else if (args.kind === RunKind.Start) {
    const refused = startRefusal(args.start);
    if (refused !== null) return { kind: ResultKind.NotStarted, outcome: "rejected", code: capacityCode(refused) };
    const start = timed(args.start);
    if (start === null) return { kind: ResultKind.NotStarted, outcome: "rejected", code: hostOwnsLogicalTime };
    const decoded = port.decodeStimulus(start);
    if (port.route(decoded.input) !== Route.Start) {
      throw ApplicationFailure.create({ message: "the start argument is not a start stimulus", nonRetryable: true });
    }
    const started = commit(decoded.commandId, decoded.input);
    if (!started.committed) {
      return { kind: ResultKind.NotStarted, outcome: started.capacity ? "rejected" : started.outcome, code: started.code };
    }
  } else {
    const state = port.decodeState(args.state);
    instance = { state, view: port.hostView(program, state) };
  }

  /** The decoded input an Update may carry, or the refusal its validator throws. */
  const admitted = (route: Route, stimulus: JsonValue): DecodedStimulus<I> => {
    if (halt !== null) throw rejection("host-halted");
    if (hostScheduled(route, config.scheduling)) throw rejection("host-scheduled-input");
    if (canonicalBytes(stimulus) > chainCapacity.stimulusBytes) throw rejection(capacityCode(CapacityBound.Stimulus));
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
    setHandler(update, counted(async (stimulus: JsonValue) => {
      inFlight += 1;
      try {
        const { commandId, input } = admitted(route, stimulus);
        const result = commandResult(commit(commandId, input), log.cursor.revision);
        await settled();
        await emitted();
        return result;
      } finally {
        inFlight -= 1;
      }
    }), {
      validator: (stimulus) => {
        const fenced = updateFence(accepted, inFlight);
        if (fenced !== null) throw rejection(capacityCode(fenced));
        const { commandId, input } = admitted(route, stimulus);
        const verdict = judge(commandId, input);
        if (!verdict.committed && (verdict.rejected || verdict.capacity)) throw rejection(verdict.code);
      },
    });
  }

  const activityOptions = (activityId: string): ActivityOptions =>
    ({ activityId, startToCloseTimeout: config.effectStartToCloseMs, retry: transportRetry });

  const populationActivities = (): Pick<PopulationActivities, "registerPopulation" | "emitPopulation"> => ({
    registerPopulation: (request) => scheduleActivity<string | null>("registerPopulation" satisfies keyof HostActivities, [request],
      { startToCloseTimeout: config.effectStartToCloseMs, retry: transportRetry }),
    emitPopulation: (request) => scheduleActivity<EmitVerdict>("emitPopulation" satisfies keyof HostActivities, [request],
      { startToCloseTimeout: config.effectStartToCloseMs, retry: transportRetry }),
  });
  /**
   * Registers the open waits' addresses with the population ingress at the current publication revision, then offers it
   * every emit not yet accepted, one at a time, until one is deferred. A registration the ingress refuses halts the
   * chain, never leaving a wait no command can reach.
   */
  const reportPopulation = async (): Promise<void> => {
    if (scope === null || instance === null) return;
    while (populationOwed()) {
      const addresses = addressesDue();
      const refused = await populationActivities().registerPopulation({
        population: scope.population,
        registration: {
          workflowId: workflowInfo().workflowId, processInstanceId: populationPort.instanceIdOf(instance.state),
          deploymentId: scope.deploymentId, revision: log.cursor.revision, addresses,
        },
      });
      if (refused !== null) {
        halt ??= { commandId: "host:population", outcome: "unsupported", code: refused };
        populationRegistered = canonicalJson([]);
        return;
      }
      populationRegistered = canonicalJson(addresses);
    }
    for (const emit of emits) {
      if (emit.accepted) continue;
      if (deferredEmit !== null) return;
      const verdict = await populationActivities().emitPopulation({
        population: scope.population,
        reference: { workflowId: workflowInfo().workflowId, commandId: emit.commandId, count: emit.held.intents.length, digest: "" },
        handedBack,
      });
      // A wake or the emit's settlement may have answered it while the offer was in flight.
      if (!emits.some((held) => held.commandId === emit.commandId && !held.accepted)) continue;
      if (verdict.kind === "deferred") {
        // A Run that already handed its deferred emits back wakes no one: the next Run is offered it at once (`offerDue`).
        if (verdict.run !== handedBack) deferredEmit = emit.commandId;
        return;
      }
      emits = emits.map((held) => held.commandId === emit.commandId ? { ...held, accepted: true } : held);
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
        // Only a non-retryable Activity failure gets here: no input exists for it, so the schedule halts.
        halt ??= effectFailureHalt(key, error);
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
  const rolloverDue = (): boolean => commits > 0 && runRolloverDue({
    historyEvents: workflowInfo().historyLength,
    historyBytes: workflowInfo().historySize,
    continueAsNewSuggested: workflowInfo().continueAsNewSuggested,
    updates: accepted,
    retainedPublicationBytes: log.retainedBytes,
  }, budget);
  /** The successor's argument, or the halt of a chain that needs a Run or a carried argument beyond its bound. */
  const successor = (current: { readonly state: S }): RunProcessArgs | Halt => {
    const run = successorRun(frame.run);
    if (run === null) return { commandId: "host:continue", outcome: "unsupported", code: capacityCode(CapacityBound.Runs) };
    const carry: PopulationCarry = {
      registeredAddresses: JSON.parse(populationRegistered ?? "[]") as JsonValue, deliveries, emits, startOutcome,
    };
    const state = port.encodeState(current.state);
    if (continuationBytes(frame, canonicalBytes(state), log.cursor, carry) > chainCapacity.continuationBytes) {
      return { commandId: "host:continue", outcome: "unsupported", code: capacityCode(CapacityBound.Continuation) };
    }
    return { kind: RunKind.Continue, program: args.program, config, population: scope, state, cursor: log.cursor, carry, run };
  };
  let reconciled = -1;
  for (;;) {
    if (ended() || halt !== null) break;
    const draining = rolloverDue();
    if (reconciled !== commits || draining) {
      reconcile(draining);
      reconciled = commits;
    }
    await reportPopulation();
    if (reconciled !== commits) continue;
    if (draining && effects.size === 0 && arrivals.length === 0) {
      // A caller's Update waits on the emit barrier, so a handed-back emit is offered again before the Run ends.
      await condition(() => allHandlersFinished() || offerDue());
      if (offerDue()) continue;
      if (arrivals.length === 0 && halt === null && instance !== null && !ended()) {
        const next = successor(instance);
        if ("kind" in next) return continueAsNew<(next: RunProcessArgs) => Promise<ProcessResult>>(next);
        halt = next;
        continue;
      }
    }
    await condition(() => arrivals.length > 0 || commits !== reconciled || halt !== null || offerDue() ||
      (draining ? effects.size === 0 : rolloverDue()));
    while (arrivals.length > 0 && halt === null && !ended()) {
      const [arrival] = arrivals.splice(nextArrival(arrivals), 1);
      if (arrival === undefined) break;
      ownerOf(arrival).delete(arrival.key);
      const commandId = arrivalCommandId(arrival);
      if (arrival.kind === ArrivalKind.Effect && canonicalBytes(arrival.result) > chainCapacity.effectResultBytes) {
        halt = { commandId, outcome: "unsupported", code: capacityCode(CapacityBound.EffectResult) };
        break;
      }
      const applied = commit(commandId, arrivalInput(port, arrival, Date.now()));
      if (!applied.committed && !applied.rejected) halt = { commandId, outcome: applied.outcome, code: applied.code };
    }
  }

  for (const scope of [...timers.values(), ...effects.values()]) scope.cancel();
  await reportPopulation();
  // An ended or halted chain still owes the Signals it committed: it stays until the ingress accepted every one.
  while (scope !== null && emits.some((emit) => !emit.accepted)) {
    await condition(() => offerDue() || emits.every((emit) => emit.accepted));
    await reportPopulation();
  }
  await condition(allHandlersFinished);
  if (halt !== null) return { kind: ResultKind.Halted, halt, revision: log.cursor.revision };
  return { kind: ResultKind.Ended, status: instance?.view.status ?? running, revision: log.cursor.revision };
}
