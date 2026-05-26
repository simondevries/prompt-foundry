import React from 'react';
import { render } from 'ink';
import { App } from './App';

const arg = process.argv[2] || undefined;

// Render UI to stderr so stdout can be used for the final result
render(<App arg={arg} />, { stdout: process.stderr });
