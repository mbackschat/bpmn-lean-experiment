package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
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
 * selected: exact extension binding, a durable async-before wait, public retry decrement, and a
 * test-local one-mutation/two-invocation re-execution.
 */
public final class CibSevenServiceTaskPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve("scenarios/service-task-effect/process.bpmn");
  private static final String PROCESS_ID = "Process_ServiceTaskEffectProbe";
  private static final String SERVICE_TASK_ID = "ServiceTask_Record";
  private static final String BPMN_NAMESPACE = CibSevenEffectProjector.BPMN_NAMESPACE;
  private static final String CAMUNDA_NAMESPACE = CibSevenEffectProjector.CAMUNDA_NAMESPACE;
  private static final String HANDLER_BEAN = CibSevenEffectProjector.HANDLER_BEAN;
  private static final String HANDLER_EXPRESSION = "${" + HANDLER_BEAN + "}";
  private static final String EFFECT_PROTOCOL = CibSevenEffectProjector.EFFECT_PROTOCOL;

  @Test
  public void decrementsRetriesAndReexecutesWithOneTestLocalMutation()
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
              .addString(RESOURCE.getFileName().toString(), readResource())
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
      requireExactEffectWait(projectEffectWait(engine, processInstance.getId()));
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
  public void rejectsADeployedBindingThatDoesNotMatchTheProfilePair() throws Exception {
    requireRejectedBinding(
        readResource()
            .replace(
                EFFECT_PROTOCOL,
                "urn:bpmn-lean:effect:unexpected-protocol"),
        "service-task-protocol-negative-control");
  }

  @Test
  public void rejectsADeployedDelegateExpressionForAnotherBean() throws Exception {
    requireRejectedBinding(
        readResource()
            .replace(
                HANDLER_EXPRESSION,
                "${unexpectedEffectHandler}"),
        "service-task-handler-negative-control");
  }

  private static void requireRejectedBinding(
      String source, String engineName) throws Exception {
    var engine =
        CibSevenTestEngine.create(
            engineName,
            configuration ->
                configuration.setBeans(
                    Map.of(HANDLER_BEAN, new SucceedingDelegate())));
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString(engineName + ".bpmn", source)
              .deploy()
              .getId();
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);

      assertThrows(
          IllegalStateException.class,
          () ->
              requireExactEffectWait(
                  projectEffectWait(engine, processInstance.getId())));
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
      ProcessEngine engine, String processInstanceId) throws Exception {
    var waits =
        new CibSevenEffectProjector()
            .project(engine, processInstanceId, "PhaseZero_Instance");
    if (waits.size() != 1) {
      throw new IllegalStateException(
          "Expected exactly one async-before Service Task job");
    }
    var job = waits.getFirst().evidence();
    return new EffectWaitProjection(
        job.elementId(),
        Math.toIntExact(job.activation()),
        job.protocol(),
        job.handler());
  }

  private static void requireExactEffectWait(EffectWaitProjection actual) {
    var expected =
        new EffectWaitProjection(
            SERVICE_TASK_ID, 1, EFFECT_PROTOCOL, HANDLER_BEAN);
    if (!expected.equals(actual)) {
      throw new IllegalStateException(
          "Deployed Service Task binding does not match the admitted profile: "
              + actual);
    }
  }

  private static String readResource() throws Exception {
    return Files.readString(RESOURCE);
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
                BPMN_NAMESPACE,
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
      String elementId, int activation, String protocol, String handler) {}

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
