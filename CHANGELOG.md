# Change Log

All notable changes to the "prompt-forge" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0] - 2026-05-13

### Added
- **Living Blocks System**: Introduced a self-improving prompt library where AI can propose and commit updates via MCP.
- **MCP Server**: Integrated local Model Context Protocol server to bridge extension state with AI agents.
- **React 19 Webview**: Completely rebuilt the UI using React 19 for better state management and security.
- **Decoupled Architecture**: Refactored core logic into specialized managers (`LibraryManager`, `SessionManager`, `PromptCompiler`).
- **Liquid Template Support**: Added support for dynamic variable injection using Liquid-style syntax.
- **AI Contracts**: New specialized block type to enforce deterministic AI behavior.
- **Session History**: Persistent session restoration with full variable state recovery.
- **Marketplace Readiness**: Cleaned up package manifest and added support for custom prompt library paths.

### Fixed
- Improved metadata parsing for multi-line YAML-lite arrays.
- Resolved race conditions in file system watching during session saves.
- Fixed theme synchronization between VS Code and the React webview.

## [0.0.1] - 2026-05-10
- Initial experimental build.