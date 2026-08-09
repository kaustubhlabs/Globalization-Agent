import { chromium, Page } from 'playwright';
import * as dotenv from 'dotenv';
import { handleAuthentication } from './utils/authHandler';
import { extractPageSnapshot } from './crawler';
import { logLanguageValidation } from './agentDriver';

dotenv.config();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) {
        return fallback;
    }

    const normalizedValue = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
        return false;
    }

    return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function normalizeWaitStrategy(waitStrategy: string): 'load' | 'domcontentloaded' | 'networkidle' {
    switch (waitStrategy) {
        case 'load':
            return 'load';
        case 'networkidle':
            return 'networkidle';
        default:
            return 'domcontentloaded';
    }
}

async function waitForApplicationReady(page: Page, waitStrategy: string): Promise<void> {
    const normalizedWaitStrategy = normalizeWaitStrategy(waitStrategy);
    await page.waitForLoadState(normalizedWaitStrategy, { timeout: 15000 }).catch(() => undefined);

    if (normalizedWaitStrategy === 'domcontentloaded') {
        await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 }).catch(() => undefined);
    }
}

async function runMultiPageGlobalizationTest() {
    console.log('🚀 Executing Multi-Page Globalization Loop...');

    const headless = parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true);
    const slowMo = parseNumber(process.env.PLAYWRIGHT_SLOW_MO_MS, 0);
    const waitStrategy = (process.env.BROWSER_WAIT_STRATEGY || 'domcontentloaded').trim().toLowerCase();
    const minTextLength = parseNumber(process.env.MIN_TEXT_LENGTH, 3);
    const maxTextLength = parseNumber(process.env.MAX_TEXT_LENGTH, 100);

    const browser = await chromium.launch({ headless, slowMo });

    try {
        const context = await handleAuthentication(browser);
        const page = await context.newPage();

        await page.goto(process.env.TARGET_URL || '', { waitUntil: 'domcontentloaded' });
        await waitForApplicationReady(page, waitStrategy);

        const targetedLanguages = (process.env.SUPPORTED_LANGUAGES || 'English(US)').split(',');

        for (const lang of targetedLanguages) {
            const currentLanguageName = lang.trim();
            console.log(`\n🌐 Testing Application State in Language: [${currentLanguageName.toUpperCase()}]`);

            const switcher = process.env.LANGUAGE_SWITCHER_SELECTOR || 'button[role="combobox"]';

            if (await page.isVisible(switcher)) {
                await page.click(switcher);
                await page.waitForSelector('[role="listbox"], [role="option"]', { state: 'visible', timeout: 8000 });
                const optionPrefix = process.env.LANGUAGE_OPTION_PREFIX || '[role="option"]:has-text';
                const targetLanguageButtonSelector = `${optionPrefix}("${currentLanguageName}")`;
                await page.waitForSelector(targetLanguageButtonSelector, { state: 'visible', timeout: 5000 });
                await page.locator(targetLanguageButtonSelector).first().click({ force: true });
                await waitForApplicationReady(page, waitStrategy);
            }

            const initialSnapshot = await extractPageSnapshot(page, { minTextLength, maxTextLength });
            const safeFileName = currentLanguageName.replace(/[^a-zA-Z0-9]/g, '_');
            logLanguageValidation(initialSnapshot, safeFileName);
        }

    } catch (error) {
        console.error('❌ Automation engine failure:', error);
    } finally {
        console.log('\n🏁 Multi-page validation pass completed.');
        await browser.close();
    }
}

runMultiPageGlobalizationTest();
