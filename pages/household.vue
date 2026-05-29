<template>
    <div class="d-flex flex-column fill-height">
        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center" style="gap: 8px">
                <v-icon size="large" color="primary" class="mr-2">mdi-home-account</v-icon>
                <div>
                    <h1 class="text-h6 font-weight-medium">
                        {{ activeUser?.name ?? 'Your' }} Overview
                    </h1>
                    <p class="text-caption text-medium-emphasis mb-0">
                        All goal buckets · horizon fit · cross-bucket concentration
                    </p>
                </div>
                <v-spacer />
                <v-select
                    v-model="activeUserIdModel"
                    :items="userOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="max-width: 200px"
                    prepend-inner-icon="mdi-account-circle-outline"
                />
                <v-btn
                    size="small"
                    variant="text"
                    icon="mdi-pencil-outline"
                    aria-label="Edit profile"
                    @click="onboardingOpen = true"
                />
            </div>

            <!-- Profile chips -->
            <div v-if="activeUser" class="d-flex align-center mt-3" style="gap: 12px">
                <v-chip size="small" variant="tonal" color="default">
                    Age {{ activeUser.age }}
                </v-chip>
                <v-chip size="small" variant="tonal" color="default">
                    Retire at {{ activeUser.retirementAge }} ({{
                        Math.max(0, activeUser.retirementAge - activeUser.age)
                    }}y away)
                </v-chip>
                <v-chip
                    size="small"
                    variant="tonal"
                    :color="toleranceColor(activeUser.riskTolerance)"
                >
                    Risk tolerance {{ activeUser.riskTolerance }}/5
                </v-chip>
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4 pt-2">
            <v-alert v-if="buckets.length === 0" type="info" variant="tonal" class="mb-4">
                No goal buckets yet. Head to
                <nuxt-link to="/">Goal Bucket</nuxt-link> to create one.
            </v-alert>

            <!-- ── Two-question hero band ──────────────────────────── -->
            <v-row v-if="buckets.length > 0" dense class="mb-4">
                <!-- Question A: Are the goals built right? -->
                <v-col cols="12" md="6">
                    <v-card
                        variant="tonal"
                        :color="summaryFitColor"
                        class="hero-panel pa-4 fill-height"
                    >
                        <div class="d-flex align-center mb-2">
                            <v-icon size="small" class="mr-2">mdi-bullseye-arrow</v-icon>
                            <span class="text-subtitle-2 font-weight-medium">
                                Are the goals built right?
                            </span>
                        </div>
                        <div class="d-flex align-center" style="gap: 16px">
                            <div class="text-center">
                                <div class="text-h4 font-weight-bold">
                                    {{ appropriateBuckets }}
                                </div>
                                <div class="text-caption">On track</div>
                            </div>
                            <div v-if="aggressiveBuckets > 0" class="text-center">
                                <div class="text-h4 font-weight-bold text-error">
                                    {{ aggressiveBuckets }}
                                </div>
                                <div class="text-caption">Too aggressive</div>
                            </div>
                            <div v-if="conservativeBuckets > 0" class="text-center">
                                <div class="text-h4 font-weight-bold text-warning">
                                    {{ conservativeBuckets }}
                                </div>
                                <div class="text-caption">Too conservative</div>
                            </div>
                            <v-spacer />
                            <div class="text-right">
                                <div class="text-caption text-medium-emphasis">
                                    {{ buckets.length }} bucket{{ buckets.length !== 1 ? 's' : '' }}
                                </div>
                                <div class="text-caption text-medium-emphasis">
                                    {{ totalHoldings }} holdings
                                </div>
                            </div>
                        </div>
                        <p class="text-caption text-medium-emphasis mt-3 mb-0">
                            Horizon fit checks whether each bucket's actual risk profile matches its
                            investment timeline and your stated tolerance.
                        </p>
                    </v-card>
                </v-col>

                <!-- Question B: Are the holdings healthy? -->
                <v-col cols="12" md="6">
                    <v-card
                        variant="tonal"
                        :color="healthPanelColor"
                        class="hero-panel pa-4 fill-height"
                    >
                        <div class="d-flex align-center mb-2">
                            <v-icon size="small" class="mr-2">mdi-shield-search</v-icon>
                            <span class="text-subtitle-2 font-weight-medium">
                                Are the holdings healthy?
                            </span>
                        </div>

                        <!-- Not scanned yet -->
                        <div
                            v-if="hhHealth.scanned === 0"
                            class="d-flex align-center"
                            style="gap: 8px"
                        >
                            <v-icon size="20" color="medium-emphasis">mdi-radar</v-icon>
                            <span class="text-body-2 text-medium-emphasis">
                                Open a bucket and run a scan to assess holdings.
                            </span>
                        </div>

                        <!-- Scanned -->
                        <template v-else>
                            <div class="d-flex align-center" style="gap: 16px">
                                <div class="text-center">
                                    <div class="text-h4 font-weight-bold">
                                        {{ hhHealth.scanned }}
                                    </div>
                                    <div class="text-caption">Scored</div>
                                </div>
                                <div v-if="hhHealth.needsAttention > 0" class="text-center">
                                    <div class="text-h4 font-weight-bold text-warning">
                                        {{ hhHealth.needsAttention }}
                                    </div>
                                    <div class="text-caption">Need attention</div>
                                </div>
                                <div v-else class="text-center">
                                    <v-icon size="32" color="success"
                                        >mdi-check-circle-outline</v-icon
                                    >
                                    <div class="text-caption">All clear</div>
                                </div>
                                <v-spacer />
                                <div class="text-right">
                                    <v-chip
                                        v-if="hhHealth.worstTier"
                                        :color="tierColor(hhHealth.worstTier)"
                                        size="small"
                                        label
                                        variant="flat"
                                    >
                                        {{ tierLabel(hhHealth.worstTier) }} risk
                                    </v-chip>
                                    <div class="text-caption text-medium-emphasis mt-1">
                                        Worst across portfolio
                                    </div>
                                </div>
                            </div>
                            <!-- Tier bar -->
                            <div class="d-flex align-center mt-3" style="gap: 6px; flex-wrap: wrap">
                                <template v-for="tier in ALL_TIERS" :key="tier">
                                    <span v-if="hhHealth.tierCounts[tier] > 0" class="text-caption">
                                        {{ hhHealth.tierCounts[tier] }} {{ tier }}
                                    </span>
                                </template>
                            </div>
                        </template>

                        <p class="text-caption text-medium-emphasis mt-3 mb-0">
                            Powered by multi-source fusion: SEC filings · news pressure · market
                            signals · sanctions screening.
                        </p>
                    </v-card>
                </v-col>
            </v-row>

            <!-- ── Construction spectrum ───────────────────────────── -->
            <GoalsConstructionSpectrum
                v-if="buckets.length > 0"
                :buckets="spectrumBuckets"
                class="mb-4"
                @open="onOpenBucket"
            />

            <!-- ── Bucket cards ────────────────────────────────────── -->
            <v-row dense class="mb-4">
                <v-col
                    v-for="card in bucketCardsWithOverlap"
                    :key="card.id"
                    cols="12"
                    md="6"
                    xl="4"
                >
                    <GoalsBucketCard
                        :card="card"
                        :health="bucketHealthMap[card.id] ?? emptyHealth"
                        @open="onOpenBucket"
                    />
                </v-col>
            </v-row>

            <!-- ── Cross-bucket concentration ─────────────────────── -->
            <template v-if="duplicateHoldings.length > 0">
                <h2 class="text-subtitle-1 font-weight-medium mb-2">
                    <v-icon size="small" class="mr-1">mdi-content-copy</v-icon>
                    Cross-bucket concentration
                </h2>
                <p class="text-body-2 text-medium-emphasis mb-3">
                    These holdings appear in multiple buckets — consider whether the overlap is
                    intentional.
                </p>
                <v-table density="compact" class="mb-4">
                    <thead>
                        <tr>
                            <th>Holding</th>
                            <th>Buckets</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="dup in duplicateHoldings" :key="dup.name">
                            <td class="text-body-2">{{ dup.name }}</td>
                            <td>
                                <v-chip
                                    v-for="b in dup.buckets"
                                    :key="b"
                                    size="x-small"
                                    variant="tonal"
                                    class="mr-1"
                                >
                                    {{ b }}
                                </v-chip>
                            </td>
                        </tr>
                    </tbody>
                </v-table>
            </template>
        </div>

        <OnboardingOnboardingDialog
            v-model="onboardingOpen"
            :user="activeUser"
            @submit="onOnboardingSubmit"
        />
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';
    import { useRouter } from 'vue-router';
    import { useUser } from '~/composables/useUser';
    import { usePortfolio } from '~/composables/usePortfolio';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';
    import type { RiskBand, HorizonFit } from '~/utils/goals/riskFit';
    import { bucketRiskProfile, horizonFit, VERDICT_COLORS } from '~/utils/goals/riskFit';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';
    import { bucketHoldingsHealth, householdHoldingsHealth } from '~/utils/goals/holdingsHealth';
    import type { BucketHoldingsHealth } from '~/utils/goals/holdingsHealth';
    import type { BucketCardViewModel } from '~/components/goals/BucketCard.vue';

    const router = useRouter();
    const { users, activeUserId, activeUser, setActiveUser, updateUser, markOnboarded } = useUser();
    const { portfolios, setActivePortfolio } = usePortfolio(activeUserId);

    const onboardingOpen = ref(false);

    const userOptions = computed(() => users.value.map((u) => ({ title: u.name, value: u.id })));

    const activeUserIdModel = computed({
        get: () => activeUserId.value,
        set: (v) => {
            if (v) setActiveUser(v);
        },
    });

    function onOnboardingSubmit(
        profile: Omit<import('~/composables/useUser').DemoUser, 'id' | 'createdAt' | 'onboarded'>
    ) {
        if (activeUser.value) {
            updateUser(activeUser.value.id, profile);
            markOnboarded(activeUser.value.id);
        }
    }

    const buckets = computed(() => portfolios.value);

    const ALL_TIERS: RiskTier[] = ['critical', 'high', 'medium', 'low'];

    // ── Per-bucket risk fit + health (one pass) ─────────────────────
    const enrichedBuckets = computed(() => {
        if (!activeUser.value) return [];
        return buckets.value.map((bucket) => {
            const holdingVols = bucket.entities.map(
                (e) => (e.monitor?.stockVolatility30d ?? null) as number | null
            );
            const holdingSectors = bucket.entities.map(
                (e) => (e.monitor?.sector ?? null) as MacroFactorBucket | null
            );
            const inputs = bucket.entities.map((_, i) => ({
                annualizedVolPct: holdingVols[i],
                sectorBucket: holdingSectors[i],
            }));
            const profile = bucketRiskProfile(inputs);
            const fit: HorizonFit | null =
                bucket.goal && activeUser.value
                    ? horizonFit(
                          profile,
                          bucket.goal.horizonYears,
                          activeUser.value.riskTolerance,
                          bucket.goal.purpose
                      )
                    : null;
            const health = bucketHoldingsHealth(bucket.entities);

            return {
                id: bucket.id,
                name: bucket.name,
                goal: bucket.goal ?? null,
                entityCount: bucket.entities.length,
                priority: bucket.goal?.priority ?? null,
                fit,
                fitLabel: fit
                    ? fit.verdict === 'appropriate'
                        ? 'On track'
                        : fit.verdict === 'too_aggressive'
                          ? 'Too aggressive'
                          : 'Too conservative'
                    : null,
                fitColor: fit ? VERDICT_COLORS[fit.verdict] : 'default',
                overlappingNames: [] as string[],
                avgRiskScore: profile.avgScore,
                health,
            };
        });
    });

    // Fill overlap info (fixes the existing bug: was iterating bucketCards, not with-overlap)
    const bucketCardsWithOverlap = computed((): BucketCardViewModel[] => {
        const cards = enrichedBuckets.value;
        const nameMap = new Map<string, string[]>();
        for (const card of cards) {
            const bucket = buckets.value.find((b) => b.id === card.id);
            if (!bucket) continue;
            for (const entity of bucket.entities) {
                const name = entity.resolvedName || entity.inputName;
                if (!nameMap.has(name)) nameMap.set(name, []);
                nameMap.get(name)!.push(card.name);
            }
        }
        return cards.map((card) => {
            const bucket = buckets.value.find((b) => b.id === card.id);
            const overlappingNames = (bucket?.entities ?? [])
                .map((e) => e.resolvedName || e.inputName)
                .filter((name) => (nameMap.get(name)?.length ?? 0) > 1);
            return { ...card, overlappingNames };
        });
    });

    // Map bucketId -> health for BucketCard prop
    const bucketHealthMap = computed((): Record<string, BucketHoldingsHealth> => {
        const map: Record<string, BucketHoldingsHealth> = {};
        for (const e of enrichedBuckets.value) {
            map[e.id] = e.health;
        }
        return map;
    });

    // Spectrum view-model (shape required by ConstructionSpectrum)
    const spectrumBuckets = computed(() => bucketCardsWithOverlap.value);

    // Household-level health rollup
    const hhHealth = computed(() => householdHoldingsHealth(buckets.value));

    // Hero band — Dimension A stats
    const appropriateBuckets = computed(
        () => enrichedBuckets.value.filter((c) => c.fit?.verdict === 'appropriate').length
    );
    const aggressiveBuckets = computed(
        () => enrichedBuckets.value.filter((c) => c.fit?.verdict === 'too_aggressive').length
    );
    const conservativeBuckets = computed(
        () => enrichedBuckets.value.filter((c) => c.fit?.verdict === 'too_conservative').length
    );
    const totalHoldings = computed(() => buckets.value.reduce((s, b) => s + b.entities.length, 0));

    const summaryFitColor = computed(() =>
        aggressiveBuckets.value > 0
            ? 'error'
            : conservativeBuckets.value > 0
              ? 'warning'
              : 'success'
    );

    // Hero band — Dimension B color
    const healthPanelColor = computed(() => {
        if (hhHealth.value.scanned === 0) return 'default';
        if (hhHealth.value.tierCounts.critical > 0) return 'error';
        if (hhHealth.value.tierCounts.high > 0) return 'warning';
        return 'success';
    });

    // Cross-bucket duplicates
    const duplicateHoldings = computed(() => {
        const nameMap = new Map<string, string[]>();
        for (const bucket of buckets.value) {
            for (const entity of bucket.entities) {
                const name = entity.resolvedName || entity.inputName;
                if (!nameMap.has(name)) nameMap.set(name, []);
                const arr = nameMap.get(name)!;
                if (!arr.includes(bucket.name)) arr.push(bucket.name);
            }
        }
        return [...nameMap.entries()]
            .filter(([, bs]) => bs.length > 1)
            .map(([name, bs]) => ({ name, buckets: bs }));
    });

    // Empty health sentinel for type safety before map hydrates
    const emptyHealth: BucketHoldingsHealth = {
        total: 0,
        scanned: 0,
        tierCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        worstTier: null,
        needsAttention: 0,
        avgFused: null,
        lensWorst: { fhs: null, ers: null, acs: null },
    };

    function onOpenBucket(bucketId: string) {
        setActivePortfolio(bucketId);
        router.push('/');
    }

    // Color helpers
    function toleranceColor(t: number): string {
        if (t <= 2) return 'success';
        if (t === 3) return 'warning';
        return 'error';
    }
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
        background: rgba(var(--dynamic-bg-rgb), 0.3);
    }

    .hero-panel {
        border-radius: 10px;
        min-height: 160px;
    }
</style>
