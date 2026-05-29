<template>
    <div class="entity-search-add">
        <v-text-field
            v-model="searchQuery"
            label="Search by name"
            placeholder="e.g. Apple Inc, Snowflake, Ford Motor"
            variant="outlined"
            density="comfortable"
            clearable
            prepend-inner-icon="mdi-magnify"
            :loading="searching"
            hide-details="auto"
            class="mb-3"
            @keyup.enter="runSearch"
            @click:clear="clearSearch"
        >
            <template #append-inner>
                <v-btn
                    color="primary"
                    variant="tonal"
                    size="small"
                    :loading="searching"
                    :disabled="!searchQuery?.trim()"
                    style="margin-top: -2px"
                    @click="runSearch"
                >
                    Search
                </v-btn>
            </template>
        </v-text-field>

        <!-- Results -->
        <template v-if="searchResults.length > 0">
            <div class="d-flex align-center justify-space-between mb-2">
                <span class="text-body-2 text-medium-emphasis">
                    {{ searchResults.length }} result{{ searchResults.length === 1 ? '' : 's' }}
                </span>
                <v-btn
                    color="primary"
                    size="small"
                    variant="tonal"
                    :disabled="selected.length === 0"
                    @click="emitSelected"
                >
                    Add selected ({{ selected.length }})
                </v-btn>
            </div>

            <v-list density="compact" lines="two" class="search-results-list rounded border">
                <v-list-item
                    v-for="r in searchResults"
                    :key="r.neid"
                    :class="{ 'bg-primary-darken-4': isSelected(r.neid) }"
                    @click="toggleSelect(r)"
                >
                    <template #prepend>
                        <v-checkbox-btn
                            :model-value="isSelected(r.neid)"
                            color="primary"
                            density="compact"
                        />
                    </template>
                    <v-list-item-title class="text-body-2 font-weight-medium">
                        {{ r.name }}
                    </v-list-item-title>
                    <v-list-item-subtitle class="text-caption">
                        {{ r.neid }}
                    </v-list-item-subtitle>
                    <template v-if="r.score != null" #append>
                        <v-chip
                            size="x-small"
                            :color="
                                r.score >= 0.85 ? 'success' : r.score >= 0.6 ? 'warning' : 'error'
                            "
                            variant="tonal"
                            label
                        >
                            {{ Math.round(r.score * 100) }}%
                        </v-chip>
                    </template>
                </v-list-item>
            </v-list>
        </template>

        <!-- Empty state after search -->
        <div v-else-if="hasSearched && !searching" class="text-center py-6 text-medium-emphasis">
            <v-icon size="36" class="mb-2">mdi-magnify-minus-outline</v-icon>
            <div class="text-body-2">No entities found. Try a different search term.</div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue';
    import { searchEntities } from '~/utils/elementalHelpers';
    import type { ResolvedEntityInput } from '~/composables/usePortfolio';

    interface SearchResult {
        neid: string;
        name: string;
        score?: number;
    }

    const emit = defineEmits<{
        add: [entities: ResolvedEntityInput[]];
    }>();

    const searchQuery = ref('');
    const searching = ref(false);
    const hasSearched = ref(false);
    const searchResults = ref<SearchResult[]>([]);
    const selected = ref<SearchResult[]>([]);

    async function runSearch() {
        const q = searchQuery.value?.trim();
        if (!q) return;
        searching.value = true;
        hasSearched.value = true;
        try {
            searchResults.value = await searchEntities(q, {
                maxResults: 10,
                flavors: ['organization'],
            });
            selected.value = [];
        } catch {
            searchResults.value = [];
        } finally {
            searching.value = false;
        }
    }

    function isSelected(neid: string): boolean {
        return selected.value.some((s) => s.neid === neid);
    }

    function toggleSelect(r: SearchResult) {
        if (isSelected(r.neid)) {
            selected.value = selected.value.filter((s) => s.neid !== r.neid);
        } else {
            selected.value.push(r);
        }
    }

    function emitSelected() {
        if (selected.value.length === 0) return;
        emit(
            'add',
            selected.value.map((r) => ({
                inputName: r.name,
                resolvedName: r.name,
                neid: r.neid,
            }))
        );
        selected.value = [];
    }

    function clearSearch() {
        searchResults.value = [];
        selected.value = [];
        hasSearched.value = false;
    }
</script>

<style scoped>
    .search-results-list {
        max-height: 340px;
        overflow-y: auto;
    }
</style>
