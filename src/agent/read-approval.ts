import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export type ApprovalDecision = "deny" | "allow-once" | "allow-always";

function printApprovalMenu(message: string) {
    console.log(message);
    console.log("");
    console.log("请选择：");
    console.log("  1) 不允许");
    console.log("  2) 允许");
    console.log("  3) 总是允许");
    console.log("");
}

function normalizeAnswer(answer: string): ApprovalDecision | null {
    const value = answer.trim().toLowerCase();

    if (value === "1" || value === "n" || value === "no") {
        return "deny";
    }

    if (value === "2" || value === "y" || value === "yes") {
        return "allow-once";
    }

    if (
        value === "3" ||
        value === "a" ||
        value === "always" ||
        value === "always-allow"
    ) {
        return "allow-always";
    }

    return null;
}

export async function readApproval(message: string): Promise<ApprovalDecision> {
    const rl = readline.createInterface({ input, output });

    try {
        while (true) {
            printApprovalMenu(message);
            const answer = await rl.question("输入 1/2/3: ");
            const decision = normalizeAnswer(answer);

            if (decision) {
                console.log("");
                return decision;
            }

            console.log("无效输入，请输入 1、2 或 3。\n");
        }
    } finally {
        rl.close();
    }
}