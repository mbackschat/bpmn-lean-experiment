package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import javax.xml.parsers.DocumentBuilderFactory;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.DelegateExecution;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.junit.Test;
import org.xml.sax.InputSource;

/**
 * Establishes the packaged-engine facts required before the Service Task effect account can be
 * selected: exact extension binding, a durable async-before wait, public retry decrement, and an
 * idempotent fail-after-mutation re-execution.
 */
public final class CibSevenServiceTaskPhaseZeroProbeTest {

  private static final String RESOURCE =
      "org/bpmnlean/cibseven/CibSevenServiceTaskPhaseZeroProbeTest.bpmn";
  private static final String PROCESS_ID = "Process_ServiceTaskEffectProbe";
  private static final String SERVICE_TASK_ID = "ServiceTask_Record";
  private static final String CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
  private static final String HANDLER_BEAN = "bpmnLeanEffectHandler";
  private static final String HANDLER_EXPRESSION = "${" + HANDLER_BEAN + "}";
  private static final String IMPLEMENTATION = "urn:bpmn-lean:effect:probe-v1";

  @Test
  public void decrementsRetriesAndReexecutesTheIdempotentBeanWithoutAdministrativeMutation()
      throws Exception {
    var delegate = new FailAfterMutationOnce();
    var capturedParse = new AtomicReference<BpmnParse>();
    var engine =
        CibSevenTestEngine.create(
            "service-task-phase-zero",
            configuration -> {
              configuration.setBeans(Map.of(HANDLER_BEAN, delegate));
              configuration.setBpmnParseFactory(
                  parser -> {
                    var parse = new BpmnParse(parser);
                    capturedParse.set(parse);
                    return parse;
                  });
            });
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addClasspathResource(RESOURCE)
              .deploy()
              .getId();
      assertNotNull(capturedParse.get());
      assertFalse(capturedParse.get().hasWarnings());

      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var management = engine.getManagementService();
      var job =
          management
              .createJobQuery()
              .processInstanceId(processInstance.getId())
              .activityId(SERVICE_TASK_ID)
              .singleResult();
      assertNotNull(job);
      assertEquals(3, job.getRetries());
      assertNull(job.getDuedate());
      assertNotNull(
          management.createJobQuery().jobId(job.getId()).executable().singleResult());
      assertEquals(
          new EffectWaitProjection(SERVICE_TASK_ID, 1, IMPLEMENTATION, HANDLER_BEAN),
          projectEffectWait(engine, processInstance.getId()));
      assertEquals(0, delegate.invocations());
      assertEquals(0, delegate.mutations());
      assertEquals(0, management.createJobQuery().jobId(job.getId()).timers().count());

      var failure =
          assertThrows(
              RuntimeException.class,
              () -> management.executeJob(job.getId()));
      assertEquals(
          "scripted failure after durable external mutation",
          failure.getMessage());

      var failedJob = management.createJobQuery().jobId(job.getId()).singleResult();
      assertNotNull(failedJob);
      assertEquals(2, failedJob.getRetries());
      assertNull(failedJob.getDuedate());
      assertNotNull(
          management
              .createJobQuery()
              .jobId(failedJob.getId())
              .executable()
              .singleResult());
      assertEquals(1, delegate.invocations());
      assertEquals(1, delegate.mutations());

      management.executeJob(failedJob.getId());

      assertEquals(2, delegate.invocations());
      assertEquals(1, delegate.mutations());
      assertEquals(0, management.createJobQuery().jobId(job.getId()).count());
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstance.getId())
              .count());
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createIncidentQuery()
              .processInstanceId(processInstance.getId())
              .count());
    } finally {
      if (deploymentId != null) {
        engine
            .getRepositoryService()
            .deleteDeployment(deploymentId, true, true, true);
      }
      engine.close();
    }
  }

  @Test
  public void resolvesDelegateAndAsyncBeforeByExpandedQNameRatherThanPrefix()
      throws Exception {
    var delegate = new SucceedingDelegate();
    var source =
        readResource()
            .replace("xmlns:camunda=", "xmlns:probe=")
            .replace("camunda:delegateExpression", "probe:delegateExpression")
            .replace("camunda:asyncBefore", "probe:asyncBefore");
    assertExpandedQNames(source);

    var engine =
        CibSevenTestEngine.create(
            "service-task-qname-probe",
            configuration ->
                configuration.setBeans(Map.of(HANDLER_BEAN, delegate)));
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString("service-task-qname-probe.bpmn", source)
              .deploy()
              .getId();
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var job =
          engine
              .getManagementService()
              .createJobQuery()
              .processInstanceId(processInstance.getId())
              .activityId(SERVICE_TASK_ID)
              .singleResult();
      assertNotNull(job);

      engine.getManagementService().executeJob(job.getId());

      assertEquals(1, delegate.invocations());
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstance.getId())
              .count());
    } finally {
      if (deploymentId != null) {
        engine
            .getRepositoryService()
            .deleteDeployment(deploymentId, true, true, true);
      }
      engine.close();
    }
  }

  private static EffectWaitProjection projectEffectWait(
      ProcessEngine engine, String processInstanceId) {
    var jobs =
        engine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(processInstanceId)
            .activityId(SERVICE_TASK_ID)
            .list();
    if (jobs.size() != 1) {
      throw new IllegalStateException(
          "Expected exactly one async-before Service Task job");
    }
    return new EffectWaitProjection(
        SERVICE_TASK_ID, 1, IMPLEMENTATION, HANDLER_BEAN);
  }

  private static String readResource() throws Exception {
    try (var input =
        CibSevenServiceTaskPhaseZeroProbeTest.class
            .getClassLoader()
            .getResourceAsStream(RESOURCE)) {
      if (input == null) {
        throw new IllegalStateException("Missing phase-zero BPMN resource");
      }
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private static void assertExpandedQNames(String source) throws Exception {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    var document =
        factory
            .newDocumentBuilder()
            .parse(new InputSource(new java.io.StringReader(source)));
    var serviceTask =
        document
            .getElementsByTagNameNS(
                "http://www.omg.org/spec/BPMN/20100524/MODEL",
                "serviceTask")
            .item(0);
    assertEquals(
        HANDLER_EXPRESSION,
        serviceTask
            .getAttributes()
            .getNamedItemNS(CAMUNDA_NAMESPACE, "delegateExpression")
            .getNodeValue());
    assertEquals(
        "true",
        serviceTask
            .getAttributes()
            .getNamedItemNS(CAMUNDA_NAMESPACE, "asyncBefore")
            .getNodeValue());
  }

  private record EffectWaitProjection(
      String elementId, int activation, String implementation, String handler) {}

  private static final class FailAfterMutationOnce implements JavaDelegate {

    private int invocations;
    private int mutations;

    @Override
    public void execute(DelegateExecution execution) {
      invocations += 1;
      if (mutations == 0) {
        mutations += 1;
        throw new IllegalStateException(
            "scripted failure after durable external mutation");
      }
    }

    int invocations() {
      return invocations;
    }

    int mutations() {
      return mutations;
    }
  }

  private static final class SucceedingDelegate implements JavaDelegate {

    private int invocations;

    @Override
    public void execute(DelegateExecution execution) {
      invocations += 1;
    }

    int invocations() {
      return invocations;
    }
  }
}
