import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { DefinitionScheduleStatus } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import type { DefinitionScheduleApiClient } from "./definition-schedule-api";
import { ScheduleCreationKind, scheduleCreation } from "./definition-schedule-creation.ts";
import { OccurrencePicker } from "./definition-schedule-occurrence-picker.tsx";
import { occurrencePage, occurrencePageSize, type OccurrencePage } from "./definition-schedule-occurrences.ts";
import styles from "./definition-schedule-panel.module.css";

export type DefinitionSchedulePanelProps = Readonly<{
  api: DefinitionScheduleApiClient;
  definition: DeployedDefinitionVersion;
}>;

export function DefinitionSchedulePanel({
  api,
  definition,
}: DefinitionSchedulePanelProps) {
  const timerStarts = definition.startCapabilities.timerStarts;
  const creation = scheduleCreation(timerStarts);
  const [schedules, setSchedules] = useState<ReadonlyArray<DefinitionSchedule>>([]);
  const [scheduleId, setScheduleId] = useState<string>(() => globalThis.crypto.randomUUID());
  const [page, setPage] = useState<OccurrencePage | null>(null);
  const [pageFrom, setPageFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("list");
  const [error, setError] = useState<string | null>(null);
  const available = creation.kind === ScheduleCreationKind.Available;

  /** Lists the occurrences due at or after `from`, the server's now when `null`, keeping a still-listed selection. */
  const loadOccurrences = useCallback(async (from: string | null) => {
    setBusy("occurrences");
    setError(null);
    try {
      const listed = await api.occurrences(definition, {
        ...(from === null ? {} : { from }),
        limit: occurrencePageSize,
      });
      setPage((current) => occurrencePage(listed.occurrences, current?.selected ?? null));
      setPageFrom(from);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }, [api, definition]);

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
    void refreshList().then(() => available ? loadOccurrences(null) : undefined);
  }, [refreshList, loadOccurrences, available]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const dueAt = page?.selected ?? null;
    if (dueAt === null) return;
    setBusy("create");
    setError(null);
    try {
      const schedule = await api.create(definition, scheduleId, { dueAt });
      setSchedules((current) => replaceSchedule(current, schedule));
      setScheduleId(globalThis.crypto.randomUUID());
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
    <section className={styles.panel} aria-labelledby="schedule-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Exact-version Timer Start</p>
          <h2 id="schedule-heading">Definition schedules</h2>
          <p>
            Every schedule remains bound to {definition.processId}, version {definition.version}.
          </p>
        </div>
        <Button
          variant={ButtonVariant.Secondary}
          isPending={busy !== null}
          onPress={() => { void refreshList(); }}
        >
          {busy === "list" ? "Refreshing…" : "Refresh schedules"}
        </Button>
      </div>

      <div className={styles.capabilities} aria-label="Published Timer Start capabilities">
        {timerStarts.length === 0 ? (
          <p>This exact version publishes no Timer Start capability.</p>
        ) : timerStarts.map((timerStart) => (
          <dl key={timerStart.startEventId}>
            <div>
              <dt>Start Event</dt>
              <dd><code>{timerStart.startEventId}</code></dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{timerStart.durationMs === null ? "Unresolved by the engine" : `${timerStart.durationMs} ms`}</dd>
            </div>
          </dl>
        ))}
      </div>

      {creation.kind === ScheduleCreationKind.Available ? (
        <form className={styles.form} onSubmit={(event) => { void create(event); }}>
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
          <OccurrencePicker
            page={page}
            paged={pageFrom !== null}
            busy={busy !== null}
            onSelect={(dueAt) => { setPage((current) => current === null ? current : { ...current, selected: dueAt }); }}
            onLater={(from) => { void loadOccurrences(from); }}
            onFirst={() => { void loadOccurrences(null); }}
          />
          <Button type="submit" isPending={busy !== null} isDisabled={page?.selected == null}>
            {busy === "create" ? "Creating…" : "Create schedule"}
          </Button>
        </form>
      ) : <ScheduleCreationNotice creation={creation.kind} />}

      {error === null ? null : <p className={styles.error} role="alert">{error}</p>}
      {schedules.length === 0 && busy !== "list" ? (
        <p className={styles.empty}>No schedules exist for this exact definition version.</p>
      ) : (
        <ul className={styles.list} aria-label="Definition schedules">
          {schedules.map((schedule) => (
            <li key={schedule.scheduleId}>
              <div className={styles.identity}>
                <strong>{schedule.status}</strong>
                <code>{schedule.scheduleId}</code>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>Due</dt>
                  <dd><time dateTime={schedule.dueAt}>{schedule.dueAt}</time></dd>
                </div>
                <div>
                  <dt>Timer Start</dt>
                  <dd><code>{schedule.timerStart.startEventId}</code></dd>
                </div>
                {schedule.status === DefinitionScheduleStatus.Refused ? (
                  <div>
                    <dt>Engine refusal</dt>
                    <dd><code>{schedule.refusal}</code></dd>
                  </div>
                ) : null}
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
              <div className={styles.actions}>
                <Button
                  variant={ButtonVariant.Secondary}
                  isPending={busy !== null}
                  onPress={() => { void refresh(schedule); }}
                >
                  {busy === schedule.scheduleId ? "Working…" : "Refresh"}
                </Button>
                {schedule.status === DefinitionScheduleStatus.Scheduled ? (
                  <Button
                    variant={ButtonVariant.Danger}
                    isPending={busy !== null}
                    onPress={() => { void cancel(schedule); }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScheduleCreationNotice({
  creation,
}: Readonly<{ creation: Exclude<ScheduleCreationKind, typeof ScheduleCreationKind.Available> }>) {
  switch (creation) {
    case ScheduleCreationKind.NoTimerStart:
      return null;
    case ScheduleCreationKind.MultipleTimerStarts:
      return (
        <p className={styles.notice}>
          Creation is unavailable because this version publishes multiple Timer Start capabilities.
        </p>
      );
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown platform failure";
}
