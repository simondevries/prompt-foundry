import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Deploys the MCP and TUI binaries to the global storage directory.
 * This ensures that external tools (like Claude Desktop) can point to a stable path
 * that doesn't change when the extension updates.
 */
export async function deployBinaries(context: vscode.ExtensionContext): Promise<vscode.Uri> {
    const storageUri = context.globalStorageUri;
    const extensionVersion = context.extension.packageJSON.version;
    const versionFileUri = vscode.Uri.joinPath(storageUri, 'deployed_version.txt');

    let deployedVersion = '';
    try {
        const versionData = await vscode.workspace.fs.readFile(versionFileUri);
        deployedVersion = new TextDecoder().decode(versionData).trim();
    } catch {
        // Not deployed yet or file missing
    }

    if (deployedVersion !== extensionVersion) {
        console.log(`[Prompt Foundry] Deploying binaries version ${extensionVersion} (current: ${deployedVersion})`);
        
        // Ensure global storage exists
        await vscode.workspace.fs.createDirectory(storageUri);
        
        const mcpDir = vscode.Uri.joinPath(storageUri, 'mcp');
        const tuiDir = vscode.Uri.joinPath(storageUri, 'tui');
        const tuiTmpDir = vscode.Uri.joinPath(tuiDir, 'tmp');
        
        // Create subdirectories
        await vscode.workspace.fs.createDirectory(mcpDir);
        await vscode.workspace.fs.createDirectory(tuiDir);
        await vscode.workspace.fs.createDirectory(tuiTmpDir);

        // 1. Copy MCP Bundle
        const mcpSrc = vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp.bundle.js');
        const mcpDest = vscode.Uri.joinPath(mcpDir, 'mcp.bundle.js');
        if (fs.existsSync(mcpSrc.fsPath)) {
            await vscode.workspace.fs.copy(mcpSrc, mcpDest, { overwrite: true });
        }

        // 2. Copy TUI Bundle
        const tuiMjsSrc = vscode.Uri.joinPath(context.extensionUri, 'dist', 'tui.bundle.mjs');
        const tuiMjsDest = vscode.Uri.joinPath(tuiDir, 'tui.bundle.mjs');
        const tuiOldJsDest = vscode.Uri.joinPath(tuiDir, 'tui.bundle.js');
        
        if (fs.existsSync(tuiMjsSrc.fsPath)) {
            // Delete old broken .js file if it exists to prevent stale execution
            try {
                if (fs.existsSync(tuiOldJsDest.fsPath)) {
                    await vscode.workspace.fs.delete(tuiOldJsDest);
                }
            } catch (e) {
                console.warn('[Prompt Foundry] Could not delete old TUI bundle', e);
            }
            
            await vscode.workspace.fs.copy(tuiMjsSrc, tuiMjsDest, { overwrite: true });
        } else {
            // Fallback for dev/older builds
            const tuiSrc = vscode.Uri.joinPath(context.extensionUri, 'dist', 'tui.bundle.js');
            if (fs.existsSync(tuiSrc.fsPath)) {
                await vscode.workspace.fs.copy(tuiSrc, tuiOldJsDest, { overwrite: true });
            }
        }

        // 3. Copy TUI Shell Script
        const shSrc = vscode.Uri.joinPath(context.extensionUri, 'prompt-forge-tui.sh');
        const shDest = vscode.Uri.joinPath(tuiDir, 'prompt-forge-tui.sh');
        if (fs.existsSync(shSrc.fsPath)) {
            await vscode.workspace.fs.copy(shSrc, shDest, { overwrite: true });
            
            // Note: We might want to make the script executable on Unix-like systems
            // vscode.workspace.fs doesn't have a chmod, so we might need fs.chmodSync
            try {
                fs.chmodSync(shDest.fsPath, 0o755);
            } catch (e) {
                console.warn(`[Prompt Foundry] Failed to set executable permission on ${shDest.fsPath}`, e);
            }
        }

        // Write version file to skip deployment next time
        await vscode.workspace.fs.writeFile(versionFileUri, new TextEncoder().encode(extensionVersion));
        console.log(`[Prompt Foundry] Binaries deployed to ${storageUri.fsPath}`);
    }

    return storageUri;
}
