import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import type { OccurrencePage } from "./definition-schedule-occurrences.ts";
import styles from "./definition-schedule-panel.module.css";

export type OccurrencePickerProps = Readonly<{
  page: OccurrencePage | null;
  /** Whether the page shown starts after the next occurrence, so the first page can be listed again. */
  paged: boolean;
  busy: boolean;
  onSelect: (dueAt: string) => void;
  onLater: (from: string) => void;
  onFirst: () => void;
}>;

/**
 * Chooses one of the engine's occurrences of the version's Timer Start: a schedule fires exactly one of them, so the
 * picker offers only listed due instants and never a free date.
 */
export function OccurrencePicker({ page, paged, busy, onSelect, onLater, onFirst }: OccurrencePickerProps) {
  return (
    <fieldset className={styles.occurrences}>
      <legend>Occurrence</legend>
      <p className={styles.hint}>Due instants the engine computes for this Timer Start, counted from the version's deployment.</p>
      {page === null ? (
        <p className={styles.notice}>Loading occurrences…</p>
      ) : page.occurrences.length === 0 ? (
        <p className={styles.notice}>No later occurrence of this Timer Start remains.</p>
      ) : (
        <ul className={styles.choices}>
          {page.occurrences.map(({ dueAt }) => (
            <li key={dueAt}>
              <label>
                <input
                  type="radio"
                  name="dueAt"
                  value={dueAt}
                  checked={page.selected === dueAt}
                  onChange={() => { onSelect(dueAt); }}
                />
                <time dateTime={dueAt}>{dueAt}</time>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        {paged ? (
          <Button variant={ButtonVariant.Secondary} isPending={busy} onPress={onFirst}>
            Next occurrences
          </Button>
        ) : null}
        {page?.laterFrom == null ? null : (
          <Button variant={ButtonVariant.Secondary} isPending={busy} onPress={() => { onLater(page.laterFrom ?? ""); }}>
            Later occurrences
          </Button>
        )}
      </div>
    </fieldset>
  );
}
