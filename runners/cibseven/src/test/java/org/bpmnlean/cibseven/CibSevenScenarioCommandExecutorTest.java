package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.Date;
import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.BpmnErrorEffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteEffectStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.CompleteUserTaskInstanceStimulus;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.StringValue;
import org.bpmnlean.cibseven.ScenarioProtocol.SuccessfulEffectResult;
import org.bpmnlean.cibseven.ScenarioProtocol.UserTaskInstanceId;
import org.bpmnlean.cibseven.ScenarioProtocol.VariableBinding;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/** Separates unsupported CIB harness inputs from semantic command rejection. */
public class CibSevenScenarioCommandExecutorTest {

  private static final String MULTI_INSTANCE_RESOURCE =
      "org/bpmnlean/cibseven/CibSevenScenarioCommandExecutorTest.multiInstance.bpmn";
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("command-executor");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void rejectsUnsupportedEffectResultShapesAsHarnessFailures() {
    var executor =
        new CibSevenScenarioCommandExecutor(
            engine,
            new CibSevenEffectProjector(),
            new CibSevenEffectProbe(),
            new Date(0));
    var effectId = new EffectOccurrenceId("Instance_1", "Effect_A", 1);

    assertThrows(
        IllegalStateException.class,
        () ->
            executor.completeEffect(
                "engine-instance",
                "Instance_1",
                new CompleteEffectStimulus(
                    "complete-error",
                    effectId,
                    new BpmnErrorEffectResult("ErrorCode", null, List.of())),
                CibEffectExecutionSchedule.PLAIN_SUCCESS));
    assertThrows(
        IllegalStateException.class,
        () ->
            executor.completeEffect(
                "engine-instance",
                "Instance_1",
                new CompleteEffectStimulus(
                    "complete-patched-success",
                    effectId,
                    new SuccessfulEffectResult(
                        List.of(
                            new VariableBinding(
                                "result",
                                new StringValue("value"))))),
                CibEffectExecutionSchedule.PLAIN_SUCCESS));
  }

  @Test
  public void rejectsMultipleTasksForOneElementAsAHarnessFailure() {
    var deployment =
        engine
            .getRepositoryService()
            .createDeployment()
            .addClasspathResource(MULTI_INSTANCE_RESOURCE)
            .deploy();
    try {
      var process =
          engine
              .getRuntimeService()
              .startProcessInstanceByKey("MultiInstanceUserTask");
      assertEquals(
          2,
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(process.getId())
              .taskDefinitionKey("RepeatedTask")
              .count());
      var executor =
          new CibSevenScenarioCommandExecutor(
              engine,
              new CibSevenEffectProjector(),
              new CibSevenEffectProbe(),
              new Date(0));

      assertThrows(
          IllegalStateException.class,
          () ->
              executor.completeUserTaskInstance(
                  process.getId(),
                  "Instance_1",
                  new CompleteUserTaskInstanceStimulus(
                      "complete-repeated-task",
                      new UserTaskInstanceId(
                          "Instance_1",
                          "RepeatedTask",
                          1),
                      java.util.List.of())));
    } finally {
      engine
          .getRepositoryService()
          .deleteDeployment(deployment.getId(), true, true, true);
    }
  }
}
