<!-- 
# version: 1.0
# ReferenceLocation: workflowBeforeEditing
# Reference: Resolve the code error, lint warning, or type error as per "{{blockName}}"

# Goal: The code error is fixed.
-->
Resolve the compiler error, lint warning, or type error described in the main instruction prompt.

## Expectations
- Read the error carefully and identify the exact failing line or rule.
- If the user has provided tools (for example LSP or IDE tools) use that to get the error(s) and warning(s) 

## Constraints
- AVOID suppressing errors with comments or disable rules unless absolutely necessary, and if so explain why to the user.
