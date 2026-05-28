<template>
    <v-card variant="outlined">
        <v-card-title class="text-subtitle-1">Preview</v-card-title>
        <v-card-subtitle>
            Top {{ rows.length }} entities re-ranked with current settings (client-side only).
        </v-card-subtitle>
        <v-table v-if="rows.length" density="compact">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Entity</th>
                    <th class="text-right">Fused</th>
                    <th>Tier</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(row, i) in rows" :key="row.inputName">
                    <td>{{ i + 1 }}</td>
                    <td class="text-truncate" style="max-width: 180px">
                        {{ row.resolvedName || row.inputName }}
                    </td>
                    <td class="text-right font-weight-medium">{{ row.fused }}</td>
                    <td>
                        <v-chip :color="tierColor(row.tier)" size="x-small" label>
                            {{ row.tier }}
                        </v-chip>
                    </td>
                </tr>
            </tbody>
        </v-table>
        <v-card-text v-else class="text-center text-medium-emphasis">
            Run a scan first to see preview rankings.
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import {
        deriveTier,
        fuseScore,
        type ScoringSettings,
        tierColor,
    } from '~/composables/useFusedScoring';
    import type { PortfolioEntity } from '~/composables/usePortfolio';

    const props = defineProps<{
        entities: PortfolioEntity[];
        scoring: ScoringSettings;
    }>();

    const rows = computed(() => {
        return props.entities
            .filter((e) => e.scores)
            .map((e) => {
                const fused = fuseScore(e.scores!, props.scoring.weights);
                const tier = deriveTier(fused, props.scoring.tiers);
                return {
                    inputName: e.inputName,
                    resolvedName: e.resolvedName,
                    fused,
                    tier,
                };
            })
            .sort((a, b) => b.fused - a.fused)
            .slice(0, 10);
    });
</script>
