<!-- 
# version: 1.0
# ReferenceLocation: none
-->
# Context: Project Conventions

*(Note: This is an example context file. Feel free to overwrite this with your own project's specific conventions!)*

## Formatting & Styling
- Prefer standard `function` declarations over arrow functions for top-level component exports.
- Use explicit return types for all public API functions.
- Avoid using `any`; fall back to `unknown` and type-guard if necessary.

## Testing Philosophy
- Every new feature should include at least a basic smoke test.
- Do not test implementation details; test inputs and outputs.
