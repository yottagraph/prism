<template>
    <v-navigation-drawer
        permanent
        app
        width="240"
        rail-width="72"
        :rail="isCollapsed"
        class="sidebar-nav"
    >
        <div
            class="brand-block d-flex align-center pa-4"
            :class="{ 'brand-block--collapsed flex-column pa-2': isCollapsed }"
        >
            <div class="brand-icon" :class="{ 'mr-2': !isCollapsed }">P</div>
            <div v-if="!isCollapsed" class="brand-copy">
                <div class="brand-name">Prism</div>
                <div class="brand-tag text-caption">Elemental · Agent-builder demo</div>
            </div>
            <v-btn
                icon
                variant="text"
                size="small"
                class="collapse-btn"
                :class="{ 'ml-auto': !isCollapsed, 'mt-2': isCollapsed }"
                :aria-label="collapseLabel"
                @click.stop="toggleCollapsed"
            >
                <v-icon size="18">{{ collapseIcon }}</v-icon>
            </v-btn>
        </div>
        <v-divider />

        <!-- Agent-builder surface — the primary demo entry point -->
        <div
            v-if="!isCollapsed"
            class="nav-section-label px-4 pt-3 pb-1 text-caption text-medium-emphasis"
        >
            Agent workspace
        </div>
        <v-list nav density="compact" class="pb-0">
            <v-list-item
                v-for="item in workspaceItems"
                :key="item.to"
                :to="item.to"
                :prepend-icon="item.icon"
                :title="item.title"
                :subtitle="item.subtitle"
                color="primary"
            />
        </v-list>

        <v-divider class="mt-2" />

        <!-- Retail goals-based path (same engine, retail mandate) -->
        <div
            v-if="!isCollapsed"
            class="nav-section-label px-4 pt-3 pb-1 text-caption text-medium-emphasis"
        >
            Retail demo
        </div>
        <v-list nav density="compact" class="pb-0">
            <v-list-item
                v-for="item in investorItems"
                :key="item.to"
                :to="item.to"
                :prepend-icon="item.icon"
                :title="item.title"
                :subtitle="item.subtitle"
                color="primary"
            />
        </v-list>

        <v-divider class="mt-2" />

        <!-- Engine internals -->
        <div
            v-if="!isCollapsed"
            class="nav-section-label px-4 pt-3 pb-1 text-caption text-medium-emphasis"
        >
            Elemental internals
        </div>
        <v-list nav density="compact" class="pb-0">
            <v-list-item
                v-for="item in elementalItems"
                :key="item.to"
                :to="item.to"
                :prepend-icon="item.icon"
                :title="item.title"
                :subtitle="item.subtitle"
                color="primary"
            />
        </v-list>

        <template #append>
            <div class="pa-3 footer-block" :class="{ 'footer-block--collapsed': isCollapsed }">
                <v-btn
                    variant="text"
                    :size="isCollapsed ? 'small' : 'x-small'"
                    :icon="isCollapsed"
                    :prepend-icon="isCollapsed ? undefined : 'mdi-database-eye-outline'"
                    class="footer-sources-btn mb-2"
                    :aria-label="isCollapsed ? 'Data sources' : undefined"
                    @click="openSourcesDialog"
                >
                    <v-icon v-if="isCollapsed">mdi-database-eye-outline</v-icon>
                    <template v-else>Data sources</template>
                </v-btn>
                <div v-if="!isCollapsed" class="text-caption footer-label">Powered by</div>
                <div v-if="!isCollapsed" class="d-flex align-center mt-1">
                    <img :src="logoSrc" alt="Lovelace" class="footer-logo" />
                </div>
            </div>
        </template>
    </v-navigation-drawer>
</template>

<script setup lang="ts">
    import { useBrandLogo } from '~/composables/useBrandLogo';
    import { useSourcesDialog } from '~/composables/useSourcesDialog';

    const { logoSrc } = useBrandLogo();
    const { openSourcesDialog } = useSourcesDialog();

    const STORAGE_KEY = 'prism-sidebar-collapsed';
    const isCollapsed = ref(false);
    const collapseIcon = computed(() =>
        isCollapsed.value ? 'mdi-chevron-right' : 'mdi-chevron-left'
    );
    const collapseLabel = computed(() =>
        isCollapsed.value ? 'Expand navigation' : 'Collapse navigation'
    );

    function toggleCollapsed() {
        isCollapsed.value = !isCollapsed.value;
    }

    onMounted(() => {
        isCollapsed.value = window.localStorage.getItem(STORAGE_KEY) === 'true';
    });

    watch(isCollapsed, (value) => {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    });

    const workspaceItems = [
        {
            to: '/workspace',
            icon: 'mdi-layers-triple-outline',
            title: 'Workspace',
            subtitle: 'EDD · one book, all renders',
        },
    ];

    const investorItems = [
        {
            to: '/',
            icon: 'mdi-home-account',
            title: 'Overview',
            subtitle: 'All goals at a glance',
        },
        {
            to: '/bucket',
            icon: 'mdi-briefcase-variant-outline',
            title: 'Goal Bucket',
            subtitle: 'Holdings + horizon fit',
        },
        {
            to: '/agents',
            icon: 'mdi-message-question-outline',
            title: 'Ask',
            subtitle: 'Chat with your portfolio',
        },
    ];

    const elementalItems = [
        {
            to: '/relationships',
            icon: 'mdi-graph-outline',
            title: 'Relationships',
            subtitle: 'Connected universe',
        },
        {
            to: '/scoring',
            icon: 'mdi-tune-vertical',
            title: 'Scoring config',
            subtitle: 'Module weights + policy',
        },
    ];
</script>

<style scoped>
    .sidebar-nav {
        background: var(--dynamic-sidebar-bg) !important;
        border-right: 1px solid var(--dynamic-sidebar-border) !important;
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.9);
    }

    .brand-block {
        background: linear-gradient(135deg, rgba(var(--dynamic-primary-rgb), 0.08), transparent);
    }

    .brand-block--collapsed {
        min-height: 88px;
        justify-content: center;
    }

    .brand-copy {
        min-width: 0;
    }

    .brand-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: linear-gradient(135deg, var(--dynamic-primary), var(--dynamic-accent));
        color: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-primary, sans-serif);
        font-weight: 600;
        font-size: 1.1rem;
    }

    .collapse-btn {
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.65) !important;
    }

    .collapse-btn:hover {
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.95) !important;
    }

    .brand-name {
        font-family: var(--font-primary, sans-serif);
        font-size: 1.15rem;
        font-weight: 500;
        letter-spacing: normal;
        color: rgba(var(--dynamic-sidebar-fg-rgb), 1);
    }

    .nav-section-label {
        font-family: var(--font-primary, sans-serif);
        font-size: 10px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .brand-tag {
        font-family: var(--font-primary, sans-serif);
        font-size: var(--type-caption-size);
        font-weight: var(--type-caption-weight);
        letter-spacing: normal;
        text-transform: none;
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.55);
    }

    .footer-block {
        border-top: 1px solid var(--dynamic-sidebar-border);
    }

    .footer-block--collapsed {
        display: flex;
        justify-content: center;
    }

    .footer-label {
        font-family: var(--font-primary);
        font-size: var(--type-caption-size);
        font-weight: var(--type-caption-weight);
        letter-spacing: normal;
        text-transform: none;
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.55);
    }

    .footer-logo {
        height: 0.85rem;
        opacity: 0.5;
    }

    .footer-sources-btn {
        width: 100%;
        justify-content: flex-start;
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.6) !important;
        font-size: var(--type-caption-size);
        letter-spacing: normal;
        text-transform: none;
    }

    .footer-block--collapsed .footer-sources-btn {
        width: auto;
        justify-content: center;
    }

    .footer-sources-btn:hover {
        color: rgba(var(--dynamic-sidebar-fg-rgb), 0.9) !important;
    }
</style>
