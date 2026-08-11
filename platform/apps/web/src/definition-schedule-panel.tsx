import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { DefinitionScheduleStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import type { DefinitionScheduleApiClient } from "./definition-schedule-api";

export type DefinitionSchedulePanelProps = Readonly<{
  api: DefinitionScheduleApiClient;
  definition: DeployedDefinitionVersion;
}>;

export function DefinitionSchedulePanel({
  api,
  definition,
}: DefinitionSchedulePanelProps) {
  const timerStarts = definition.startCapabilities.timerStarts;
  const [schedules, setSchedules] = useState<ReadonlyArray<DefinitionSchedule>>([]);
  const [scheduleId, setScheduleId] = useState<string>(() => globalThis.crypto.randomUUID());
  const [activationAt, setActivationAt] = useState(defaultActivationInstant);
  const [busy, setBusy] = useState<string | null>("list");
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setBusy("list");
    setError(null);
    try {
      const response = await api.list(definition);
      setSchedules(response.schedules);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }, [api, definition]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const schedule = await api.create(definition, scheduleId, { activationAt });
      setSchedules((current) => replaceSchedule(current, schedule));
      setScheduleId(globalThis.crypto.randomUUID());
      setActivationAt(defaultActivationInstant());
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function refresh(schedule: DefinitionSchedule): Promise<void> {
    setBusy(schedule.scheduleId);
    setError(null);
    try {
      const current = await api.get(definition, schedule.scheduleId);
      setSchedules((items) => replaceSchedule(items, current));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(schedule: DefinitionSchedule): Promise<void> {
    setBusy(schedule.scheduleId);
    setError(null);
    try {
      const cancelled = await api.cancel(definition, schedule.scheduleId);
      setSchedules((items) => replaceSchedule(items, cancelled));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="schedule-panel" aria-labelledby="schedule-heading">
      <div className="schedule-heading">
        <div>
          <p className="eyebrow">Exact-version Timer Start</p>
          <h2 id="schedule-heading">Definition schedules</h2>
          <p>
            Every schedule remains bound to {definition.processId}, version {definition.version}.
          </p>
        </div>
        <button
          type="button"
          className="secondary-action"
          disabled={busy !== null}
          onClick={() => { void refreshList(); }}
        >
          {busy === "list" ? "Refreshing…" : "Refresh schedules"}
        </button>
      </div>

      <div className="timer-capabilities" aria-label="Published Timer Start capabilities">
        {timerStarts.length === 0 ? (
          <p>This exact version publishes no Timer Start capability.</p>
        ) : timerStarts.map((timerStart) => (
          <dl key={`${timerStart.startEventId}:${timerStart.durationMs}`}>
            <div>
              <dt>Start Event</dt>
              <dd><code>{timerStart.startEventId}</code></dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{timerStart.durationMs} ms</dd>
            </div>
          </dl>
        ))}
      </div>

      {timerStarts.length === 1 ? (
        <form className="schedule-form" onSubmit={(event) => { void create(event); }}>
          <label>
            Schedule ID
            <input
              name="scheduleId"
              type="text"
              value={scheduleId}
              onChange={(event) => { setScheduleId(event.currentTarget.value); }}
              required
            />
          </label>
          <label>
            Activation instant
            <input
              name="activationAt"
              type="text"
              value={activationAt}
              placeholder="2026-08-11T12:00:00.000Z"
              onChange={(event) => { setActivationAt(event.currentTarget.value); }}
              required
            />
            <small>Canonical UTC whole second ending in <code>.000Z</code></small>
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === "create" ? "Creating…" : "Create schedule"}
          </button>
        </form>
      ) : timerStarts.length > 1 ? (
        <p className="schedule-notice">
          Creation is unavailable because this version publishes multiple Timer Start capabilities.
        </p>
      ) : null}

      {error === null ? null : <p className="error" role="alert">{error}</p>}
      {schedules.length === 0 && busy !== "list" ? (
        <p className="schedule-empty">No schedules exist for this exact definition version.</p>
      ) : (
        <ul className="schedule-list" aria-label="Definition schedules">
          {schedules.map((schedule) => (
            <li key={schedule.scheduleId}>
              <div className="schedule-identity">
                <strong>{schedule.status}</strong>
                <code>{schedule.scheduleId}</code>
              </div>
              <dl className="schedule-facts">
                <div>
                  <dt>Activation</dt>
                  <dd><time dateTime={schedule.activationAt}>{schedule.activationAt}</time></dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd><time dateTime={schedule.dueAt}>{schedule.dueAt}</time></dd>
                </div>
                <div>
                  <dt>Timer Start</dt>
                  <dd><code>{schedule.timerStart.startEventId}</code></dd>
                </div>
                {schedule.status === DefinitionScheduleStatus.Started ? (
                  <div>
                    <dt>Process instance</dt>
                    <dd>
                      <code>{schedule.instance.processInstanceId}</code>
                      <span>{schedule.instance.definition.processId}, version {schedule.instance.definition.version}</span>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="schedule-actions">
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy !== null}
                  onClick={() => { void refresh(schedule); }}
                >
                  {busy === schedule.scheduleId ? "Working…" : "Refresh"}
                </button>
                {schedule.status === DefinitionScheduleStatus.Scheduled ? (
                  <button
                    type="button"
                    className="cancel-action"
                    disabled={busy !== null}
                    onClick={() => { void cancel(schedule); }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function replaceSchedule(
  schedules: ReadonlyArray<DefinitionSchedule>,
  replacement: DefinitionSchedule,
): ReadonlyArray<DefinitionSchedule> {
  return [
    ...schedules.filter(({ scheduleId }) => scheduleId !== replacement.scheduleId),
    replacement,
  ].sort((left, right) => compareCodePoints(left.scheduleId, right.scheduleId));
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}

function defaultActivationInstant(): string {
  const minimumLeadTimeMs = 60_000;
  const wholeSecond = Math.ceil((Date.now() + minimumLeadTimeMs) / 1_000) * 1_000;
  return new Date(wholeSecond).toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}
