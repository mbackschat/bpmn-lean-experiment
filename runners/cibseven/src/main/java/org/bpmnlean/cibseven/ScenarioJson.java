package org.bpmnlean.cibseven;

import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;

public final class ScenarioJson {

  private static final ObjectMapper MAPPER =
      JsonMapper.builder()
          .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
          .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
          .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
          .build();

  private ScenarioJson() {}

  public static ScenarioProtocol.ScenarioDefinition read(Path path) throws IOException {
    return read(Files.readString(path, StandardCharsets.UTF_8));
  }

  public static ScenarioProtocol.ScenarioDefinition read(String json)
      throws JsonProcessingException {
    rejectIntegerNegativeZero(json);
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioDefinition.class);
  }

  public static ScenarioProtocol.ScenarioResult readResult(String json)
      throws JsonProcessingException {
    rejectIntegerNegativeZero(json);
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioResult.class);
  }

  static int canonicalByteLength(Object value) {
    try {
      return MAPPER.writeValueAsBytes(value).length;
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("wire value cannot be serialized", exception);
    }
  }

  public static ScenarioProtocol.CanonicalResult readEvidenceResult(Path path)
      throws IOException {
    var evidence = MAPPER.readTree(path.toFile());
    return MAPPER.treeToValue(
        evidence.required("result"),
        ScenarioProtocol.CanonicalResult.class);
  }

  public static String writeScenario(ScenarioProtocol.ScenarioDefinition scenario)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(scenario);
  }

  public static String write(ScenarioProtocol.ScenarioResult result)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(result);
  }

  private static void rejectIntegerNegativeZero(String json)
      throws JsonProcessingException {
    var objects = new ArrayDeque<ValueObject>();
    try (var parser = MAPPER.createParser(json)) {
      while (parser.nextToken() != null) {
        switch (parser.currentToken()) {
          case START_OBJECT -> objects.push(new ValueObject());
          case FIELD_NAME -> objects.getFirst().field = parser.currentName();
          case VALUE_STRING -> {
            var object = objects.peekFirst();
            if (object != null && "kind".equals(object.field)) {
              object.kind = parser.getText();
            }
          }
          case VALUE_NUMBER_INT -> {
            var object = objects.peekFirst();
            if (object != null
                && "value".equals(object.field)
                && "-0".equals(parser.getText())) {
              object.negativeZero = true;
            }
          }
          case END_OBJECT -> {
            var object = objects.pop();
            if ("integer".equals(object.kind) && object.negativeZero) {
              throw new JsonParseException(parser, "integer rejects lexical negative zero");
            }
          }
          default -> {}
        }
      }
    } catch (IOException exception) {
      if (exception instanceof JsonProcessingException processingException) {
        throw processingException;
      }
      throw new IllegalStateException("in-memory JSON scan failed", exception);
    }
  }

  private static final class ValueObject {
    private String field;
    private String kind;
    private boolean negativeZero;
  }
}
