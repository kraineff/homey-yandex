export function parseJson<T = any>(jsonStr: string) {
	if (!jsonStr) return {} as T;

	try {
		const json = JSON.parse(jsonStr);
		const isNotArray = typeof json === "object" && !Array.isArray(json);
		if (isNotArray) return json as T;
	} catch (error) {
		if (error instanceof Error) console.error("Ошибка парсинга JSON:", error.message);
	}

	return {} as T;
}
