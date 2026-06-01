<template>
    <v-tooltip :location="location as any" :max-width="300" content-class="lv-tooltip">
        <template #activator="{ props: ttProps }">
            <v-icon
                v-bind="ttProps"
                :size="size"
                :class="['help-tooltip-icon', iconClass]"
                style="cursor: help; opacity: 0.55; vertical-align: middle"
                >{{ icon }}</v-icon
            >
        </template>
        <div>
            <div v-if="title" class="font-weight-medium mb-1">{{ title }}</div>
            <div>{{ text }}</div>
        </div>
    </v-tooltip>
</template>

<script setup lang="ts">
    withDefaults(
        defineProps<{
            /** Main tooltip body text. Required. */
            text: string;
            /** Optional bold heading inside the tooltip. */
            title?: string;
            /** MDI icon to render. Defaults to mdi-information-outline. */
            icon?: string;
            /** v-icon size. Defaults to 16. */
            size?: number | string;
            /** Vuetify tooltip location. Defaults to 'top'. */
            location?: string;
            /** Extra CSS classes on the icon element. */
            iconClass?: string;
        }>(),
        {
            icon: 'mdi-information-outline',
            size: 16,
            location: 'top',
        }
    );
</script>

<style scoped>
    .help-tooltip-icon {
        margin-left: 4px;
    }
</style>
