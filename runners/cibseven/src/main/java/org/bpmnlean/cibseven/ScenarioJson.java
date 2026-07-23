package org.bpmnlean.cibseven;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

public final class ScenarioJson {

  private static final ObjectMapper MAPPER =
      JsonMapper.builder()
          .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
          .build();

  private ScenarioJson() {}

  public static ScenarioProtocol.ScenarioDefinition read(Path path) throws IOException {
    return MAPPER.readValue(path.toFile(), ScenarioProtocol.ScenarioDefinition.class);
  }

  public static ScenarioProtocol.ScenarioDefinition read(String json)
      throws JsonProcessingException {
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioDefinition.class);
  }

  public static ScenarioProtocol.ScenarioResult readResult(String json)
      throws JsonProcessingException {
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioResult.class);
  }

  public static List<ScenarioProtocol.CanonicalObservation> readCanonicalTrace(
      JsonNode json) throws IOException {
    return MAPPER
        .readerForListOf(ScenarioProtocol.CanonicalObservation.class)
        .readValue(json);
  }

  public static String writeScenario(ScenarioProtocol.ScenarioDefinition scenario)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(scenario);
  }

  public static String write(ScenarioProtocol.ScenarioResult result)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(result);
  }
}
