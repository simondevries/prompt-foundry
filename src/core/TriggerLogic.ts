export interface TriggerLogicState {
    isActive: boolean;
    filterString: string;
    startIndex: number | null;
    triggerChar: '@' | '/' | null;
}

/**
 * Isolated logic for managing trigger-based typeahead states (e.g., @ mentions, / commands).
 */
export class TriggerLogic {
    private isActive: boolean = false;
    private startIndex: number | null = null;
    private triggerChar: '@' | '/' | null = null;
    private readonly MAX_EMPTY_FILTER_LENGTH = 10;
    private readonly allowedTriggers: ('@' | '/')[];

    constructor(allowedTriggers: ('@' | '/')[] = ['@', '/']) {
        this.allowedTriggers = allowedTriggers;
    }

    /**
     * Updates the filter state based on current text, caret position, and the number of results from the last search.
     * @param text The full text of the input
     * @param caretPos The current cursor position
     * @param resultCount The number of results found for the current filterString
     */
    public update(text: string, caretPos: number, resultCount: number): TriggerLogicState {
        // Trigger detection
        if (!this.isActive) {
            // Check if the character at the caret position - 1 is in allowedTriggers
            // and it's either at the start or preceded by a space/newline
            if (caretPos > 0) {
                const char = text[caretPos - 1] as '@' | '/';
                if (this.allowedTriggers.includes(char)) {
                    const prevChar = caretPos > 1 ? text[caretPos - 2] : ' ';
                    if (/\s/.test(prevChar)) {
                        this.isActive = true;
                        this.startIndex = caretPos - 1;
                        this.triggerChar = char;
                    }
                }
            }
        }

        if (this.isActive) {
            // Rule: Close if caret moves before the trigger
            if (this.startIndex === null || caretPos <= this.startIndex) {
                this.reset();
                return this.getState();
            }

            const filterString = text.substring(this.startIndex + 1, caretPos);

            // Rule: Close if filter string contains whitespace (UNLESS it's a slash command)
            if (this.triggerChar !== '/' && /\s/.test(filterString)) {
                this.reset();
                return this.getState();
            }

            // Rule: Close if resultCount is 0 AND the filter string is long enough
            if (resultCount === 0 && filterString.length > this.MAX_EMPTY_FILTER_LENGTH) {
                this.reset();
                return this.getState();
            }

            return {
                isActive: true,
                filterString,
                startIndex: this.startIndex,
                triggerChar: this.triggerChar
            };
        }

        return this.getState();
    }

    public reset() {
        this.isActive = false;
        this.startIndex = null;
        this.triggerChar = null;
    }

    private getState(): TriggerLogicState {
        return {
            isActive: this.isActive,
            filterString: '',
            startIndex: this.startIndex,
            triggerChar: this.triggerChar
        };
    }
}
