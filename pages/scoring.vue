<template>
    <div class="pa-4">
        <PageHeader title="Scoring" icon="mdi-tune-vertical">
            <template #actions>
                <v-chip
                    size="small"
                    label
                    :color="hasCustom ? 'warning' : 'default'"
                    :variant="hasCustom ? 'flat' : 'tonal'"
                    class="mr-2"
                >
                    {{ hasCustom ? 'Custom settings' : 'Default settings' }}
                </v-chip>
                <ScoringPresetPicker :presets="presets" @select="applyPreset" />
                <v-btn
                    variant="text"
                    size="small"
                    prepend-icon="mdi-restore"
                    class="ml-2"
                    @click="resetAll"
                >
                    Reset all
                </v-btn>
            </template>
        </PageHeader>

        <div class="d-flex align-center ga-3 mt-4 mb-4">
            <v-select
                :model-value="activePortfolio?.id"
                :items="portfolioItems"
                item-title="name"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details
                label="Portfolio"
                style="max-width: 320px"
                @update:model-value="setActivePortfolio(String($event))"
            />
        </div>

        <v-row>
            <v-col cols="12" md="8">
                <v-tabs v-model="activeTab" density="compact" class="mb-4">
                    <v-tab value="fusion">Fusion</v-tab>
                    <v-tab value="fhs">FHS</v-tab>
                    <v-tab value="ers">ERS</v-tab>
                    <v-tab value="acs">ACS</v-tab>
                    <v-tab value="bands">Bands &amp; Tiers</v-tab>
                </v-tabs>

                <v-tabs-window v-model="activeTab">
                    <v-tabs-window-item value="fusion">
                        <ScoringFusionPanel
                            :weights="scoring.weights"
                            @update:weights="setWeights"
                        />
                    </v-tabs-window-item>
                    <v-tabs-window-item value="fhs">
                        <ScoringFhsPanel :fhs="scoring.fhs" @update:fhs="setFhs" />
                    </v-tabs-window-item>
                    <v-tabs-window-item value="ers">
                        <ScoringErsPanel :ers="scoring.ers" @update:ers="setErs" />
                    </v-tabs-window-item>
                    <v-tabs-window-item value="acs">
                        <ScoringAcsPanel :acs="scoring.acs" @update:acs="setAcs" />
                    </v-tabs-window-item>
                    <v-tabs-window-item value="bands">
                        <ScoringBandsPanel
                            :tiers="scoring.tiers"
                            :category-bands="scoring.categoryBands"
                            @update:tiers="setTiers"
                            @update:category-bands="setCategoryBands"
                        />
                    </v-tabs-window-item>
                </v-tabs-window>

                <div class="d-flex align-center ga-2 mt-4">
                    <v-btn
                        variant="text"
                        size="small"
                        prepend-icon="mdi-restore"
                        @click="resetSection(activeTab as ScoringSection)"
                    >
                        Reset {{ activeTab }}
                    </v-btn>
                </div>
            </v-col>
            <v-col cols="12" md="4">
                <div class="position-sticky" style="top: 80px">
                    <ScoringPreviewTable
                        :entities="activePortfolio?.entities ?? []"
                        :scoring="scoring"
                    />
                    <v-btn
                        color="primary"
                        variant="flat"
                        block
                        class="mt-3"
                        prepend-icon="mdi-refresh"
                        :loading="scanning"
                        @click="rescan"
                    >
                        Re-scan portfolio
                    </v-btn>
                </div>
            </v-col>
        </v-row>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { type ScoringSection, useScoringSettings } from '~/composables/useScoringSettings';

    const { activePortfolio, portfolios, setActivePortfolio, scanning } = usePortfolio();
    const {
        scoring,
        hasCustom,
        presets,
        applyPreset,
        setWeights,
        setTiers,
        setCategoryBands,
        setFhs,
        setErs,
        setAcs,
        resetSection,
        resetAll,
        rescan,
    } = useScoringSettings();

    const activeTab = ref('fusion');
    const portfolioItems = computed(() =>
        portfolios.value.map((p) => ({ id: p.id, name: p.name }))
    );
</script>
