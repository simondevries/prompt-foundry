export interface TriggerLogicState {
    isActive: boolean;
    filterString: string;
    startIndex: number | null;
}

/**
 * Isolated logic for managing trigger-based typeahead states (e.g., @ mentions, / commands).
 */
export class TriggerLogic {
    private isActive: boolean = false;
    private startIndex: number | null = null;
    private readonly MAX_EMPTY_FILTER_LENGTH = 10;

    /**
     * Updates the filter state based on current text, caret position, and the number of results from the last search.
     * @param text The full text of the input
     * @param caretPos The current cursor position
     * @param resultCount The number of results found for the current filterString
     */
    public update(text: string, caretPos: number, resultCount: number): TriggerLogicState {
        // Trigger detection
        if (!this.isActive) {
            // Check if the character at the caret position - 1 is '@'
            // and it's either at the start or preceded by a space/newline
            if (caretPos > 0 && text[caretPos - 1] === '@') {
                const prevChar = caretPos > 1 ? text[caretPos - 2] : ' ';
                if (/\s/.test(prevChar)) {
                    this.isActive = true;
                    this.startIndex = caretPos - 1;
                }
            }
        }

        if (this.isActive) {
            // Rule: Close if caret moves before the @
            if (this.startIndex === null || caretPos <= this.startIndex) {
                this.reset();
                return this.getState();
            }

            const filterString = text.substring(this.startIndex + 1, caretPos);

            // Rule: Close if filter string contains whitespace
            if (/\s/.test(filterString)) {
                this.reset();
                return this.getState();
            }

            // Rule: Close if resultCount is 0 AND the filter string is long enough
            // This gives the user some "buffer" to type a bit more even if no immediate results are found.
            if (resultCount === 0 && filterString.length > this.MAX_EMPTY_FILTER_LENGTH) {
                this.reset();
                return this.getState();
            }

            return {
                isActive: true,
                filterString,
                startIndex: this.startIndex
            };
        }

        return this.getState();
    }

    private reset() {
        this.isActive = false;
        this.startIndex = null;
    }

    private getState(): TriggerLogicState {
        return {
            isActive: this.isActive,
            filterString: '',
            startIndex: this.startIndex
        };
    }
}
