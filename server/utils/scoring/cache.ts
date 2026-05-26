import type { Firestore } from 'firebase-admin/firestore';
import type { H3Event } from 'h3';

import { getFirestoreDb } from '../firestore';

interface CacheEntry<T = unknown> {
    value: T;
    expiresAt: number;
}

const inMemoryCache = new Map<string, CacheEntry>();

function now() {
    return Date.now();
}

function makeDocPath(key: string) {
    return `system/scoring_cache/docs/${encodeURIComponent(key)}`;
}

async function readFirestore<T>(db: Firestore, key: string): Promise<T | null> {
    const snap = await db.doc(makeDocPath(key)).get();
    if (!snap.exists) return null;
    const data = snap.data() as CacheEntry<T> | undefined;
    if (!data || typeof data.expiresAt !== 'number') return null;
    if (data.expiresAt <= now()) return null;
    return data.value;
}

async function writeFirestore<T>(db: Firestore, key: string, value: T, expiresAt: number) {
    await db.doc(makeDocPath(key)).set(
        {
            value,
            expiresAt,
            updatedAt: now(),
        },
        { merge: true }
    );
}

export async function readScoringCache<T = unknown>(event: H3Event, key: string): Promise<T | null> {
    const entry = inMemoryCache.get(key);
    if (entry && entry.expiresAt > now()) return entry.value as T;

    const db = getFirestoreDb();
    if (!db) return null;
    try {
        const value = await readFirestore<T>(db, key);
        if (value !== null) {
            inMemoryCache.set(key, { value, expiresAt: now() + 30_000 });
        }
        return value;
    } catch (error) {
        console.warn('[scoring cache] firestore read failed', error);
        return null;
    }
}

export async function writeScoringCache<T = unknown>(
    event: H3Event,
    key: string,
    value: T,
    ttlSeconds = 900
) {
    const expiresAt = now() + ttlSeconds * 1000;
    inMemoryCache.set(key, { value, expiresAt });

    const db = getFirestoreDb();
    if (!db) return;
    try {
        await writeFirestore(db, key, value, expiresAt);
    } catch (error) {
        console.warn('[scoring cache] firestore write failed', error);
    }
}

export function makeCacheKey(
    portfolioId: string,
    neid: string,
    dataType: 'solvency' | 'executive' | 'news' | 'market' | 'profile' | 'relationships' | 'events'
) {
    return `${portfolioId}:${neid}:${dataType}`;
}

