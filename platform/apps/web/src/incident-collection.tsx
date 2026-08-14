import { Fragment } from "react";
import type { Ref } from "react";

import type { PublicIncident } from "@bpmn-lean/platform-contracts";
import {
  Button,
  ButtonVariant,
  DataTable,
  DataTableCardWidth,
  DataTableResponsiveMode,
} from "@bpmn-lean/platform-ui-kit";
import type { DataTableColumn } from "@bpmn-lean/platform-ui-kit";

import styles from "./incident-collection.module.css";

export type IncidentCollectionProps = Readonly<{
  incidents: readonly PublicIncident[];
  onSelect: (incident: PublicIncident) => void;
  rowRef: (incident: PublicIncident) => Ref<HTMLButtonElement>;
}>;

/** Complete current incident snapshot with navigation-only row affordances. */
export function IncidentCollection({
  incidents,
  onSelect,
  rowRef,
}: IncidentCollectionProps) {
  const columns: readonly DataTableColumn<PublicIncident>[] = [{
    id: "processId",
    header: "Process ID",
    responsiveLabel: "Process ID",
    cell: (row) => (
      <Button
        ref={rowRef(row)}
        variant={ButtonVariant.Plain}
        aria-label={incidentSelectionName(row)}
        onPress={() => { onSelect(row); }}
      >
        <code>{row.hostingInstance.definition.processId}</code>
      </Button>
    ),
  }, {
    id: "hostingInstance",
    header: "Hosting Process instance",
    responsiveLabel: "Hosting Process instance",
    cell: (row) => <code>{row.hostingInstance.processInstanceId}</code>,
  }, {
    id: "element",
    header: "Service Task element",
    responsiveLabel: "Service Task element",
    cell: (row) => <code>{row.incident.id.effectId.elementId}</code>,
  }, {
    id: "activation",
    header: "Activation",
    responsiveLabel: "Activation",
    cell: (row) => row.incident.id.effectId.activation,
  }, {
    id: "generation",
    header: "Generation",
    responsiveLabel: "Generation",
    cell: (row) => row.incident.id.generation,
  }, {
    id: "available",
    header: "Available",
    responsiveLabel: "Available",
    cardWidth: DataTableCardWidth.Full,
    cell: (row) => (
      <InteractionLabels interactions={row.availableInteractions} />
    ),
  }];
  return (
    <DataTable
      aria-label="Current incidents"
      columns={columns}
      responsiveMode={DataTableResponsiveMode.Cards}
      rowId={incidentKey}
      rows={incidents}
    />
  );
}

export function InteractionLabels({
  interactions,
}: Readonly<{ interactions: PublicIncident["availableInteractions"] }>) {
  return (
    <span className={styles.labels}>
      {interactions.map((interaction, index) => (
        <Fragment key={interaction.kind}>
          {index === 0 ? null : ", "}{interactionLabel(interaction)}
        </Fragment>
      ))}
    </span>
  );
}

export function incidentKey(incident: PublicIncident): string {
  const { effectId } = incident.incident.id;
  return JSON.stringify([
    incident.hostingInstance.processInstanceId,
    effectId.processInstanceId,
    effectId.elementId,
    effectId.activation,
    incident.incident.id.generation,
  ]);
}

export function incidentSelectionName(incident: PublicIncident): string {
  const { effectId } = incident.incident.id;
  return `View incident ${effectId.processInstanceId} ${effectId.elementId} activation ${effectId.activation} generation ${incident.incident.id.generation}`;
}

export function interactionLabel(
  interaction: PublicIncident["availableInteractions"][number],
): string {
  switch (interaction.kind) {
    case "retryIncident":
      return "Retry";
    case "cancelIncidentProcess":
      return "Cancel Process";
  }
}
