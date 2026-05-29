<template>
    <div class="d-flex flex-column fill-height">
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
                <!-- User switcher -->
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

            <!-- User profile summary -->
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

            <!-- Summary strip -->
            <v-row v-if="buckets.length > 0" dense class="mb-4">
                <v-col cols="6" sm="3">
                    <v-card variant="tonal" color="primary" class="pa-3 text-center">
                        <div class="text-h5 font-weight-bold">{{ buckets.length }}</div>
                        <div class="text-caption text-medium-emphasis">Buckets</div>
                    </v-card>
                </v-col>
                <v-col cols="6" sm="3">
                    <v-card variant="tonal" :color="summaryFitColor" class="pa-3 text-center">
                        <div class="text-h5 font-weight-bold">{{ appropriateBuckets }}</div>
                        <div class="text-caption text-medium-emphasis">On track</div>
                    </v-card>
                </v-col>
                <v-col cols="6" sm="3">
                    <v-card variant="tonal" color="error" class="pa-3 text-center">
                        <div class="text-h5 font-weight-bold">{{ aggressiveBuckets }}</div>
                        <div class="text-caption text-medium-emphasis">Too aggressive</div>
                    </v-card>
                </v-col>
                <v-col cols="6" sm="3">
                    <v-card variant="tonal" color="default" class="pa-3 text-center">
                        <div class="text-h5 font-weight-bold">{{ totalHoldings }}</div>
                        <div class="text-caption text-medium-emphasis">Total holdings</div>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Bucket cards -->
            <v-row dense class="mb-4">
                <v-col v-for="bucket in bucketCards" :key="bucket.id" cols="12" md="6" xl="4">
                    <v-card variant="outlined" class="bucket-card pa-4 fill-height">
                        <div class="d-flex align-center mb-2">
                            <v-icon
                                :color="priorityColor(bucket.priority)"
                                class="mr-2"
                                size="small"
                            >
                                mdi-target
                            </v-icon>
                            <span class="text-subtitle-2 font-weight-medium">
                                {{ bucket.name }}
                            </span>
                            <v-spacer />
                            <v-chip
                                v-if="bucket.fit"
                                :color="bucket.fitColor"
                                size="x-small"
                                variant="flat"
                                label
                            >
                                {{ bucket.fitLabel }}
                            </v-chip>
                            <span v-else class="text-caption text-medium-emphasis"
                                >No goal set</span
                            >
                        </div>

                        <div v-if="bucket.goal" class="mb-2 d-flex align-center" style="gap: 8px">
                            <v-chip size="x-small" variant="tonal" color="default">
                                {{ bucket.goal.horizonYears }}y horizon
                            </v-chip>
                            <v-chip
                                v-if="bucket.goal.priority"
                                size="x-small"
                                variant="tonal"
                                :color="priorityColor(bucket.goal.priority)"
                            >
                                {{ bucket.goal.priority }}
                            </v-chip>
                        </div>

                        <p v-if="bucket.fit" class="text-body-2 text-medium-emphasis mb-3">
                            {{ bucket.fit.reason }}
                        </p>

                        <div v-if="bucket.fit" class="d-flex align-center mb-2" style="gap: 8px">
                            <span class="text-caption text-medium-emphasis">Actual:</span>
                            <v-chip
                                :color="bandColor(bucket.fit.actualBand)"
                                size="x-small"
                                variant="tonal"
                            >
                                {{ capitalize(bucket.fit.actualBand) }}
                            </v-chip>
                            <v-icon size="x-small">mdi-arrow-right</v-icon>
                            <span class="text-caption text-medium-emphasis">Target:</span>
                            <v-chip
                                :color="bandColor(bucket.fit.targetBand)"
                                size="x-small"
                                variant="tonal"
                            >
                                {{ capitalize(bucket.fit.targetBand) }}
                            </v-chip>
                        </div>

                        <div class="d-flex align-center mt-auto pt-2">
                            <span class="text-caption text-medium-emphasis">
                                {{ bucket.entityCount }} holding{{
                                    bucket.entityCount !== 1 ? 's' : ''
                                }}
                            </span>
                            <v-spacer />
                            <v-btn
                                size="x-small"
                                variant="text"
                                :to="'/'"
                                @click="setActivePortfolio(bucket.id)"
                            >
                                Open
                                <v-icon size="x-small" end>mdi-arrow-right</v-icon>
                            </v-btn>
                        </div>

                        <!-- Overlap indicator -->
                        <div
                            v-if="bucket.overlappingNames.length > 0"
                            class="mt-2 pa-2 rounded bg-warning-lighten-5"
                        >
                            <span class="text-caption text-warning-darken-2">
                                <v-icon size="x-small" color="warning">mdi-alert-outline</v-icon>
                                Also in other buckets:
                                {{ bucket.overlappingNames.slice(0, 3).join(', ')
                                }}{{
                                    bucket.overlappingNames.length > 3
                                        ? ` +${bucket.overlappingNames.length - 3}`
                                        : ''
                                }}
                            </span>
                        </div>
                    </v-card>
                </v-col>
            </v-row>

            <!-- Cross-bucket concentration -->
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
    import { useUser } from '~/composables/useUser';
    import { usePortfolio } from '~/composables/usePortfolio';
    import type { RiskBand, HorizonFit } from '~/utils/goals/riskFit';
    import { bucketRiskProfile, horizonFit, VERDICT_COLORS } from '~/utils/goals/riskFit';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';

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

    // Per-bucket risk fit
    const bucketCards = computed(() => {
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
                overlappingNames: [] as string[], // filled below
            };
        });
    });

    // Fill overlap info
    const bucketCardsWithOverlap = computed(() => {
        const cards = bucketCards.value;
        // Build a map: resolved name -> buckets containing it
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

    // Summary stats
    const appropriateBuckets = computed(
        () => bucketCardsWithOverlap.value.filter((c) => c.fit?.verdict === 'appropriate').length
    );
    const aggressiveBuckets = computed(
        () => bucketCardsWithOverlap.value.filter((c) => c.fit?.verdict === 'too_aggressive').length
    );
    const totalHoldings = computed(() => buckets.value.reduce((s, b) => s + b.entities.length, 0));
    const summaryFitColor = computed(() =>
        appropriateBuckets.value === buckets.value.filter((b) => b.goal).length
            ? 'success'
            : 'warning'
    );

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

    function bandColor(band: RiskBand): string {
        switch (band) {
            case 'aggressive':
                return 'error';
            case 'moderate':
                return 'warning';
            case 'conservative':
                return 'success';
            default:
                return 'default';
        }
    }

    function toleranceColor(t: number): string {
        if (t <= 2) return 'success';
        if (t === 3) return 'warning';
        return 'error';
    }

    function priorityColor(priority: string | null): string {
        switch (priority) {
            case 'essential':
                return 'error';
            case 'important':
                return 'primary';
            case 'aspirational':
                return 'secondary';
            default:
                return 'default';
        }
    }

    function capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
</script>

<style scoped>
    .bucket-card {
        border-radius: 8px;
        display: flex;
        flex-direction: column;
    }
</style>
