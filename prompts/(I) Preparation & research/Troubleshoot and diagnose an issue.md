{% comment %}
vars:
  error_message:
    type: text
    label: "Error message or stack trace (paste here)"
{% endcomment %}

<!--
# version: 1.0
# ReferenceLocation: workflowBeforeEditing
# Reference: Diagnose the error before applying any fix, as per "{{blockName}}"
-->

Analyze this error: `{{ error_message }}`

## Actions Required

1. Research the problem space and context.
2. List the top 3 most likely root causes.
3. Explain what files/data to check to verify each cause.
4. Suggest debugging steps.

## Constraints

- **NO FIXES YET:** Do not provide the final code fix yet.
