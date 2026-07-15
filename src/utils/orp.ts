function normalizeWord(word: string): string {
    return word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

export function getORPIndex(word: string): number {
    const core = normalizeWord(word);
    const length = core.length;

    if (length <= 1) return 0;
    if (length <= 4) return 1;
    if (length <= 8) return 2;
    if (length <= 12) return 3;
    return 4;
}

export function getPauseMultiplier(word: string): number {
    const normalized = word.trim();
    const trailingMatch = normalized.match(/([.!?]+|[,;:]+|[-—]+)[)\]"']*$/);

    let multiplier = 1;

    if (trailingMatch) {
        const t = trailingMatch[1];
        if (/\.\.\.|\.{2,}|\?\!|\!\?/.test(t)) {
            multiplier = 3.0;
        } else if (/[.!?]$/.test(t)) {
            multiplier = 2.4;
        } else if (/[,;:]$/.test(t)) {
            multiplier = 1.8;
        } else if (/[-—]$/.test(t)) {
            multiplier = 1.3;
        }
    }

    // Slightly longer pause for long words to allow processing
    const core = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (core.length >= 12) multiplier *= 1.15;

    // Acronyms (ALL CAPS) can be a small extra pause
    if (/^[A-Z0-9]{2,}$/.test(core)) multiplier *= 1.1;

    return multiplier;
}