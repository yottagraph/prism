<template>
    <v-tooltip :location="location" :max-width="340" content-class="lv-tooltip">
        <template #activator="{ props: ttProps }">
            <v-chip
                v-bind="ttProps"
                :size="size"
                :color="meta.color"
                variant="tonal"
                label
                :style="clickable ? 'cursor: pointer' : 'cursor: help'"
                @click="clickable ? openSourcesDialog() : undefined"
            >
                <v-icon v-if="showIcon" start :size="iconSize">{{ meta.icon }}</v-icon>
                {{ meta.shortLabel }}
            </v-chip>
        </template>
        <div>
            <div class="font-weight-medium mb-1">{{ meta.label }}</div>
            <div class="mb-1">{{ meta.whatItIs }}</div>
            <div class="text-caption" style="opacity: 0.8">{{ meta.whatWeUseItFor }}</div>
            <div v-if="showLearnMore" class="mt-2 text-caption" style="opacity: 0.6">
                Click to see all sources →
            </div>
        </div>
    </v-tooltip>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import { sourceMeta, type DataSourceKey } from '~/composables/useDataSources';
    import { useSourcesDialog } from '~/composables/useSourcesDialog';

    const props = withDefaults(
        defineProps<{
            /** DataSourceKey or a freeform source string (SEC, NEWS, STOCK, etc.). */
            source: DataSourceKey | string;
            /** Chip size. Defaults to 'x-small'. */
            size?: string;
            /** Whether to show the icon inside the chip. Defaults to false. */
            showIcon?: boolean;
            /** Tooltip location. Defaults to 'top'. */
            location?: string;
            /** If true, clicking the badge opens the Sources legend dialog. */
            clickable?: boolean;
            /** Show the "Click to see all sources" hint in the tooltip. */
            showLearnMore?: boolean;
        }>(),
        {
            size: 'x-small',
            showIcon: false,
            location: 'top',
            clickable: false,
            showLearnMore: false,
        }
    );

    const { openSourcesDialog } = useSourcesDialog();
    const meta = computed(() => sourceMeta(props.source));
    const iconSize = computed(() => (props.size === 'small' ? 14 : 12));
</script>
