import type { WebSearchResult } from "../web-search.js";

type BraveSearchApiResultItem = {
    title?: string;
    url?: string;
    description?: string;
};

type BraveSearchApiResponse = {
    web?: {
        results?: BraveSearchApiResultItem[];
    };
};

export type CreateBraveSearchProviderOptions = {
    apiKey: string;
    baseUrl?: string;
    headers?: Record<string, string>;
};

export function createBraveSearchProvider(
    options: CreateBraveSearchProviderOptions
) {
    const baseUrl =
        options.baseUrl ?? "https://api.search.brave.com/res/v1/web/search";

    return async function braveSearch(
        query: string,
        count: number
    ): Promise<WebSearchResult[]> {
        const url = new URL(baseUrl);
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(count));

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Accept: "application/json",
                "X-Subscription-Token": options.apiKey,
                "User-Agent": "Mozilla/5.0 (compatible; XSimpleWebSearch/1.0)",
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `Brave search failed: ${response.status} ${response.statusText}${
                    errorText ? ` - ${errorText}` : ""
                }`
            );
        }

        const data = (await response.json()) as BraveSearchApiResponse;

        return (data.web?.results ?? [])
            .slice(0, count)
            .map((item) => ({
                title: item.title ?? "",
                url: item.url ?? "",
                snippet: item.description ?? "",
                source: "brave",
            }))
            .filter((item) => item.url.trim().length > 0);
    };
}