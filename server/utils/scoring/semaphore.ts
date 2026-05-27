/**
 * FIFO counting semaphore to cap concurrent in-flight requests to the
 * Elemental query server. Prevents large portfolio scans from overwhelming
 * the QS fleet (see issue #10496).
 */
export class Semaphore {
    private running = 0;
    private readonly queue: Array<() => void> = [];

    constructor(private readonly max: number) {}

    async acquire(): Promise<void> {
        if (this.running < this.max) {
            this.running++;
            return;
        }
        return new Promise<void>((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    get inflight(): number {
        return this.running;
    }

    get pending(): number {
        return this.queue.length;
    }
}

export const elementalSemaphore = new Semaphore(12);
