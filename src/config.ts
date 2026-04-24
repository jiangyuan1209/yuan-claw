import fs from "node:fs";
import path from "node:path";

export interface MyAgentConfig {
    model: {
        baseURL: string;
        apiKey: string;
        model: string;
    };
    agent: {
        workspace: string;
        maxSteps: number;
        sessionId: string;
    };
    tools?: {
        shell?: boolean;
        readFile?: boolean;
        writeFile?: boolean;
    };
}

export function loadConfig(): MyAgentConfig {
    const configPath = path.resolve(process.cwd(), "my-agent.config.json");

    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw) as MyAgentConfig;

    if (!config.model?.baseURL) {
        throw new Error("config.model.baseURL is required");
    }

    if (!config.model?.apiKey) {
        throw new Error("config.model.apiKey is required");
    }

    if (!config.model?.model) {
        throw new Error("config.model.model is required");
    }

    if (!config.agent?.sessionId) {
        throw new Error("config.agent.sessionId is required");
    }

    if (!config.agent?.maxSteps) {
        throw new Error("config.agent.maxSteps is required");
    }

    if (!config.agent?.workspace) {
        throw new Error("config.agent.workspace is required");
    }

    return config;
}