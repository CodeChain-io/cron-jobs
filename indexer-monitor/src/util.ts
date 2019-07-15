export function getConfig(field: string): string {
    const c = process.env[field];
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return process.env[field] != null;
}
