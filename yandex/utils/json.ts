
export function strictJsonParse(str: string) {
    try {
        const json = JSON.parse(str);
        if (json && typeof json === 'object')
            return json;
    } catch (e) {}
    return {};
}