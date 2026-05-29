/**
 * Highlight entity names in rendered HTML by wrapping them in styled spans.
 * Used by the Portfolio Summary briefing to link entities to their profiles.
 */

export interface SummaryEntityRef {
    name: string;
    neid?: string | null;
    type?: 'organization' | 'ticker' | string;
}

const ENTITY_COLORS: Record<string, string> = {
    organization: '#42A5F5',
    ticker: '#66BB6A',
    default: '#42A5F5',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttribute(value: string): string {
    return value.replace(/"/g, '&quot;');
}

export function highlightEntitiesInHtml(html: string, entities: SummaryEntityRef[]): string {
    if (!html || entities.length === 0) return html;

    const sorted = [...entities]
        .filter((e) => e.name && e.name.trim().length >= 3)
        .sort((a, b) => b.name.length - a.name.length);

    let highlighted = html;
    for (const entity of sorted) {
        const escapedName = escapeRegExp(entity.name.trim());
        const regex = new RegExp(`(?<!data-entity-name="|class=")\\b(${escapedName})\\b`, 'g');
        const color = ENTITY_COLORS[entity.type || ''] || ENTITY_COLORS.default;
        const href = entity.neid ? `/entity/${entity.neid}` : null;
        const tooltip = `${entity.type || 'entity'}: ${entity.name}`;

        if (href) {
            highlighted = highlighted.replace(
                regex,
                `<a class="entity-highlight" href="${escapeAttribute(href)}" data-entity-name="${escapeAttribute(entity.name)}" title="${escapeAttribute(tooltip)}" style="color: ${color}; border-bottom: 1px dashed ${color}; font-weight: 500; text-decoration: none;">$1</a>`
            );
        } else {
            highlighted = highlighted.replace(
                regex,
                `<span class="entity-highlight" data-entity-name="${escapeAttribute(entity.name)}" title="${escapeAttribute(tooltip)}" style="color: ${color}; border-bottom: 1px dashed ${color}; font-weight: 500; cursor: help;">$1</span>`
            );
        }
    }

    return highlighted;
}
