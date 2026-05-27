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

const arg = process.argv[2];

render(<App arg={arg} />);
