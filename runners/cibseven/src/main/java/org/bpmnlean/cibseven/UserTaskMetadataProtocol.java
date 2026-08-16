package org.bpmnlean.cibseven;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Objects;

/** Neutral immutable User Task assignment and form metadata vocabulary. */
public final class UserTaskMetadataProtocol {

  private UserTaskMetadataProtocol() {}

  public record Candidate(String kind, String id) {
    public Candidate {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(id, "id");
    }
  }

  public record Assignment(List<Candidate> candidates) {
    public Assignment {
      candidates = List.copyOf(candidates);
    }
  }

  public record FormField(String key, String type) {
    public FormField {
      Objects.requireNonNull(key, "key");
      Objects.requireNonNull(type, "type");
    }
  }

  public record Form(List<FormField> fields) {
    public Form {
      fields = List.copyOf(fields);
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  @JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
  @JsonSubTypes({
    @JsonSubTypes.Type(AssignmentFormMetadata.class),
    @JsonSubTypes.Type(AssignmentOnlyMetadata.class)
  })
  public sealed interface UserTaskMetadata
      permits AssignmentFormMetadata, AssignmentOnlyMetadata {
    Assignment assignment();

    default Form form() {
      return null;
    }
  }

  public record AssignmentFormMetadata(Assignment assignment, Form form)
      implements UserTaskMetadata {
    public AssignmentFormMetadata {
      Objects.requireNonNull(assignment, "assignment");
      Objects.requireNonNull(form, "form");
    }
  }

  public record AssignmentOnlyMetadata(Assignment assignment) implements UserTaskMetadata {
    public AssignmentOnlyMetadata {
      Objects.requireNonNull(assignment, "assignment");
    }
  }
}
