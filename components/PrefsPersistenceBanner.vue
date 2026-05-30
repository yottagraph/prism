<template>
    <v-alert
        v-if="backend === 'none'"
        type="error"
        density="compact"
        variant="tonal"
        icon="mdi-database-off-outline"
        class="persistence-banner ma-3 mb-0"
    >
        <strong>Scan data won't survive a reload.</strong>
        Preferences persistence is not configured for this deployment — contact your administrator
        to enable Firestore on this tenant.
    </v-alert>
</template>

<script setup lang="ts">
    const { backend } = usePrefsStatus();
</script>

<style scoped>
    .persistence-banner {
        border-radius: 8px;
    }
</style>
