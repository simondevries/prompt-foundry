<!-- 
# version: 1.0
# ReferenceLocation: none
-->
# Context: Prompt Foundry

This context file explains **Prompt Foundry**, the VSCode extension system we are currently using to communicate.

## How It Works
Prompt Foundry allows me (the human) to rapidly assemble complex, contextual AI instructions by stacking a "Main Prompt" with a library of reusable building blocks (like this one). When I send a prompt, the extension compiles all active blocks, resolves any Liquid syntax variables, and passes the final markdown structure to you.

## Library States
Prompt Foundry operates in two states:
1. **Read-Only (Default)**: Uses bundled templates. You can read, but not save/modify.
2. **Editable (Initialized)**: Once a local "Prompt Library" folder is initialized (via the "Select Library Folder" feature), you gain full read/write access.

## The MCP Server
Prompt Foundry runs a local Model Context Protocol (MCP) server in the background. This server acts as a bridge, exposing the internal state and capabilities of the Prompt Foundry extension directly to you, the AI agent.

## Self-Improvement Loop (Updating Prompts)
A core feature of this architecture is that **you have the ability to improve these very prompt templates.**
If you notice a prompt block is confusing, inefficient, or missing constraints during our conversation, you MUST propose an edit to it.

**The Update Sequence:**
1. **Check State**: If the library is in Read-Only mode, you cannot modify blocks until the user initializes the library.
2. **Target the Block**: If the user provided the category and name, use it. Otherwise, use your list tools to find the correct block.
3. **Propose Change**: Use the proposal tool to submit your edits. This tool will return a diff. You must show this diff to the user in the chat and ask for their confirmation.
4. **Commit Change**: Only after the user explicitly types "yes" or approves the diff, execute the commit/confirm tool.
