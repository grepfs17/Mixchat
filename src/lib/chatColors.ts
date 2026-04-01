/**
 * Generates a consistent HSL color from a username string.
 * The same name always produces the same hue.
 */
export function getColorFromName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 55%)`;
}
