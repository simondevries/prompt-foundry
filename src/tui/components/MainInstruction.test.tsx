import { render } from 'ink-testing-library';
import React from 'react';
import MainInstruction from './MainInstruction';

describe('MainInstruction', () => {
  it('should render a text input for the main instruction', () => {
    const { lastFrame } = render(<MainInstruction />);
    expect(lastFrame()).toContain('Enter main instruction:');
  });
});
