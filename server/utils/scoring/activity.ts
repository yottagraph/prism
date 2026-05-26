export interface AgentActivityEntry {
    id: string;
    timestamp: number;
    portfolioId: string;
    step: 'dialogue' | 'history' | 'query' | 'composition';
    entity: string;
    detail: string;
}

type Listener = (entry: AgentActivityEntry) => void;

const listeners = new Set<Listener>();
const history: AgentActivityEntry[] = [];

function randomId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pushActivity(
    entry: Omit<AgentActivityEntry, 'id' | 'timestamp'>
): AgentActivityEntry {
    const full: AgentActivityEntry = {
        id: randomId(),
        timestamp: Date.now(),
        ...entry,
    };
    history.unshift(full);
    if (history.length > 200) history.length = 200;
    for (const listener of listeners) listener(full);
    return full;
}

export function subscribeActivity(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getActivityHistory(portfolioId?: string): AgentActivityEntry[] {
    if (!portfolioId) return [...history];
    return history.filter((entry) => entry.portfolioId === portfolioId);
}
