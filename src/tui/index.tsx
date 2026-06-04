import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Silence noisy logs in TUI mode
console.log = () => {};
console.warn = () => {};
console.error = (msg) => {
  // Allow critical errors to pass through to stderr but avoid React noise if possible
  if (typeof msg === 'string' && (msg.includes('Encountered two children') || msg.includes('React has detected a change'))) {
    return;
  }
  process.stderr.write(msg + '\n');
};

let arg: string | undefined = undefined;
let outputArg: string | undefined = undefined;
let libraryPath: string | undefined = undefined;

for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--library' || a === '-l') {
    libraryPath = process.argv[++i];
  } else if (!arg) {
    arg = a;
  } else if (!outputArg) {
    outputArg = a;
  }
}

// Load config from tui_config.json if it exists
let config: any = {};
try {
  const configPath = path.join(__dirname, 'tui_config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // Fallback to empty config
}

// CLI flag takes precedence over config file
if (libraryPath) {
  config.promptFolder = libraryPath;
}

render(<App arg={arg} outputArg={outputArg} config={config} />);
