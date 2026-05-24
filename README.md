<div align="center">
  <img src="assets/150.png" alt="Prompt Foundry Logo" width="150" />
  <h1>Prompt Foundry</h1>
  <br />
  <img src="https://img.shields.io/github/languages/count/simondevries/prompt-foundry" alt="GitHub language count" />
  <img src="https://img.shields.io/github/languages/top/simondevries/prompt-foundry?color=yellow" alt="GitHub top language" />
  <img src="https://img.shields.io/github/forks/simondevries/prompt-foundry?style=social" alt="GitHub forks" />
  <img src="https://img.shields.io/github/stars/simondevries/prompt-foundry?style=social" alt="GitHub Repo stars" />
  <br />
  <a href="https://marketplace.visualstudio.com/items?itemName=sdevries.prompt-foundry">
    <img src="https://img.shields.io/badge/VS%20Code-Install-blue?logo=visual-studio-code" alt="Install from VS Code Marketplace" />
  </a>
</div>

AI goes off the rails in large codebases. It forgets conventions, ignores architecture, and needs constant steering. Prompt Foundry fixes that with composable prompt blocks, behavioral guardrails, and a knowledge library that updates itself through your AI sessions. Works with any AI tool - Claude, Cursor, Copilot, and others.

## Benchmark

Run #1 is a baseline prompt. Run #2 uses Prompt Foundry. Both use Gemini Flash Lite 3.1.

The key differences: better code structure and far less handholding.

| Run | Achieved Task | Code Structure | Handholding | Remaining Sig. Bugs |
| :--- | :--- | :--- | :--- | :--- |
| **#1 Baseline** | Yes | 1 large component | Yes (had to re-align) | Scrolling bug |
| **#2 Foundry** | Yes | 3 components, 1 test | Minimal (errors/next steps) | |

Run #2 also followed instructions in the prompt blocks, generating code according to defined style.

| Make a Plan | Used Information | TDD Approach | Code Comments | Added Logs |
| :--- | :--- | :--- | :--- | :--- |
| ✓ including all sections | ✓ Used to stay on track | Attempted | ✓ Some added | ✓ Logs |

Details: [Baseline](https://github.com/simondevries/prompt-foundry/commit/3126169a48daa651567340c4127fcb4afb0f14dc#diff-dedd314698bfcab1f61269c945458e105db17cbbf27163bf6e5bebdab2a99cad) | [Foundry run](https://github.com/simondevries/prompt-foundry/commit/ec1343262bf392c12db477a2a78f5d3a817bb735)

<details>
<summary>AI comparison of diffs</summary>

Both runs used `ink` (React-based TUI) and `clipboardy`. The architectural differences matter most if this TUI is to share a core backend with the VSCode extension, which is the intended direction.

**Baseline (#1)** added `commander` *and* `meow` - two CLI argument parsers doing the same job. It also added `chalk` for terminal styling alongside `ink`, creating two competing approaches: ink's declarative React component model vs. imperative ANSI escape codes. This kind of mixed-paradigm dependency set creates friction as the codebase grows. It also included no test infrastructure.

**Run #2** dropped both redundant dependencies, kept styling within ink's component model, extended the component set with `ink-select-input`, and added `jest`, `ts-jest`, and `ink-testing-library`. The core business logic (`LibraryManager`, `SessionManager`, `PromptCompiler`) already has zero VSCode dependencies by design. Run #2's test setup means TUI components and core logic can both be unit-tested in isolation, without spinning up a VSCode instance or a live terminal.

In short: Run #1 works but accumulates debt. Run #2 reflects an understanding of where the project is heading.
</details>

## How it works

1. Type your prompt
2. Select your prompt blocks (instructions and information)
3. Mark the most important ones as goals
4. Copy/send to AI
5. Use the MCP server to let the AI update blocks at the end of the session

<img src="assets/screenshot_overview.png" alt="Overview" >
<img src="assets/example_prompt.png" alt="Example prompt" >

[See demo](#demo)

## Why use it

* **Less context bloat:** Move AI instructions out of `agents.md` files into task-specific prompt blocks. Reduces conflicting information passed to the AI.
* **Self-improving knowledge library:** The local MCP server lets the AI update your prompt block library mid-session. Your knowledge base improves with use.
* **Templating:** Liquid syntax lets you customize prompt blocks for the current task without rewriting from scratch.
* **Git and IDE tools:** Record selection adds your current code selection to the prompt. Useful for dictating while navigating a codebase.

## Setup

### Extension
Install from the VS Code marketplace. To add or edit prompt templates, allow the extension to create a prompt library on your file system. Set the location via the gear icon next to prompt blocks or through VS Code settings.

> Note: When editing from the editor you need to open the prompt library folder in VS Code and click 'trust'. The folder only contains `.md` files and prompt settings files.

### MCP server

> Note: The MCP server requires Node.js to be installed on your machine.

1. Open the extension
2. Click the gear next to `Prompt Block Library`
3. Click `Setup MCP Server...`
4. Copy the JSON snippet
5. Add it to your AI's MCP config

> Note: The MCP server runs locally as a Node.js process in the VS Code extension folder. The AI can read and modify the content of the specified prompt library folder via MCP tool calls.

## Features

### Instructions prompt
Enter your main instructional prompt into the top instruction box.

The live focus (⚡) button lets you select files and lines in the IDE and adds those locations to the prompt. Useful for dictating while navigating a codebase - you end up with contextual file tags as you navigate, similar to someone watching your screen as you explain.

### Prompt blocks
Broken down into categories, one per folder, plus a set of special categories. Optionally add your Claude or Cursor skills too.

#### References
Each prompt block can include a short reference - a reminder that gets injected into the workflow section of the prompt at a specific moment. Rather than listing all instructions upfront and hoping the AI remembers them, references tell the AI *when* to act on an instruction. This has been shown to improve adherence.

```markdown
<!--
# reference: Ensure the code has been refactored by the end of the task
# referencelocation: workflowEndOfTask
-->
```

`referenceLocation` controls when the reminder fires:

| Value | When |
| :--- | :--- |
| `workflowFirstTurn` | Start of the first turn |
| `workflowEveryChange` | Before every code change |
| `workflowBeforeEditing` | Before the AI starts editing |
| `workflowEndOfTask` | End of the task |
| `pre` | Top of the prompt |
| `remark` | General remark |

#### Goals
Star a block to mark it as a goal. Its reference text gets pulled into a dedicated `# Key goals for while completing this task:` section at the end of the prompt, giving the AI a clear summary of what matters most before it starts work.

#### Templating
Prompt blocks support Liquid syntax. Useful when you want to add custom variables to a block without rewriting it:

```liquid
{% comment %}
vars:
  refactor_type:
    type: select
    options: [
      "One",
      "Two",
    ]
  role: type: text
{% endcomment %}
Refactor the code referenced in the main instruction prompt.
## Refactor Type: {{ refactor_type }}
```

#### Special categories

* **AI Contract (editable template):** Define role, comment style, and other behavioral expectations. The extension structures the prompt to encourage the AI to stick to the contract.
* **Tools:**
  * **Git commit:** Add a specific git commit.
  * **Git diff:** Add a diff against a branch or commit hash.
  * **IDE diagnostics:** Share detailed errors if you don't have IDE MCP set up.
  * **Active symbols:** Add file summaries for context.
* **Claude skills and commands:** Lists Claude skills and commands from your global Claude folder and prompts the AI to use them.
* **Cursor rules:** Same as above.

### Prompt block groups
Once you've added a few blocks, save them as a group. Useful for repeating the same setup across similar tasks.

## Demo

<div align="center">
  <img src="assets/demo1.gif" alt="Prompt Foundry Demo 1" width="80%" />
  <br/>
  <em>Building a prompt with reusable blocks</em>
  <br/><br/>
  <img src="assets/demo2.gif" alt="Prompt Foundry Demo 2" width="80%" />
  <br/>
  <em>Using MCP server to update blocks</em>
</div>

## License & Privacy

**License:** MIT © Simon de Vries

**Privacy:** 100% local. No telemetry, no data collection. Your prompts never leave your machine.

## Feedback

No telemetry means I rely on you. Suggestions and feature requests welcome:
https://form.typeform.com/to/hAc2CQ6A