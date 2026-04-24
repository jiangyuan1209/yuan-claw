export class SessionQueue {
    private lanes = new Map<string, Promise<void>>();

    async enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
        const previous = this.lanes.get(sessionId) ?? Promise.resolve();

        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });

        this.lanes.set(
            sessionId,
            previous.then(() => current)
        );

        await previous;

        try {
            return await task();
        } finally {
            release();
            const active = this.lanes.get(sessionId);
            if (active === current) {
                this.lanes.delete(sessionId);
            }
        }
    }
}

export const sessionQueue = new SessionQueue();