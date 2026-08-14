import type {
  IncidentAuditPage,
  IncidentAuditRequest,
} from "../src/incident-audit.js";
import type {
  IncidentActionRequest,
  IncidentActionResult,
  PublicIncident,
  PublicIncidentSnapshot,
} from "../src/incidents.js";

declare const incident: PublicIncident;
declare const snapshot: PublicIncidentSnapshot;
declare const action: IncidentActionRequest;
declare const result: IncidentActionResult;
declare const auditRequest: IncidentAuditRequest;
declare const auditPage: IncidentAuditPage;

// @ts-expect-error nested effect occurrence identity is immutable
incident.incident.effect.id.activation = 2;
// @ts-expect-error complete hosting definition identity is deeply immutable
incident.hostingInstance.definition.source.sha256 = "0".repeat(64);
// @ts-expect-error available interactions are immutable tuples
incident.availableInteractions.push(action);
// @ts-expect-error aggregate incident order is immutable
snapshot.incidents.push(incident);
// @ts-expect-error action incident identity is immutable
action.incidentId.generation = 2;
// @ts-expect-error action results are deeply immutable
result.interaction.incidentId.effectId.elementId = "changed";
// @ts-expect-error audit filters are immutable
auditRequest.actorId = "changed";
// @ts-expect-error audit pages are deeply immutable
auditPage.events[0].outcome = "committed";
