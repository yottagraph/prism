<template>
    <div class="d-flex flex-column fill-height">
        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center" style="gap: 8px">
                <div class="d-flex align-center flex-shrink-0">
                    <v-tooltip
                        location="right"
                        text="Cross-bucket goal alignment, horizon fit, and concentration — one view"
                    >
                        <template #activator="{ props: ttProps }">
                            <v-icon
                                v-bind="ttProps"
                                size="large"
                                color="primary"
                                class="mr-2"
                                style="cursor: default"
                                >mdi-home-account</v-icon
                            >
                        </template>
                    </v-tooltip>
                    <h1 class="text-h6 font-weight-medium mb-0">
                        {{ activeUser?.name ?? 'Your' }} Overview
                    </h1>
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
                <nuxt-link to="/bucket">Goal Bucket</nuxt-link> to create one.
            </v-alert>

            <!-- ── Post-analysis payoff band ──────────────────────────── -->
            <v-card
                v-if="analysisSummary.isComplete && !scanningAll"
                variant="tonal"
                color="primary"
                class="mb-4 pa-3"
            >
                <div class="d-flex align-center flex-wrap" style="gap: 12px">
                    <v-icon size="small" class="mr-1">mdi-check-circle-outline</v-icon>
                    <span class="text-subtitle-2 font-weight-medium mr-2">Analysis complete</span>
                    <v-chip size="small" variant="text" class="px-1">
                        {{ analysisSummary.analyzedBuckets }}
                        {{ analysisSummary.analyzedBuckets === 1 ? 'goal' : 'goals' }} analyzed
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">·</span>
                    <v-chip size="small" variant="text" class="px-1">
                        {{ analysisSummary.scoredHoldings }} holdings scored
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">·</span>
                    <v-chip size="small" variant="text" class="px-1">
                        {{ analysisSummary.relationshipReadyCount }} entities in graph
                    </v-chip>
                    <template v-if="analysisSummary.needsAttention > 0">
                        <span class="text-caption text-medium-emphasis">·</span>
                        <v-chip size="small" variant="tonal" color="warning" class="px-2">
                            {{ analysisSummary.needsAttention }} need attention
                        </v-chip>
                    </template>
                </div>
            </v-card>

            <!-- ── Scan error / Retry banner ───────────────────────────── -->
            <v-alert
                v-if="!scanningAll && lastScanError"
                type="warning"
                variant="tonal"
                class="mb-4"
                icon="mdi-alert-circle-outline"
            >
                <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 8px">
                    <span
                        >Analysis ran into a problem — some holdings may not be fully scored.</span
                    >
                    <v-btn
                        size="small"
                        variant="tonal"
                        color="warning"
                        prepend-icon="mdi-refresh"
                        @click="scanActiveUserPortfolios({ force: true })"
                    >
                        Retry
                    </v-btn>
                </div>
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
                        <div class="d-flex align-center mb-3">
                            <v-icon size="small" class="mr-2">mdi-bullseye-arrow</v-icon>
                            <span class="text-subtitle-2 font-weight-medium">
                                Are portfolios built for their goals?
                            </span>
                        </div>

                        <!-- Headline verdict -->
                        <!-- Mid-scan: show progress, not a premature verdict -->
                        <div v-if="scanningAll" class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-medium-emphasis">
                                Analyzing goals…
                            </span>
                            <div class="text-body-2 text-medium-emphasis mt-1">
                                Elemental is fusing signals — check back in a moment.
                            </div>
                        </div>
                        <div v-else-if="!anyAnalyzed" class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-medium-emphasis">
                                Analysis needed
                            </span>
                            <div class="text-body-2 text-medium-emphasis mt-1">
                                Analyze your goals to see if they're built for your timeline.
                            </div>
                        </div>
                        <div
                            v-else-if="anyPartiallyAnalyzed && !allAnalyzedAndComplete"
                            class="headline-verdict mb-3"
                        >
                            <span class="text-h5 font-weight-bold text-warning">
                                Partial analysis
                            </span>
                            <div class="text-body-2 text-medium-emphasis mt-1">
                                Some holdings are still loading — verdicts may be incomplete.
                            </div>
                        </div>
                        <div v-else-if="aggressiveBuckets > 0" class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-error">
                                {{ aggressiveBuckets }}
                                {{ aggressiveBuckets === 1 ? 'bucket' : 'buckets' }}
                            </span>
                            <span class="text-body-1 ml-1">
                                {{ aggressiveBuckets === 1 ? 'is' : 'are' }} too aggressive for its
                                timeline
                            </span>
                        </div>
                        <div v-else-if="conservativeBuckets > 0" class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-warning">
                                {{ conservativeBuckets }}
                                {{ conservativeBuckets === 1 ? 'bucket' : 'buckets' }}
                            </span>
                            <span class="text-body-1 ml-1">may be leaving growth on the table</span>
                        </div>
                        <!-- "All goals aligned" only shown when scan is complete AND no
                             holdings are flagging risk — prevents contradictory green + red states. -->
                        <div
                            v-else-if="
                                allAnalyzedAndComplete && analysisSummary.needsAttention === 0
                            "
                            class="headline-verdict mb-3"
                        >
                            <span class="text-h5 font-weight-bold text-success">All goals</span>
                            <span class="text-body-1 ml-1">aligned with their timelines</span>
                        </div>
                        <div v-else-if="anyAnalyzed" class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-success">Goals</span>
                            <span class="text-body-1 ml-1">structurally aligned</span>
                            <div
                                v-if="analysisSummary.needsAttention > 0"
                                class="text-body-2 text-warning mt-1"
                            >
                                but {{ analysisSummary.needsAttention }}
                                {{
                                    analysisSummary.needsAttention === 1
                                        ? 'holding needs'
                                        : 'holdings need'
                                }}
                                review
                            </div>
                        </div>
                        <div v-else class="headline-verdict mb-3">
                            <span class="text-h5 font-weight-bold text-medium-emphasis"
                                >Analysis needed</span
                            >
                        </div>

                        <div class="d-flex align-center" style="gap: 16px">
                            <template v-if="anyAnalyzed">
                                <div class="text-center">
                                    <div class="text-h6 font-weight-bold">
                                        {{ appropriateBuckets }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">On track</div>
                                </div>
                                <div v-if="aggressiveBuckets > 0" class="text-center">
                                    <div class="text-h6 font-weight-bold text-error">
                                        {{ aggressiveBuckets }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        Too aggressive
                                    </div>
                                </div>
                                <div v-if="conservativeBuckets > 0" class="text-center">
                                    <div class="text-h6 font-weight-bold text-warning">
                                        {{ conservativeBuckets }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        Too conservative
                                    </div>
                                </div>
                            </template>
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
                                What needs attention?
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
                                Use the Analyze button to assess holdings.
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

                        <div class="mt-3">
                            <v-tooltip
                                location="top"
                                text="Powered by Elemental: SEC filings · news pressure · market signals · ownership screening"
                            >
                                <template #activator="{ props: ttProps }">
                                    <span
                                        v-bind="ttProps"
                                        class="text-caption text-medium-emphasis"
                                        style="cursor: default"
                                    >
                                        <v-icon size="12" class="mr-1"
                                            >mdi-lightning-bolt-circle</v-icon
                                        >
                                        Powered by Elemental
                                    </span>
                                </template>
                            </v-tooltip>
                        </div>
                    </v-card>
                </v-col>
            </v-row>

            <!-- ── Intelligence band: macro + AI summary ─────────────── -->
            <v-row v-if="anyAnalyzed" dense class="mb-4">
                <v-col cols="12" md="5">
                    <MacroPanel />
                </v-col>
                <v-col cols="12" md="7">
                    <v-card class="pa-4 fill-height d-flex flex-column">
                        <div class="d-flex align-center mb-3" style="gap: 10px">
                            <v-icon size="small">mdi-text-box-outline</v-icon>
                            <span class="text-subtitle-2">Portfolio Intelligence</span>
                            <v-chip
                                v-if="overviewSummaryLoading"
                                size="small"
                                variant="text"
                                color="default"
                            >
                                <v-progress-circular
                                    size="10"
                                    width="2"
                                    indeterminate
                                    class="mr-1"
                                />
                                Generating…
                            </v-chip>
                            <v-spacer />
                            <v-btn
                                v-if="overviewSummaryText && !overviewSummaryLoading"
                                size="x-small"
                                variant="text"
                                color="primary"
                                append-icon="mdi-arrow-right"
                                @click="router.push('/bucket')"
                            >
                                Full briefing
                            </v-btn>
                        </div>

                        <!-- Loading state -->
                        <div
                            v-if="overviewSummaryLoading"
                            class="flex-grow-1 d-flex flex-column align-center justify-center text-center pa-4"
                        >
                            <v-progress-circular
                                size="28"
                                width="2"
                                indeterminate
                                class="mb-3 text-medium-emphasis"
                            />
                            <div class="text-body-2 text-medium-emphasis">
                                Synthesizing portfolio intelligence…
                            </div>
                        </div>

                        <!-- Error state -->
                        <div
                            v-else-if="overviewSummaryError"
                            class="flex-grow-1 d-flex align-center justify-center text-center pa-4"
                        >
                            <div>
                                <div class="text-body-2 text-medium-emphasis mb-2">
                                    Intelligence summary unavailable
                                </div>
                                <v-btn
                                    size="small"
                                    variant="text"
                                    color="primary"
                                    @click="generateOverviewSummary"
                                >
                                    Retry
                                </v-btn>
                            </div>
                        </div>

                        <!-- Empty: analysis not yet run -->
                        <div
                            v-else-if="!overviewSummaryText"
                            class="flex-grow-1 d-flex flex-column align-center justify-center text-center pa-6"
                        >
                            <v-icon size="32" class="mb-2 text-medium-emphasis"
                                >mdi-text-box-outline</v-icon
                            >
                            <div class="text-body-2 text-medium-emphasis">
                                Analyze your goals to generate a portfolio intelligence briefing.
                            </div>
                        </div>

                        <!-- Content: parsed "What You Need to Know" bullets -->
                        <div v-else class="flex-grow-1">
                            <div
                                v-for="(line, idx) in overviewSummaryBullets"
                                :key="idx"
                                class="d-flex mb-2"
                                style="gap: 8px; align-items: flex-start"
                            >
                                <v-icon
                                    size="14"
                                    color="primary"
                                    class="flex-shrink-0"
                                    style="margin-top: 4px"
                                    >mdi-circle-small</v-icon
                                >
                                <span class="text-body-2">{{ line }}</span>
                            </div>
                        </div>
                    </v-card>
                </v-col>
            </v-row>

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

            <!-- ── Next best review ──────────────────────────────────── -->
            <v-card
                v-if="nextBestReview"
                variant="outlined"
                class="mb-4 pa-3 d-flex align-center"
                style="gap: 12px; cursor: pointer"
                @click="onOpenBucket(nextBestReview.id)"
            >
                <v-icon color="warning" size="small">mdi-alert-circle-outline</v-icon>
                <div class="flex-grow-1">
                    <span class="text-subtitle-2 font-weight-medium">Next best review: </span>
                    <span class="text-body-2">{{ nextBestReview.name }}</span>
                    <span class="text-body-2 text-medium-emphasis ml-2">
                        · {{ nextBestReview.reason }}
                    </span>
                </div>
                <v-btn size="small" variant="text" color="primary" append-icon="mdi-arrow-right">
                    Open bucket
                </v-btn>
            </v-card>

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

            <!-- ── Risk spectrum (secondary / contextual) ─────────── -->
            <div v-if="buckets.length > 1" class="mt-2">
                <h2 class="text-subtitle-1 font-weight-medium mb-2">
                    <v-icon size="small" class="mr-1">mdi-chart-scatter-plot</v-icon>
                    Risk spectrum across goals
                </h2>
                <GoalsConstructionSpectrum
                    :buckets="spectrumBuckets"
                    class="mb-4"
                    @open="onOpenBucket"
                />
            </div>
        </div>

        <OnboardingOnboardingDialog
            v-model="onboardingOpen"
            :user="activeUser"
            @submit="onOnboardingSubmit"
        />
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';
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
    const {
        portfolios,
        setActivePortfolio,
        analysisSummary,
        scanningAll,
        lastScanError,
        scanActiveUserPortfolios,
    } = usePortfolio(activeUserId);

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
            const analyzed = bucket.entities.some((e) => e.scores != null);
            // Partially analyzed: some scored but not all entities in the bucket.
            const scoredEntities = bucket.entities.filter((e) => e.scores != null);
            const partiallyAnalyzed = analyzed && scoredEntities.length < bucket.entities.length;
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
                analyzed && bucket.goal && activeUser.value
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
                analyzed,
                partiallyAnalyzed,
                fit,
                fitLabel: !analyzed
                    ? bucket.goal
                        ? 'Not analyzed'
                        : null
                    : partiallyAnalyzed
                      ? 'Partially analyzed'
                      : fit
                        ? fit.verdict === 'appropriate'
                            ? 'On track'
                            : fit.verdict === 'too_aggressive'
                              ? 'Too aggressive'
                              : 'Too conservative'
                        : null,
                fitColor: !analyzed
                    ? 'default'
                    : partiallyAnalyzed
                      ? 'warning'
                      : fit
                        ? VERDICT_COLORS[fit.verdict]
                        : 'default',
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
    const analyzedBuckets = computed(() => enrichedBuckets.value.filter((c) => c.analyzed));
    const notAnalyzedCount = computed(
        () => enrichedBuckets.value.filter((c) => !c.analyzed && c.goal).length
    );
    const appropriateBuckets = computed(
        () => analyzedBuckets.value.filter((c) => c.fit?.verdict === 'appropriate').length
    );
    const aggressiveBuckets = computed(
        () => analyzedBuckets.value.filter((c) => c.fit?.verdict === 'too_aggressive').length
    );
    const conservativeBuckets = computed(
        () => analyzedBuckets.value.filter((c) => c.fit?.verdict === 'too_conservative').length
    );
    const totalHoldings = computed(() => buckets.value.reduce((s, b) => s + b.entities.length, 0));

    const anyAnalyzed = computed(() => analyzedBuckets.value.length > 0);

    /** True when at least one bucket has some scored entities but not all. */
    const anyPartiallyAnalyzed = computed(() =>
        enrichedBuckets.value.some((c) => c.partiallyAnalyzed)
    );

    /**
     * True only when all buckets are analyzed and no scan is running.
     * Gates "All goals aligned" so we don't show a premature green headline
     * while analysis is still in progress.
     */
    const allAnalyzedAndComplete = computed(
        () => analysisSummary.value.isComplete && !scanningAll.value
    );

    const summaryFitColor = computed(() => {
        if (!allAnalyzedAndComplete.value) return 'default';
        if (aggressiveBuckets.value > 0) return 'error';
        if (conservativeBuckets.value > 0) return 'warning';
        // Even if bands are fine, flag attention if holdings are risky
        if (analysisSummary.value.needsAttention > 0) return 'warning';
        return 'success';
    });

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
        router.push('/bucket');
    }

    /**
     * Bucket most urgently needing review: too-aggressive first, then
     * highest needsAttention count. Always includes a plain-language reason
     * so the card is never contradictory (e.g. never "Retirement — On track").
     */
    const nextBestReview = computed((): { id: string; name: string; reason: string } | null => {
        const cards = enrichedBuckets.value.filter((c) => c.analyzed);
        if (cards.length === 0) return null;

        // Priority 1: buckets that are too-aggressive for their horizon
        const aggressive = cards
            .filter((c) => c.fit?.verdict === 'too_aggressive')
            .sort((a, b) => (b.health.needsAttention ?? 0) - (a.health.needsAttention ?? 0));
        if (aggressive.length > 0) {
            const c = aggressive[0]!;
            const attn = c.health.needsAttention;
            const reason =
                attn > 0
                    ? `${attn} high-risk holding${attn === 1 ? '' : 's'} · too aggressive for ${c.fit?.reason ? 'its timeline' : 'the goal'}`
                    : 'Risk profile too aggressive for the goal horizon';
            return { id: c.id, name: c.name, reason };
        }

        // Priority 2: buckets with high/critical holdings needing attention
        const needsAttn = cards
            .filter((c) => c.health.needsAttention > 0)
            .sort((a, b) => (b.health.needsAttention ?? 0) - (a.health.needsAttention ?? 0));
        if (needsAttn.length > 0) {
            const c = needsAttn[0]!;
            const n = c.health.needsAttention;
            return {
                id: c.id,
                name: c.name,
                reason: `${n} holding${n === 1 ? '' : 's'} flagged high or critical risk`,
            };
        }

        return null;
    });

    // Color helpers
    function toleranceColor(t: number): string {
        if (t <= 2) return 'success';
        if (t === 3) return 'warning';
        return 'error';
    }

    // ── Overview AI summary (condensed, cross-bucket) ────────────────
    const overviewSummaryText = ref('');
    const overviewSummaryLoading = ref(false);
    const overviewSummaryKey = ref('');
    const overviewSummaryError = ref(false);

    const allScoredEntities = computed(() => {
        const seen = new Set<string>();
        const result: any[] = [];
        for (const portfolio of portfolios.value) {
            for (const e of portfolio.entities) {
                if (!e.scores) continue;
                const key = e.neid ?? e.inputName;
                if (seen.has(key)) continue;
                seen.add(key);
                result.push({
                    resolvedName: e.resolvedName || e.inputName,
                    neid: e.neid ?? null,
                    ticker: (e as any).ticker ?? undefined,
                    scores: e.scores,
                    drivers: (e as any).drivers,
                    confidenceLevel: (e as any).confidenceLevel,
                    coverage: (e as any).coverage,
                    monitor: e.monitor,
                });
            }
        }
        return result;
    });

    const overviewSummaryBullets = computed(() =>
        overviewSummaryText.value
            .split('\n')
            .map((l) => l.replace(/^[-*•]\s*/, '').trim())
            .filter((l) => l.length > 0)
    );

    async function generateOverviewSummary() {
        if (!allScoredEntities.value.length) return;
        const key = `${analysisSummary.value.scoredHoldings}::${analysisSummary.value.analyzedBuckets}`;
        if (overviewSummaryKey.value === key && overviewSummaryText.value) return;
        overviewSummaryKey.value = key;
        overviewSummaryLoading.value = true;
        overviewSummaryError.value = false;
        try {
            const res = await $fetch<{ summary: string }>('/api/portfolio-summary/generate', {
                method: 'POST',
                body: {
                    portfolioName: `${activeUser.value?.name ?? 'Your'} portfolio`,
                    entities: allScoredEntities.value,
                    config: { style: 'brief', focus: 'risks', tone: 'conversational' },
                },
                timeout: 120_000,
            });
            const raw = res.summary ?? '';
            const match = raw.match(/## What You Need to Know\s*([\s\S]*?)(?=\n## |\n---|\s*$)/);
            overviewSummaryText.value = match ? match[1]!.trim() : raw;
        } catch {
            overviewSummaryError.value = true;
            overviewSummaryText.value = '';
            overviewSummaryKey.value = '';
        } finally {
            overviewSummaryLoading.value = false;
        }
    }

    watch(
        () => analysisSummary.value.isComplete,
        (complete) => {
            if (complete && !scanningAll.value) {
                void generateOverviewSummary();
            }
        },
        { immediate: true }
    );
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

    .headline-verdict {
        line-height: 1.3;
    }
</style>
