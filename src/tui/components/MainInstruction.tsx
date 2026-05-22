import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

const MainInstruction = ({ onChange }) => {
    const [instruction, setInstruction] = useState('');

    // [DEBUG] MainInstruction component rendered
    return (
        <Box flexDirection="column">
            <Text>Enter main instruction:</Text>
            <TextInput
                value={instruction}
                onChange={(value) => {
                    // [DEBUG] Instruction changed to: ${value}
                    setInstruction(value);
                    onChange(value);
                }}
            />
        </Box>
    );
};

export default MainInstruction;
