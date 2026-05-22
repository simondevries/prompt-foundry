<!-- 
# version: 1.0
# ReferenceLocation: none
-->
# Context: Running Tests

*(Note: This is an example context file. Replace these instructions with the specific commands your project uses for testing!)*

## Test Commands
- **Run All Tests:** Use `npm run test` to run the entire unit test suite.
- **Run Specific File:** Use `npm run test -- <filename>` to run tests only for the current file.
- **End-to-End (E2E):** Use `npm run test:e2e` to trigger the integration testing suite.

## Testing Rules for AI
- **Be targeted:** Running the entire test suite takes a long time. Only run tests for the specific file or module you just modified.
- **Diagnostics first:** If a test fails, clearly read the terminal error output to understand what property or assertion broke before changing code.
- **Build if necessary:** If testing requires a fresh build in this environment, ensure you run the build step first.
