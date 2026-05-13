<div align="center">
  <img src="assets/150.png" alt="Prompt Foundry Logo" width="150" />
  <h1>Prompt Foundry</h1>
</div>

Prompt Foundry is an extension for vscode and forks (cursor/antigravity) to more rapidly build more effective prompts. It provides a prompt library, tooling, templates, and a self-learning library of living blocks that update and evolve with your project, which AI can automatically improve at the end of the conversation.

Prompt foundry ensures you get the most out of AI by writing better prompts and helps provide guiderails for how AI should operate. This extension allows you to:

* **Compile prompt blocks** to construct a clear set of instructions and context.
  *Benefit:* Provide the right instructions and context for the task at hand.
  *Benefit:* Move information that is irrelevant for the current task out of agents.md and skills and reduce context bloat.
* **Build and evolve a knowledge library** with your project. Prompt foundry comes with a local MCP server to let AI update your prompt block library at the end of the conversation.
  *Benefit:* Knowledge library that stays up to date. AI has information for the task.
* **Specify key goals** for the AI to keep it on track. Use AI contracts to steer the AI towards specific behaviours.
  *Benefit:* AI behaves the way you intend it, and helps make the AI more deterministic.
* **Git & IDE tools** to provide specific information to the IDE. The record selection feature adds the current selection to the AI prompt (enables dictation while navigating).
  *Benefit:* request a review of a specific commit.

More reasons to use this tool:
* Not locked into a specific AI tool. Your prompt library reads your system cursor rules and claude skills (Please make a request/vote for support for other AI tools).
* Prompt blocks support liquid templates to quickly customize prompts.
* Recommended prompt blocks.

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

## Setup

### Extension setup
Once you have installed the extension from the vscode marketplace, you can immediately start building prompts. If you want to add or edit the prompt templates, you will need to allow the extension to create a prompt library somewhere on the file system. 

You can modify the location of this path through the settings gear next to the prompt blocks or via the vscode settings panel.

> Note: In order to avoid a permissions error, when editing the extension from the editor you have to open that prompt library folder in vscode and click 'trust'. You can manually check the folder's contents easily as it just contains .md files and the prompts settings files.

### MCP setup
To setup the MCP server click on the settings gear in the app and click setup MCP server. This will provide you a JSON config you can paste into your AI's MCP settings. Note that the PROMPT_ROOT env setting should refer to the location of your prompt library folder.

Example using antigravity:
```json
{
  "mcpServers": {
    "prompt-foundry": {
      "command": "node",
      "args": [
        "/Users/[USERNAME]/.antigravity/extensions/[USERNAME]/dist/mcp.bundle.js"
      ],
      "env": {
        "PROMPT_ROOT": "/Users/[USERNAME]/prompt-builder/five/Prompt Library"
      }
    }
  }
}
```

> Note: The MCP server runs locally as a nodeJS process which is located in the vscode extension folder. Please be aware that the AI is able to read and modify the content of the specified prompt library folder via MCP tool calls.

## Features step by step

### Instructions prompt
Enter your main instructional prompt into the top instruction box. 

Pressing the live focus (⚡) button will allow you to select files and lines in the IDE and have the associated locations be added to the prompt. This is especially useful as you can dictate to the computer while navigating around the codebase and you should end up with contextual file tags as you navigate - it creates a similar experience to someone watching your screen as you explain. 

### Adding prompt blocks
Prompt blocks are broken down into categories; one for each folder and also a set of special categories (bottom). 

**Goals (References):** Generally it is hard to get the AI to follow instructions when it has been given lots of information. This is why prompt foundry adds the ability to mark blocks as a Goal (using references). When you press the star next to an added block, it adds the block's associated reference to a specific location in the final prompt. By reiterating a specific goal at key points in the workflow, it makes the AI much more likely to stay on track and follow it.

Goals are added to prompt templates by defining a `reference` and a `referenceLocation` in the comment frontmatter. The `referenceLocation` determines where the goal is injected in the prompt (e.g., `workflowFirstTurn`, `workflowEveryChange`, `workflowBeforeEditing`, `workflowEndOfTask`, `pre`, or `remark`).

```markdown
<!--
# reference: Ensure the code has been refactored by the end of the task
# referencelocation: workflowEndOfTask
-->
```

**Liquid syntax:** Prompt templates support liquid templating syntax. This is especially useful if you have a prompt for a specific purpose where you want to add some custom instructions. For example:

```liquid
{% comment %}
vars:
  refactor_type:
    type: select
    options: [
      "One",
      "Two",
    ]
TODO
   role:  type: text
{% endcomment %}
Refactor the code referenced in the main instruction prompt.
## Refactor Type: {{ refactor_type }}
```

**Special categories:**
* **Ai-Contract (editable template):** A special prompt block to try encourage the AI to behave a certain way. For instance defining the role, whether to create comments etc... The extension will generate a prompt in a way that encourages the AI to stick to the contract.
* **Tools:**
  * **Git commit:** Add a specific git commit.
  * **Git diff:** Add a diff against a branch or commit hash. 
  * **Ide diagnostics:** Share a detailed errors if you don't have IDE MCP setup.
  * **Active symbols:** Add file summaries for context.
* **Claude skills and commands:** Lists claude skills and commands from your global claude folder. This adds a prompt asking the AI to use those prompts.
* **Cursor rules:** Same as above.

### Prompt block groups
Create a block group once you've added a few blocks to the prompt. Those added blocks (but not the main instruction) get added under one group.
This is especially useful when adding the same blocks for certain tasks.

## Feedback
I rely on your feedback! Please provide your suggestions, feedback, feature requests here:
https://form.typeform.com/to/hAc2CQ6A

## License & Privacy

**License:** MIT © Simon de Vries

**Privacy:** This extension is **100% local**. It does not collect, store, or transmit any user data, telemetry, or prompt content. Your prompts and ingredients never leave your machine.
