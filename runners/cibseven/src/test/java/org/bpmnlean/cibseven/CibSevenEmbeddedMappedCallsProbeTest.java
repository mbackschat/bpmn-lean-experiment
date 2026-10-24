package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates Stage B of `PC-SCOPE-05` (`CALLN-FRAME-01`) on the retained guarantor loan: a Call inside the Guarantor
 * review Sub-Process returns its output into the Sub-Process's declared local rather than the caller Process, which
 * receives it only through the Sub-Process output parameter, while the root-path Call of the same definition keeps its
 * own mappings and output. The caller's variables are asserted at the points the guarantor scenarios observe, and each
 * child instance's own variables through CIB's query API. No CIB child-instance or task id is mapped to the project's
 * derived called identity.
 */
public final class CibSevenEmbeddedMappedCallsProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODEL =
      PROJECT_ROOT.resolve("scenarios/repeated-nested-concurrent-calls/guarantor-loan.bpmn");

  @Test
  public void theSubProcessCallWritesItsFrameAndTheRootCallKeepsItsOwnOutput() throws Exception {
    try (var session = new Session()) {
      var loan = session.start(Map.of("amount", "25000", "applicant", "Ada", "guarantor", "Bob"));
      session.register(loan);
      var applicant = session.called(loan);
      assertEquals(Map.of("amount", "25000", "customer", "Ada"),
          session.engine.getRuntimeService().getVariablesLocal(applicant));
      session.complete(applicant, "CollectDocument", Map.of("amount", "20000"));
      session.complete(applicant, "RecordVerdict", Map.of("verdict", "approved"));
      var afterApplicant = Map.<String, Object>of(
          "amount", "25000", "applicant", "Ada", "applicantVerdict", "approved", "guarantor", "Bob");
      assertEquals(afterApplicant, session.engine.getRuntimeService().getVariablesLocal(loan));

      // The second Call reads its input along the Guarantor review's chain and holds only its own mapped input.
      var guarantor = session.called(loan);
      assertEquals(Map.of("customer", "Bob"), session.engine.getRuntimeService().getVariablesLocal(guarantor));
      assertEquals("pending", session.reviewLocal(loan));
      session.complete(guarantor, "CollectDocument", Map.of());
      session.complete(guarantor, "RecordVerdict", Map.of("verdict", "rejected"));

      // The output lands in the declaring Sub-Process frame; the Process holds no guarantorVerdict until it publishes.
      assertEquals("rejected", session.reviewLocal(loan));
      assertEquals(afterApplicant, session.engine.getRuntimeService().getVariablesLocal(loan));
      session.complete(loan, "ConfirmGuarantor", Map.of());
      var expected = new HashMap<String, Object>(afterApplicant);
      expected.put("guarantorVerdict", "rejected");
      session.assertEnded(loan, expected);
    }
  }

  @Test
  public void anAbsentGuarantorIsCopiedAsAPresentNullAndTheSecondVerdictNeverReachesTheFirstTarget() throws Exception {
    try (var session = new Session()) {
      var loan = session.start(Map.of("amount", "8000", "applicant", "Grace"));
      session.register(loan);
      var applicant = session.called(loan);
      session.complete(applicant, "CollectDocument", Map.of());
      session.complete(applicant, "RecordVerdict", Map.of("verdict", "rejected"));
      var guarantor = session.called(loan);
      var copied = session.engine.getRuntimeService().getVariablesLocal(guarantor);
      assertTrue(copied.containsKey("customer"));
      assertEquals(null, copied.get("customer"));
      assertFalse(copied.containsKey("amount"));
      session.complete(guarantor, "CollectDocument", Map.of());
      session.complete(guarantor, "RecordVerdict", Map.of("verdict", "approved"));
      var afterGuarantor = Map.<String, Object>of("amount", "8000", "applicant", "Grace", "applicantVerdict", "rejected");
      assertEquals(afterGuarantor, session.engine.getRuntimeService().getVariablesLocal(loan));
      assertEquals("approved", session.reviewLocal(loan));
      session.complete(loan, "ConfirmGuarantor", Map.of());
      var expected = new HashMap<String, Object>(afterGuarantor);
      expected.put("guarantorVerdict", "approved");
      session.assertEnded(loan, expected);
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session() throws Exception {
      JavaDelegate register = execution -> assertTrue(execution.hasVariable("applicant"));
      engine = CibSevenTestEngine.create("embedded-mapped-calls",
          configuration -> configuration.setBeans(Map.of("registerApplication", register)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("guarantor-loan.bpmn", Files.readString(MODEL)).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey("Process_GuarantorLoan", variables).getId();
    }

    void register(String loan) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(loan).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    /** The one live child instance; the earlier Call's child has ended before the second Call starts. */
    String called(String loan) {
      var called = engine.getRuntimeService().createProcessInstanceQuery().superProcessInstanceId(loan).singleResult();
      assertNotNull(called);
      return called.getId();
    }

    /** The Guarantor review's own `guarantorVerdict`, which is not a variable of the caller's Process scope. */
    Object reviewLocal(String loan) {
      var variable = engine.getRuntimeService().createVariableInstanceQuery().processInstanceIdIn(loan)
          .variableName("guarantorVerdict").singleResult();
      assertNotNull(variable);
      assertFalse(variable.getExecutionId().equals(loan));
      return variable.getValue();
    }

    void complete(String instance, String element, Map<String, Object> patch) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance)
          .taskDefinitionKey(element).singleResult();
      assertNotNull(task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(patch));
    }

    void assertEnded(String loan, Map<String, Object> expected) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(loan).count());
      var actual = new HashMap<String, Object>();
      for (var variable : engine.getHistoryService().createHistoricVariableInstanceQuery().processInstanceId(loan).list()) {
        if (variable.getActivityInstanceId().equals(loan) || variable.getExecutionId().equals(loan)) {
          actual.put(variable.getName(), variable.getValue());
        }
      }
      assertEquals(expected, actual);
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deployment, true, true, true);
      } finally {
        engine.close();
      }
    }
  }
}
