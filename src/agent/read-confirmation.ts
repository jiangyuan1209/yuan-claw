import readline from "node:readline";

export async function readConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const answer = await new Promise<string>((resolve) => {
            rl.question(`${message} [y/N] `, resolve);
        });

        const normalized = answer.trim().toLowerCase();
        return normalized === "y" || normalized === "yes";
    } finally {
        rl.close();
    }
}