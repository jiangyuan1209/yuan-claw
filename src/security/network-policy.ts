export function validateUrlByPolicy(rawUrl: string) {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL: ${rawUrl}`);
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    }

    const hostname = url.hostname.toLowerCase();

    if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1"
    ) {
        throw new Error(`Blocked local address: ${hostname}`);
    }

    return url;
}