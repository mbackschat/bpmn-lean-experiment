package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;

import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

public final class CibSevenParallelGatewayProbeTest {

  private static final String RESOURCE =
      "org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.duplicateSameFlow.bpmn";
  private static final String PROCESS_ID = "Process_DuplicateSameFlowArrival";

  @Test
  public void activatesJoinFromTwoArrivalsThroughOneIncomingFlow()
      throws Exception {
    var engine = CibSevenTestEngine.create("parallel-gateway-probe");
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addClasspathResource(RESOURCE)
              .deploy()
              .getId();
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);

      completeOnlyTask(engine, processInstance.getId(), "User_Left_A");
      completeOnlyTask(engine, processInstance.getId(), "User_Left_B");
      assertEquals(
          2,
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .taskDefinitionKey("User_Left_Merge")
              .count());

      var duplicateLeftArrivals =
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .taskDefinitionKey("User_Left_Merge")
              .list();
      for (var task : duplicateLeftArrivals) {
        engine.getTaskService().complete(task.getId());
      }

      assertEquals(
          1,
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .taskDefinitionKey("User_Right")
              .count());
      assertEquals(
          1,
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .taskDefinitionKey("User_After_Join")
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

  private static void completeOnlyTask(
      ProcessEngine engine,
      String processInstanceId,
      String taskDefinitionKey) {
    var task =
        engine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey(taskDefinitionKey)
            .singleResult();
    engine.getTaskService().complete(task.getId());
  }
}
