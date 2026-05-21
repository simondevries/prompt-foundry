import test from 'node:test';
import assert from 'node:assert';
import { TriggerLogic } from './TriggerLogic.js';

test('TriggerLogic: basic activation', async (t) => {
    const trigger = new TriggerLogic();
    
    await t.test('activates when @ is typed at the start', () => {
        const state = trigger.update('@', 1, 0);
        assert.strictEqual(state.isActive, true);
        assert.strictEqual(state.filterString, '');
        assert.strictEqual(state.startIndex, 0);
    });

    await t.test('activates when @ is typed after a space', () => {
        const state = new TriggerLogic().update('hello @', 7, 0);
        assert.strictEqual(state.isActive, true);
        assert.strictEqual(state.filterString, '');
        assert.strictEqual(state.startIndex, 6);
    });

    await t.test('does NOT activate when @ is typed after a non-space character', () => {
        const state = new TriggerLogic().update('email@example.com', 6, 0);
        assert.strictEqual(state.isActive, false);
    });
});

test('TriggerLogic: filtering logic', async (t) => {
    const trigger = new TriggerLogic();
    
    await t.test('extracts filter string as user types', () => {
        trigger.update('@', 1, 0); // Activate
        const state = trigger.update('@my', 3, 10);
        assert.strictEqual(state.isActive, true);
        assert.strictEqual(state.filterString, 'my');
    });

    await t.test('closes when caret moves before @', () => {
        trigger.update('@my', 3, 10);
        const state = trigger.update('@my', 0, 10);
        assert.strictEqual(state.isActive, false);
    });

    await t.test('closes when whitespace is typed', () => {
        trigger.update('@my', 3, 10);
        const state = trigger.update('@my ', 4, 10);
        assert.strictEqual(state.isActive, false);
    });
});

test('TriggerLogic: resultCount rules', async (t) => {
    const trigger = new TriggerLogic();
    
    await t.test('stays active with 0 results if filter string is short', () => {
        trigger.update('@', 1, 0);
        const state = trigger.update('@a', 2, 0);
        assert.strictEqual(state.isActive, true);
        assert.strictEqual(state.filterString, 'a');
    });

    await t.test('closes with 0 results if filter string exceeds threshold (10)', () => {
        trigger.update('@', 1, 0);
        trigger.update('@abcdeabcde', 11, 0); // length 10, should still be active
        const state = trigger.update('@abcdeabcdea', 12, 0); // length 11, should close
        assert.strictEqual(state.isActive, false);
    });

    await t.test('stays active with results even if filter string is long', () => {
        trigger.update('@', 1, 0);
        const state = trigger.update('@verylongfilter', 15, 1);
        assert.strictEqual(state.isActive, true);
    });
});
