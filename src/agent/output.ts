export function shapeFinalOutput(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "No response.";
    if (trimmed === "NO_REPLY" || trimmed === "no_reply") {
        return "";
    }
    return trimmed;
}