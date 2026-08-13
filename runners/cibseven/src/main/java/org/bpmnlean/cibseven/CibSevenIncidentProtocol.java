package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;

/** Incident-specific raw public-service facts kept outside canonical state. */
final class CibSevenIncidentProtocol {

  private CibSevenIncidentProtocol() {}

  record IncidentJobSnapshot(
      String afterCommandId,
      boolean createIncidentOnFailedJobEnabled,
      List<IncidentJob> jobs) {
    IncidentJobSnapshot {
      Objects.requireNonNull(afterCommandId, "afterCommandId");
      if (!createIncidentOnFailedJobEnabled) {
        throw new IllegalArgumentException("incident snapshot requires enabled configuration");
      }
      jobs = List.copyOf(jobs);
    }
  }

  record IncidentJob(
      String publicJobId,
      long retries,
      boolean executable,
      boolean dueDatePresent,
      String processInstanceId,
      String elementId,
      FailedJobIncident incident) {
    IncidentJob {
      Objects.requireNonNull(publicJobId, "publicJobId");
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      if (retries < 0) {
        throw new IllegalArgumentException("job retries must be nonnegative");
      }
      if (incident != null) {
        incident.requirePartner(publicJobId, processInstanceId, elementId);
      }
    }
  }

  record FailedJobIncident(
      String publicIncidentId,
      String type,
      String configurationJobId,
      String processInstanceId,
      String elementId,
      String causeIncidentId,
      String rootCauseIncidentId) {
    FailedJobIncident {
      Objects.requireNonNull(publicIncidentId, "publicIncidentId");
      Objects.requireNonNull(type, "type");
      Objects.requireNonNull(configurationJobId, "configurationJobId");
      Objects.requireNonNull(processInstanceId, "processInstanceId");
      Objects.requireNonNull(elementId, "elementId");
      Objects.requireNonNull(causeIncidentId, "causeIncidentId");
      Objects.requireNonNull(rootCauseIncidentId, "rootCauseIncidentId");
    }

    private void requirePartner(String jobId, String jobProcessInstanceId, String jobElementId) {
      if (!"failedJob".equals(type)
          || !configurationJobId.equals(jobId)
          || !processInstanceId.equals(jobProcessInstanceId)
          || !elementId.equals(jobElementId)
          || !causeIncidentId.equals(publicIncidentId)
          || !rootCauseIncidentId.equals(publicIncidentId)) {
        throw new IllegalArgumentException(
            "failed-job incident must match and be self-rooted in its public job");
      }
    }
  }
}
