import {
  OperatorAuditMaximumEventsPerStream,
  OperatorAuditMaximumStoredJsonBytesPerStream,
  operatorAuditExportFormat,
  serializeOperatorAuditExport,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditEvent,
  OperatorAuditStream,
  PublicProcessInstanceIdentity,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";

type AuditOutbox = Readonly<{ reconcileAll(): Promise<void> }>;

type AuditSnapshotRepository<Event> = Readonly<{
  snapshotHostingProcessInstance(
    hostingProcessInstanceId: string,
    limits: Readonly<{ maxEvents: number; maxStoredBytes: number }>,
  ): Promise<OperatorAuditStream<Event>>;
}>;

export type OperatorAuditExportServiceOptions = Readonly<{
  workOutbox: AuditOutbox;
  incidentOutbox: AuditOutbox;
  workAudit: AuditSnapshotRepository<WorkAuditEvent>;
  incidentAudit: AuditSnapshotRepository<IncidentAuditEvent>;
}>;

const snapshotLimits = {
  maxEvents: OperatorAuditMaximumEventsPerStream,
  maxStoredBytes: OperatorAuditMaximumStoredJsonBytesPerStream,
} as const;

/** Reconciles and captures two complete independent audit streams for one confirmed instance. */
export class OperatorAuditExportService {
  constructor(private readonly options: OperatorAuditExportServiceOptions) {}

  async create(instance: PublicProcessInstanceIdentity): Promise<Uint8Array> {
    await this.options.workOutbox.reconcileAll();
    await this.options.incidentOutbox.reconcileAll();
    const work = await this.options.workAudit.snapshotHostingProcessInstance(
      instance.processInstanceId,
      snapshotLimits,
    );
    const incidentActions =
      await this.options.incidentAudit.snapshotHostingProcessInstance(
        instance.processInstanceId,
        snapshotLimits,
      );
    return serializeOperatorAuditExport({
      format: operatorAuditExportFormat,
      instance,
      work,
      incidentActions,
    }, instance);
  }
}
