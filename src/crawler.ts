import { Page } from 'playwright';

export interface PageSnapshot {
    url: string;
    interactiveElements: any[];
    visibleTextElements: string[];
}

function normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

export async function extractPageSnapshot(
    page: Page,
    options?: { minTextLength?: number; maxTextLength?: number }
): Promise<PageSnapshot> {
    const minTextLength = options?.minTextLength ?? 3;
    const maxTextLength = options?.maxTextLength ?? 100;

    console.log(`🔍 Mapping page assets & text for: ${page.url()}`);

    return await page.evaluate(({ minTextLength, maxTextLength }) => {
        const normalizeTextInBrowser = (text: string): string => text.replace(/\s+/g, ' ').trim();

        const elements = document.querySelectorAll('a, button, input, [role="button"], .inventory_item_name, .inventory_item_desc');
        const interactive = Array.from(elements).map((el, index) => ({
            id: index + 1,
            tagName: el.tagName.toLowerCase(),
            text: normalizeTextInBrowser(el.textContent || '').substring(0, 50),
            selector: el.id ? `#${el.id}` : el.className ? `.${el.className.trim().split(/\s+/)[0]}` : el.tagName.toLowerCase()
        }));

        const textElements: string[] = [];
        const seenTexts = new Set<string>();
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node: Node | null;
        while ((node = walk.nextNode())) {
            const rawText = node.textContent || '';
            const text = normalizeTextInBrowser(rawText);
            const parent = node.parentElement;

            if (!parent || text.length < minTextLength) {
                continue;
            }

            const tagName = parent.tagName.toUpperCase();
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tagName) || parent.closest('script, style, noscript')) {
                continue;
            }

            if (parent.getAttribute('aria-hidden') === 'true') {
                continue;
            }

            const limitedText = text.substring(0, maxTextLength);
            if (!seenTexts.has(limitedText)) {
                seenTexts.add(limitedText);
                textElements.push(limitedText);
            }
        }

        return {
            url: window.location.href,
            interactiveElements: interactive,
            visibleTextElements: textElements
        };
    }, { minTextLength, maxTextLength });
}
