<template>
    <v-navigation-drawer permanent app width="240" class="sidebar-nav">
        <div class="brand-block d-flex align-center pa-4">
            <div class="brand-icon mr-2">P</div>
            <div>
                <div class="brand-name">Prism</div>
                <div class="brand-tag text-caption text-medium-emphasis">Portfolio risk</div>
            </div>
        </div>
        <v-divider />
        <v-list nav density="compact">
            <v-list-item
                v-for="item in items"
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
                <div class="text-caption text-medium-emphasis">Backed by</div>
                <div class="d-flex align-center mt-1">
                    <img src="/LL-logo-full-wht.svg" alt="Lovelace" class="footer-logo" />
                </div>
            </div>
        </template>
    </v-navigation-drawer>
</template>

<script setup lang="ts">
    const items = [
        {
            to: '/',
            icon: 'mdi-view-dashboard-outline',
            title: 'Portfolio',
            subtitle: 'Ranked entities + scores',
        },
        {
            to: '/relationships',
            icon: 'mdi-graph-outline',
            title: 'Relationships',
            subtitle: 'Connected universe',
        },
        {
            to: '/agents',
            icon: 'mdi-robot-outline',
            title: 'Agents',
            subtitle: 'Pipeline + chat',
        },
    ];
</script>

<style scoped>
    .sidebar-nav {
        background: var(--lv-bg-deeper, #0a0a0a);
        border-right: 1px solid rgba(255, 255, 255, 0.05);
    }

    .brand-block {
        background: linear-gradient(135deg, rgba(63, 234, 0, 0.08), transparent);
    }

    .brand-icon {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        background: linear-gradient(135deg, #3fea00, #003bff);
        color: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-headline, sans-serif);
        font-weight: 600;
        font-size: 1.1rem;
    }

    .brand-name {
        font-family: var(--font-headline, sans-serif);
        font-size: 1.15rem;
        letter-spacing: 0.05em;
    }

    .brand-tag {
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .footer-block {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .footer-logo {
        height: 0.85rem;
        opacity: 0.5;
    }
</style>
