<template>
    <div>
        <div v-if="!patterns.length" class="text-caption text-medium-emphasis pa-4">
            No cross-portfolio patterns detected yet. Run a scan to surface governance interlocks,
            common lenders, and geographic clusters.
        </div>
        <v-row v-else dense>
            <v-col v-for="(p, i) in patterns" :key="i" cols="12" md="6" lg="4">
                <v-card class="pa-3 pattern-card">
                    <v-chip
                        size="x-small"
                        variant="tonal"
                        :color="kindColor(p.kind)"
                        label
                        class="mb-2"
                    >
                        {{ kindLabel(p.kind) }}
                    </v-chip>
                    <div class="text-body-1 font-weight-medium mb-1">{{ p.title }}</div>
                    <div class="text-body-2 text-medium-emphasis mb-2">{{ p.description }}</div>
                    <div class="text-caption text-medium-emphasis">
                        <v-icon size="x-small" class="mr-1">mdi-link-variant</v-icon>
                        {{ p.entities.join(', ') }}
                    </div>
                </v-card>
            </v-col>
        </v-row>
    </div>
</template>

<script setup lang="ts">
    import type { PortfolioPattern } from '~/composables/useRelationships';

    defineProps<{ patterns: PortfolioPattern[] }>();

    function kindLabel(k: PortfolioPattern['kind']) {
        switch (k) {
            case 'governance_interlock':
                return 'Governance interlock';
            case 'common_lender':
                return 'Common lender';
            case 'subsidiary_chain':
                return 'Subsidiary chain';
            case 'geographic_cluster':
                return 'Geographic cluster';
            case 'coordinated_departures':
                return 'Coordinated departures';
            case 'ownership_overlap':
                return 'Ownership overlap';
        }
    }
    function kindColor(k: PortfolioPattern['kind']) {
        switch (k) {
            case 'governance_interlock':
                return 'warning';
            case 'common_lender':
                return 'error';
            case 'subsidiary_chain':
                return 'info';
            case 'geographic_cluster':
                return 'primary';
            case 'coordinated_departures':
                return 'warning';
            case 'ownership_overlap':
                return 'info';
        }
    }
</script>

<style scoped>
    .pattern-card {
        height: 100%;
        background: rgba(255, 255, 255, 0.02);
        border-left: 3px solid rgba(63, 234, 0, 0.4);
    }
</style>
