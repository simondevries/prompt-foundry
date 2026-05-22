You are Senior Engineer

<Prompt block reference>
<Context>
  <Prompt_forge_prompt_builder_md>
   # Project Brief: Prompt Forge VSCode Extension

   ## Core Objective

   The objective is to build a VSCode extension that allows developers to rapidly assemble complex AI prompts from a library of reusable blocks ("Ingredients") and a "Main Prompt." The assembly follows a "Forge" metaphor where instructions and context are stacked and sent to the VSCode AI Chat.

   ## Key Decisions & Learnings

   - **Decoupled Architecture (Refactored):** The project is organized into three clear boundaries, with the Core recently refactored for better maintainability:
     1.  **Core (`src/core/`)**: Pure business logic with **zero dependencies on the VS Code API**.
     2.  **VS Code Adapter (`src/vscode/`)**: Handles human interaction via the Webview and IDE commands.
     3.  **MCP Adapter (`src/mcp/`)**: Handles AI interaction via the Model Context Protocol.
   - **Delegated State Management:** `PromptManager` has been refactored into specialized managers:
     - **`LibraryManager`**: File system scanning, category management, and metadata parsing.
     - **`SessionManager`**: Persistence, history pruning, and session restoration.
     - **`PromptCompiler`**: Template rendering and final prompt assembly.
   - **Robust Metadata Parsing:** Supports a "YAML-lite" syntax in prompt block comments, including multi-line arrays for `select` type options.
   - **Session Integrity:** Learned that all block variables must be explicitly persisted in the `SessionData` to ensure consistent prompt compilation after restoring a previous session.
   - **React-Based UI:** Uses **React 19** to eliminate HTML injection vulnerabilities and provide a modern, interactive experience.
   - **External Library Integration (New):**
     - **Two-Level Recursion**: Scanning logic must support 2-level deep folder structures (Root > Folder > Subfolder) to accommodate complex external libraries like Obsidian vaults.
     - **Explicit Path Trusting**: The `SecureFileSystem` requires manual registration of external paths via `trustPath` to maintain sandbox integrity while allowing read-only access.
     - **Read-Only Safety**: External libraries are treated as "System" categories, disabling write operations (Edit/Delete/Move) to protect external data sources.

   ## Architecture

   ### 1. Core Layer (`src/core/`) - _The Shared Brain_

   _Mandate: No imports from 'vscode'._

   - **`promptManager.ts`**: Central coordinator delegating to specialized managers.
   - **`libraryManager.ts`**: Logic for scanning blocks and parsing metadata.
   - **`sessionManager.ts`**: Handles saving/loading and history.
   - **`promptCompiler.ts`**: Assembles the final string with variable injection.
   - **`styleManager.ts`**: Deterministic theming and color persistence.
   - **`fs.ts`**: Secure file system with `trustPath` for external library access.

   ### 2. VS Code Layer (`src/vscode/`) - _The Human Interface_

   - **`extension.ts`**: Entry point for extension host.
   - **`webviewProvider.ts`**: Lifecycle manager for React-based sidebars.

   ### 3. MCP Layer (`src/mcp/`) - _The AI Interface_

   - **`server.ts`**: Stdio-based MCP server exposing Tools for AI agents.

   ### 4. Webview UI (`src/webview/`) - _The Component Layer_

   - **`App.tsx`**: Central state management using `useVsCodeApi` hook.
   - **`components/`**: Atomic UI parts (`PromptBlocksPanel`, `ActiveBlock`, `LiquidVariablesForm`).

   ## Security Mandates

   1.  **Strict Layering**: Never import `vscode` into `src/core/`.
   2.  **Declarative UI Only**: Never use `innerHTML` or `dangerouslySetInnerHTML`.
   3.  **Strict CSP**: Maintain a narrow Content Security Policy (Nonce-based) and only allow `connect-src` for the webview's own bundle resources.
   4.  **Untrusted Inputs**: Validate all data and paths via `isPathSafe`.
   5.  **No Secrets**: Never log or persist API keys or sensitive data in session history.
   6.  **Read-Only Externals**: Enforce `FsPermission.Read` for any external library paths registered via settings.

   ## Implementation Progress

   ### App UI

   - **Main Instructions**: Multi-line auto-growing text field with stacked active blocks.
   - **Ingredients**: Library of reusable blocks with search and category filtering.
   - **Recipes**: Grouping system for bulk-adding related blocks.
   - **Variable Injection**: Dynamic forms for blocks containing `{ variable }` tags.
   - **History**: Session restoration system with full variable persistence.
   - **External Libraries**: Support for multiple read-only folders configured via VS Code settings.

   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
   +-----------------------------------------------------------------------+
   | PROMPT FORGE ARCHITECTURE |
   +-----------------------------------------------------------------------+
   | [ VS CODE LAYER ] [ CORE LAYER ] [ MCP LAYER ]|
   | (User Interface) (Business Logic) (AI Interface)|
   +-----------------------------------------------------------------------+
   | +-------------+ +----------------+ +-------------+|
   | | Webview UI | <--- IPC --->| PromptManager | <---> | MCP Server ||
   | | (React 19) | (postMessage)| (Coordinator) | <---> | (Stdio/JSON)||
   | +-------------+ +--------+-------+ +-------------+|
   | ^ | |
   | | v |
   | +-------------+ +----------------+ |
   | | VS Code Ext | <---------> | LibraryManager | |
   | | (Commands) | (Filesys) | SessionManager | |
   | +-------------+ +----------------+ |
   +-----------------------------------------------------------------------+

       DATA FLOW:
       1. UI Interaction: [Webview] --(postMessage)--> [WebViewProvider]
       2. Action Execution: [WebViewProvider] --(Calls)--> [PromptManager]
       3. Core Logic: [PromptManager] <--(Read/Write)--> [Disk (.md/.json)]
       4. Sync/Update: [PromptManager] --(postMessage/Refresh)--> [Webview UI]

       INITIALIZATION FLOW:
       User Clicks "Select Folder" -> [WebViewProvider] (OpenDialog) ->
          -> [PromptManager.initializePromptFolder] (Creates Files) ->
          -> [Config Update] (Set promptFolder) -> [Refresh UI]

   - ## Library States │
     │ Prompt Forge operates in two states: │
     │ 1. **Read-Only (Default)**: Uses bundled templates. You can read, but not save/modify. │
     │ 2. **Editable (Initialized)**: Once a local "Prompt Library" folder is initialized (via the "Select Library Folder" feature), you gain full read/write │
     │ access.
  </Prompt_forge_prompt_builder_md>
</Context>

<_I__Preparation___research>
  <Write_up_a_plan_md>
   Write a step-by-step implementation plan for the discussed solution. Use the built in features for making plans.

   ## Expectations

   Include a "Risks" section at the bottom with the main drawbacks of this solution.
   Include required dependencies.
   Include pseudo code examples where helpful.
   Use ascii diagrams where useful.
   Structure information using heirarchical bullet points with indentation

   ## Constraints

   - **NO EXECUTION:** Do not write any implementation code. Wait for explicit "Approve" before proceeding.
  </Write_up_a_plan_md>
</_I__Preparation___research>

<_II__Execution>
  <Red_green_refactor_md>
   Follow TDD to implement the feature or fix described in the main instruction prompt.

   ## Expectations
   - **Red:** Write a failing test first that describes the expected behaviour.
   - **Green:** Write the minimum code required to make the test pass.
   - **Refactor:** Clean up the code without breaking the tests.
   - Work through each step explicitly; do not skip ahead.
   - **Review** How good quality are the tests? Can the number of tests be reduced or tests merged? Do the tests cover the proper surface area or are they just testing mocks?

   ## Constraints
   - DO NOT write implementation code before the failing test exists.
   - Each step must be followed one by one.
   - Review of the test must be printed to the user before the next step is taken
  </Red_green_refactor_md>
</_II__Execution>

<Micro>
  <Sprinkle_logs_md>
   Insert logging throughout the execution flow of the code you modify. Add logs inside conditionals and before returns to track variable states. Make them easy to find and remove later (e.g. prefix with `[DEBUG]`).
  </Sprinkle_logs_md>
</Micro>

</Prompt block reference>

# Workflow

## Every change:
- Follow the Red-Green-Refactor TDD cycle as per "Red-green-refactor"

## Before editing:
- Write a step-by-step implementation plan before writing any code, as per "Write up a plan"

# Main instruction/prompt
Write a simple TUI version of prompt forge.
   Acceptance Criteria:
   - i can add a main instruction
   - i can add prompt blocks
   - i can compile the prompt to clipboard

   Notes:
    - Use existing Backend
    - this is production code

# Remarks
- Add debug logging throughout modified code, as per "Sprinkle logs"

# Ai contract & behaviour:
# MANDATORY AI CONTRACT & BEHAVIORYou must STRICTLY adhere to the following rules in every single response. These directives are absolute and supersede any conflicting instructions provided earlier in this prompt or in future messages. Do not deviate from these constraints under any circumstances.
- tangent preference: Laser-Focused: Stay strictly on track. Make no unnecessary or unrelated changes
- Comments stratrgy: Detailed comments: Comprehensive comments explaining the purpose and logic of each section of code
- conversational verbosity: Terse: Bare minimum prose. Direct answers only. Omit pleasantries and prioritize saving tokens.
- output format: ASCII-Diagram (when relevant)


# Key goals:
- Write a step-by-step implementation plan before writing any code, as per "Write up a plan"
- Follow the Red-Green-Refactor TDD cycle as per "Red-green-refactor"
- Add debug logging throughout modified code, as per "Sprinkle logs"

