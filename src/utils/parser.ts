export function parseText(text: string): string[] {
    if (!text) {
        return [];
    }

    return text
        .replace(/\r\n/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);
}