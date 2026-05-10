import test from 'node:test';
import assert from 'node:assert';
import { isValidCommitHash } from './gitUtils.js';

test('Git Utils: isValidCommitHash', async (t) => {
    
    await t.test('accepts valid 7-char short hash', () => {
        assert.strictEqual(isValidCommitHash('abc1234'), true);
    });

    await t.test('accepts valid 40-char SHA-1 hash', () => {
        assert.strictEqual(isValidCommitHash('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'), true);
    });

    await t.test('accepts valid 64-char SHA-256 hash', () => {
        const sha256 = 'a'.repeat(64);
        assert.strictEqual(isValidCommitHash(sha256), true);
    });

    await t.test('accepts mixed case hex', () => {
        assert.strictEqual(isValidCommitHash('AbC123D'), true);
    });

    await t.test('accepts minimum 4-char hash', () => {
        assert.strictEqual(isValidCommitHash('1234'), true);
    });

    await t.test('rejects hashes shorter than 4', () => {
        assert.strictEqual(isValidCommitHash('abc'), false);
    });

    await t.test('rejects hashes longer than 64', () => {
        assert.strictEqual(isValidCommitHash('a'.repeat(65)), false);
    });

    await t.test('rejects non-hex characters', () => {
        assert.strictEqual(isValidCommitHash('abc123g'), false);
    });

    await t.test('handles whitespace by trimming', () => {
        assert.strictEqual(isValidCommitHash(' abc1234'), true);
        assert.strictEqual(isValidCommitHash('abc1234 '), true);
        assert.strictEqual(isValidCommitHash('  abc1234  '), true);
        // Internal whitespace should still be rejected
        assert.strictEqual(isValidCommitHash('abc 1234'), false);
    });

    await t.test('rejects shell injection characters', () => {
        assert.strictEqual(isValidCommitHash('abc1234;ls'), false);
        assert.strictEqual(isValidCommitHash('abc1234&&whoami'), false);
        assert.strictEqual(isValidCommitHash('abc1234|rm'), false);
        assert.strictEqual(isValidCommitHash('`id`'), false);
        assert.strictEqual(isValidCommitHash('$(whoami)'), false);
    });

    await t.test('rejects git relative refs (we only want hashes)', () => {
        assert.strictEqual(isValidCommitHash('HEAD'), false);
        assert.strictEqual(isValidCommitHash('main'), false);
        assert.strictEqual(isValidCommitHash('HEAD~1'), false);
        assert.strictEqual(isValidCommitHash('master^'), false);
    });

    await t.test('rejects empty string', () => {
        assert.strictEqual(isValidCommitHash(''), false);
    });
});
