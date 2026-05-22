<!-- 
# ReferenceLocation: workflowEndOfTask
# Reference: Ensure there are no errors in the updated project code as per "{{blockName}}"
-->

Ensure there are no errors in the updated project code.

## Expectations
- Use available IDE tools or LSP (Language Server Protocol) diagnostics first to scan for errors and warnings.
- If LSP or IDE diagnostics belong to the workspace are not fully available, manually run the configured lint or build scripts (e.g. `npm run lint` or `tsc`). If changes are limited in scope prefer running these on a workspace/package rather than the whole project if possible.
- Report any new errors that were introduced.

## Constraints
- DO NOT assume the code works just because it looks visually correct; rely completely on the diagnostic tooling.
