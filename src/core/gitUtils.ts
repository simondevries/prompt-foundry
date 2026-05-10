/**
 * Validates if a string is a well-formatted Git commit hash.
 * This is used for security to prevent command injection.
 * 
 * Rules:
 * - Must be strictly hexadecimal (0-9, a-f, A-F)
 * - Length must be between 4 and 64 characters
 * - No spaces or special characters
 */
export function isValidCommitHash(hash: string): boolean {
    if (!hash) return false;
    
    const trimmed = hash.trim();
    // Strict Hexadecimal regex
    // 4-40 chars for SHA-1 (including short)
    // Up to 64 for SHA-256
    const hexRegex = /^[0-9a-fA-F]{4,64}$/;
    
    return hexRegex.test(trimmed);
}

/**
 * Validates if a string is a safe Git reference (branch, tag, or HEAD).
 * Used to prevent command injection while allowing common branch formats.
 */
export function isValidGitRef(ref: string): boolean {
    if (!ref) return false;
    const trimmed = ref.trim();
    
    // Allows alphanumerics, dots, hyphens, underscores, and forward slashes.
    // Disallows leading/trailing slashes, double dots, spaces, etc.
    const refRegex = /^[a-zA-Z0-9][a-zA-Z0-9.\-_/]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
    
    // Check for some common invalid patterns even if regex passes
    if (trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('@{')) {
        return false;
    }
    
    return refRegex.test(trimmed);
}
