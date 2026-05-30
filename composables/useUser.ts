/**
 * Demo user management for the goals-based investing pivot.
 *
 * A "user" represents a personal investor persona. Each user owns a set of
 * goal buckets (portfolios). There is no real auth — switching users swaps
 * all state. The active user is persisted alongside their profile via
 * useAppFeaturePrefs('household', ...).
 */

import { computed } from 'vue';
import householdFixture from '~/assets/household-fixture.json';

export type RiskTolerance = 1 | 2 | 3 | 4 | 5;

export interface DemoUser {
    id: string;
    name: string;
    /** Current age. */
    age: number;
    /** Target retirement age. */
    retirementAge: number;
    /**
     * Risk tolerance 1-5:
     *   1 = very conservative, 3 = moderate, 5 = aggressive
     */
    riskTolerance: RiskTolerance;
    /** True after completing onboarding questions. */
    onboarded: boolean;
    createdAt: number;
    /** Gemini-generated 2-sentence persona blurb, cached here to avoid re-generating. */
    personaDescription?: string;
    /**
     * Stable hash of the inputs used to generate personaDescription
     * (name|age|retirementAge|riskTolerance|bucketNames). If the hash
     * changes, the blurb is regenerated.
     */
    personaHash?: string;
}

interface HouseholdPrefsShape {
    users: DemoUser[];
    activeUserId: string | null;
}

const DEFAULT_USER: DemoUser = {
    id: 'default',
    name: 'Demo User',
    age: 35,
    retirementAge: 65,
    riskTolerance: 3,
    onboarded: false,
    createdAt: 0,
};

function defaultUsers(): DemoUser[] {
    const fixtureUsers = (householdFixture as any)?.users as DemoUser[] | undefined;
    if (Array.isArray(fixtureUsers) && fixtureUsers.length > 0) {
        return fixtureUsers;
    }
    return [DEFAULT_USER];
}

function defaultActiveUserId(): string {
    return (householdFixture as any)?.defaultActiveUserId ?? defaultUsers()[0]?.id ?? 'default';
}

const householdPrefs = ref<ReturnType<typeof useAppFeaturePrefs<HouseholdPrefsShape>> | null>(null);

function ensureHouseholdPrefs() {
    if (!householdPrefs.value) {
        const users = defaultUsers();
        householdPrefs.value = useAppFeaturePrefs<HouseholdPrefsShape>('household', {
            users,
            activeUserId: defaultActiveUserId(),
        });
        if (!householdPrefs.value.users || householdPrefs.value.users.length === 0) {
            householdPrefs.value.users = users;
            householdPrefs.value.activeUserId = defaultActiveUserId();
        }
    }
    return householdPrefs.value!;
}

export function useUser() {
    const h = ensureHouseholdPrefs();

    const users = computed(() => h.users);
    const activeUserId = computed(() => h.activeUserId);
    const activeUser = computed(
        () => h.users.find((u) => u.id === h.activeUserId) ?? h.users[0] ?? null
    );

    function setActiveUser(id: string) {
        h.activeUserId = id;
    }

    function createUser(user: Omit<DemoUser, 'id' | 'createdAt'>): DemoUser {
        const newUser: DemoUser = {
            ...user,
            id: `user-${Date.now().toString(36)}`,
            createdAt: Date.now(),
        };
        h.users = [...h.users, newUser];
        return newUser;
    }

    function updateUser(id: string, patch: Partial<Omit<DemoUser, 'id' | 'createdAt'>>) {
        const idx = h.users.findIndex((u) => u.id === id);
        if (idx < 0) return;
        h.users[idx] = { ...h.users[idx], ...patch };
        h.users = [...h.users];
    }

    function markOnboarded(id: string) {
        updateUser(id, { onboarded: true });
    }

    function resetUsers(users: DemoUser[]) {
        h.users = users;
        h.activeUserId = users[0]?.id ?? null;
    }

    /** Years until target retirement age. */
    function yearsToRetirement(user: DemoUser): number {
        return Math.max(0, user.retirementAge - user.age);
    }

    return {
        users,
        activeUserId,
        activeUser,
        setActiveUser,
        createUser,
        updateUser,
        markOnboarded,
        resetUsers,
        yearsToRetirement,
    };
}
