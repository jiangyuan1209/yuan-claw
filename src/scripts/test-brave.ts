import { ProxyAgent, setGlobalDispatcher } from "undici";
import {initGlobalProxy} from "../lib/initGlobalProxy.js";
import {createBraveSearchProvider} from "../tools/web/index.js";

initGlobalProxy();

async function main() {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
        throw new Error("Missing BRAVE_API_KEY");
    }

    const search = createBraveSearchProvider({ apiKey });
    const results = await search("OpenAI", 5);
    console.log(results);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});