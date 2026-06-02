import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

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

render(<App arg={arg} outputArg={outputArg} libraryPath={libraryPath} />);
