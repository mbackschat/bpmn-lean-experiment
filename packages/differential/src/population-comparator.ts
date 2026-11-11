/**
 * Population results compared at CIB Seven's observation boundary (population contract §8): the kernel's population
 * result (`contracts/schemas/engine-population-result.schema.json`) projected onto what retained CIB population evidence
 * (`cibseven-population-evidence.schema.json`) records, then compared structurally. The projection drops what CIB
 * cannot observe and restates what CIB records in another form, so every remaining difference is a disagreement:
 *
 * - CIB names no refusal codes: a deployment outcome, failed fan-out entry or input failure keeps no `code`.
 * - CIB delivers every receiver of a command in one transaction (M8-LIM-G) and reports the instances the command
 *   started, not the receivers it delivered to: a fan-out keeps its `started` and `failed` entries, and a `delivered`
 *   or `skipped` entry shows only in its instance's state. The entries' order is CIB's `HashSet` order (population
 *   contract §6), so both sides compare sorted.
 * - A kernel resolution becomes CIB's command outcome: `committed` and `fanOut` committed, a `failed` delivery or a
 *   `rejected` or `unsupported` command its outcome class without a resolution, and `noMatch` or `ambiguous` a
 *   rolled-back command with that resolution, as CIB refuses an unmatched correlation inside its command
 *   (`CorrelateMessageCmd.java:57-95`).
 * - CIB keeps one clock for the population, so every instance's state shows the clock at the end of the run, which the
 *   caller passes as `clockMs`; the kernel keeps one per instance.
 * - The kernel's source digest of a called definition records which document its assembly copied a process from, which
 *   CIB, copying nothing, cannot observe.
 * - States compare as single-instance states against CIB evidence (`atCibBoundary`), ordered by instance.
 */
import { atCibBoundary } from "./comparator.js";
import type { ValueDisagreement } from "./structural-diff.js";
import { compareCanonicalStrings, firstValueDisagreement, isJsonRecord } from "./structural-diff.js";

/** The members of a population result both sides record. */
export type PopulationResultDocument = Readonly<{
  deployments: ReadonlyArray<unknown>;
  steps: ReadonlyArray<unknown>;
  inputFailures?: ReadonlyArray<unknown>;
  processStates: ReadonlyArray<unknown>;
}>;

type Members = Readonly<Record<string, unknown>>;

const members = (value: unknown): Members => (isJsonRecord(value) ? value : {});

const withoutCode = (value: unknown): unknown => {
  if (!isJsonRecord(value)) return value;
  const { code: _unobserved, ...rest } = value;
  return rest;
};

const byCanonicalJson = (left: unknown, right: unknown): number =>
  compareCanonicalStrings(JSON.stringify(left), JSON.stringify(right));

function deployment(entry: unknown): unknown {
  const fields = members(entry);
  const versions = Array.isArray(fields["versions"])
    ? [...fields["versions"]].sort((left, right) =>
      compareCanonicalStrings(String(members(left)["key"]), String(members(right)["key"])))
    : fields["versions"];
  return { ...fields, versions, outcome: withoutCode(fields["outcome"]) };
}

/** A fan-out's comparable entries: the instances it started and the receivers that failed, without codes, sorted. */
function fanOutEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  return entries
    .filter((entry) => members(entry)["kind"] === "started" || members(entry)["kind"] === "failed")
    .map(withoutCode)
    .sort(byCanonicalJson);
}

/** A kernel step as CIB records a command: its outcome class and the resolution CIB reports. */
function kernelStep(step: unknown): unknown {
  const { resolution, ...rest } = members(step);
  const answer = members(resolution);
  switch (answer["kind"]) {
    case "committed": {
      // Receiver outcomes are kernel-only (population contract §8); the instances a cascade starts compare in processStates.
      const { cascade: _kernelOnly, ...delivered } = answer;
      return { ...rest, outcome: "committed", resolution: delivered };
    }
    case "fanOut":
      return { ...rest, outcome: "committed", resolution: { ...answer, entries: fanOutEntries(answer["entries"]) } };
    case "noMatch":
    case "ambiguous":
      return { ...rest, outcome: "rolledBack", resolution: answer };
    case "failed":
      return { ...rest, outcome: answer["outcome"] };
    case "rejected":
      return { ...rest, outcome: "rejected" };
    case "unsupported":
      return { ...rest, outcome: "unsupported" };
    default:
      return step;
  }
}

function cibStep(step: unknown): unknown {
  const fields = members(step);
  const answer = members(fields["resolution"]);
  return answer["kind"] === "fanOut"
    ? { ...fields, resolution: { ...answer, entries: fanOutEntries(answer["entries"]) } }
    : step;
}

/** A called definition's reference without the kernel's source digest. */
function waitAtCib(wait: unknown): unknown {
  const fields = members(wait);
  return isJsonRecord(fields["definition"])
    ? { ...fields, definition: { ...fields["definition"], sourceSha256: null } }
    : wait;
}

function states(processStates: ReadonlyArray<unknown>, clockMs: number | null): ReadonlyArray<unknown> {
  return processStates
    .map((state) => {
      const fields = members(state);
      const waits = Array.isArray(fields["openWaits"]) ? fields["openWaits"].map(waitAtCib) : fields["openWaits"];
      return atCibBoundary({ ...fields, openWaits: waits, ...(clockMs === null ? {} : { logicalTimeMs: clockMs }) });
    })
    .sort((left, right) =>
      compareCanonicalStrings(String(members(left)["instanceId"]), String(members(right)["instanceId"])));
}

function projected(
  result: PopulationResultDocument,
  step: (step: unknown) => unknown,
  clockMs: number | null,
): PopulationResultDocument {
  const failures = result.inputFailures ?? [];
  return {
    deployments: result.deployments.map(deployment),
    steps: result.steps.map(step),
    ...(failures.length === 0 ? {} : { inputFailures: failures.map(withoutCode) }),
    processStates: states(result.processStates, clockMs),
  };
}

/**
 * The first difference between retained CIB population evidence (`evidence.result`) and the kernel's population result
 * at CIB's boundary; null when they agree. `clockMs` is CIB's clock at the end of the run (`populationClockMs`).
 */
export function comparePopulationResults(
  evidence: PopulationResultDocument,
  kernel: PopulationResultDocument,
  clockMs: number,
): ValueDisagreement | null {
  return firstValueDisagreement(projected(evidence, cibStep, null), projected(kernel, kernelStep, clockMs), "result");
}

/**
 * The CIB clock at the end of a population run, which never runs backwards: the latest of every step's `at`, every
 * instance input's own `at`, and the deadline of every Timer firing and every Timer-triggered start, to which the
 * runner advances the clock when it is earlier.
 */
export function populationClockMs(steps: ReadonlyArray<unknown>): number {
  let clock = 0;
  for (const step of steps) {
    const fields = members(step);
    const stimulus = members(fields["stimulus"]);
    const trigger = members(stimulus["trigger"]);
    const firing = stimulus["kind"] === "timerFire" ? stimulus["logicalTimeMs"] : undefined;
    const timerStart = stimulus["kind"] === "start" && trigger["kind"] === "timer" ? trigger["logicalTimeMs"] : undefined;
    for (const time of [fields["at"], stimulus["at"], firing, timerStart]) {
      if (typeof time === "number" && time > clock) clock = time;
    }
  }
  return clock;
}
