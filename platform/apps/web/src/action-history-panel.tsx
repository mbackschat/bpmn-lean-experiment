import { useCallback, useId, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";
import type { IncidentOperationsApi } from "./incident-operations-api.ts";
import type { WorkApiClient } from "./work-tasks-api.ts";
import type { OperationsSearch, WorkspaceNavigation } from "./navigation/route-search.ts";
import { ActionHistoryStream, incidentHistoryRow, taskHistoryRow } from "./action-history-stream.tsx";
import styles from "./action-history.module.css";

type Props = Readonly<{
  workApi: Pick<WorkApiClient, "readAudit">;
  incidentApi: Pick<IncidentOperationsApi, "readAudit">;
  navigation?: WorkspaceNavigation<OperationsSearch>;
}>;

export function ActionHistoryPanel({ workApi, incidentApi, navigation }: Props) {
  const typeId = useId();
  const [local, setLocal] = useState<OperationsSearch>({});
  const [revision, setRevision] = useState(0);
  const search = navigation?.search ?? local;
  const type = search.auditType ?? "all";
  const instance = search.auditInstance ?? "";
  const filterKey = JSON.stringify([type, instance]);
  const readWork = useCallback(async (cursor?: string) => {
    const page = await workApi.readAudit({ limit: 25,
      ...(instance === "" ? {} : { hostingProcessInstanceId: instance }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { ...page, events: page.events.map(taskHistoryRow) };
  }, [workApi, instance]);
  const readIncidents = useCallback(async (cursor?: string) => {
    const page = await incidentApi.readAudit({ limit: 25,
      ...(instance === "" ? {} : { hostingProcessInstanceId: instance }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return { ...page, events: page.events.map(incidentHistoryRow) };
  }, [incidentApi, instance]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = data.get("type");
    const id = String(data.get("instance") ?? "").trim();
    const { auditType: _type, auditInstance: _instance, ...rest } = search;
    const next: OperationsSearch = { ...rest, tab: "audit",
      ...(selected === "tasks" || selected === "incidents" ? { auditType: selected } : {}),
      ...(id === "" ? {} : { auditInstance: id }),
    };
    if (navigation === undefined) setLocal(next);
    else navigation.navigate(next);
    if ((next.auditType ?? "all") === type && (next.auditInstance ?? "") === instance) setRevision((value) => value + 1);
  }

  return <section className={styles.panel} aria-labelledby="action-history-heading">
    <div className={styles.heading}>
      <div><h2 id="action-history-heading">Action history</h2>
        <p>Who performed which actions, and their recorded outcomes.</p>
        <p>Review your task claims, releases and completions, alongside incident actions available to you.</p>
      </div>
      <Button variant={ButtonVariant.Secondary} onPress={() => setRevision((value) => value + 1)}>Refresh history</Button>
    </div>
    <form key={filterKey} className={styles.filters} onSubmit={apply}>
      <div className={styles.field}><label htmlFor={typeId}>Activity type</label><select id={typeId} name="type" defaultValue={type}>
        <option value="all">All activity</option><option value="tasks">Task actions</option><option value="incidents">Incident actions</option>
      </select></div>
      <label>Process instance ID<input name="instance" defaultValue={instance} maxLength={4096} placeholder="All process instances" /></label>
      <Button type="submit">Apply filters</Button>
    </form>
    <p>Each list follows its own recording order. The two lists do not form a single timeline.</p>
    <div key={`${filterKey}:${revision}`} className={styles.collections}>
      {type === "incidents" ? null : <ActionHistoryStream kind="task" read={readWork} />}
      {type === "tasks" ? null : <ActionHistoryStream kind="incident" read={readIncidents} />}
    </div>
  </section>;
}
