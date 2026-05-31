/**
 * Shared open-state composable for the SourcesLegendDialog.
 * Any component can call openSourcesDialog() to show the explainer.
 */
import { ref } from 'vue';

const isOpen = ref(false);

export function useSourcesDialog() {
    function openSourcesDialog() {
        isOpen.value = true;
    }

    function closeSourcesDialog() {
        isOpen.value = false;
    }

    return { isOpen, openSourcesDialog, closeSourcesDialog };
}
