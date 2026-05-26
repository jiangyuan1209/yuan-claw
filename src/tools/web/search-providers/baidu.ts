import type { WebSearchResult } from "../web-search.js";

type BaiduSearchApiReference = {
    title?: string;
    url?: string;
    content?: string;
};

type BaiduSearchApiResponse = {
    references?: BaiduSearchApiReference[];
    code?: string;
    message?: string;
};

export type CreateBaiduSearchProviderOptions = {
    apiKey: string;
    baseUrl?: string;
};

export function createBaiduSearchProvider(
    options: CreateBaiduSearchProviderOptions
) {
    const baseUrl =
        options.baseUrl ?? "https://qianfan.baidubce.com/v2/ai_search/web_search";

    return async function baiduSearch(
        query: string,
        count: number
    ): Promise<WebSearchResult[]> {
        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${options.apiKey}`,
                "X-Appbuilder-From": "yuan-claw",
                "User-Agent": "Mozilla/5.0 (compatible; XSimpleWebSearch/1.0)",
            },
            body: JSON.stringify({
                messages: [{ content: query, role: "user" }],
                search_source: "baidu_search_v2",
                resource_type_filter: [{ type: "web", top_k: count }],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `Baidu search failed: ${response.status} ${response.statusText}${
                    errorText ? ` - ${errorText}` : ""
                }`
            );
        }

        const data = (await response.json()) as BaiduSearchApiResponse;

        if (data.code) {
            throw new Error(
                `Baidu search error: ${data.message ?? data.code}`
            );
        }

        return (data.references ?? [])
            .slice(0, count)
            .map((item) => ({
                title: item.title ?? "",
                url: item.url ?? "",
                snippet: item.content ?? "",
                source: "baidu",
            }))
            .filter((item) => item.url.trim().length > 0);
    };
}
