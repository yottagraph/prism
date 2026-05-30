<template>
    <v-navigation-drawer permanent app width="240" class="sidebar-nav">
        <div class="brand-block d-flex align-center pa-4">
            <div class="brand-icon mr-2">P</div>
            <div>
                <div class="brand-name">Prism</div>
                <div class="brand-tag text-caption">Goals-based investing</div>
            </div>
        </div>
        <v-divider />

        <!-- Primary investor path -->
        <div class="nav-section-label px-4 pt-3 pb-1 text-caption text-medium-emphasis">
            Investor
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

        <!-- Under-the-hood / Elemental section -->
        <div class="nav-section-label px-4 pt-3 pb-1 text-caption text-medium-emphasis">
            Built on Elemental
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
            <div class="pa-3 footer-block">
                <div class="text-caption footer-label">Powered by</div>
                <div class="d-flex align-center mt-1">
                    <img :src="logoSrc" alt="Lovelace" class="footer-logo" />
                </div>
            </div>
        </template>
    </v-navigation-drawer>
</template>

<script setup lang="ts">
    import { useBrandLogo } from '~/composables/useBrandLogo';

    const { logoSrc } = useBrandLogo();

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
            subtitle: 'Weights + thresholds',
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
</style>
