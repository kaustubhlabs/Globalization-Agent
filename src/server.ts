import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { chromium } from 'playwright';
import { handleAuthentication } from './utils/authHandler';
import { extractPageSnapshot } from './crawler';
import { logLanguageValidation, initializeOutputDirectory } from './agentDriver';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

dotenv.config();

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalLanguageLabel(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

async function openLanguageDropdown(page: import('playwright').Page): Promise<boolean> {
    const configuredSelector = process.env.LANGUAGE_SWITCHER_SELECTOR || 'button[role="combobox"]';
    const selectorCandidates = [
        configuredSelector,
        'button[role="combobox"]',
        '[role="combobox"]',
        'button[aria-haspopup="listbox"]',
        '[data-radix-collection-trigger]',
        'button[aria-expanded]'
    ];

    let switcher: import('playwright').Locator | null = null;

    for (const selector of selectorCandidates) {
        const candidate = page.locator(selector).first();
        if ((await candidate.count()) === 0) {
            continue;
        }

        const visible = await candidate.isVisible().catch(() => false);
        if (visible) {
            switcher = candidate;
            break;
        }
    }

    if (!switcher) {
        return false;
    }

    await switcher.scrollIntoViewIfNeeded();

    const expanded = (await switcher.getAttribute('aria-expanded')) === 'true';
    if (!expanded) {
        try {
            await switcher.click({ timeout: 3000 });
        } catch {
            await switcher.click({ force: true, timeout: 3000 });
        }

        const expandedAfterClick = (await switcher.getAttribute('aria-expanded')) === 'true';
        if (!expandedAfterClick) {
            await switcher.focus();
            await switcher.press('ArrowDown');
        }
    }

    await page.waitForSelector('[role="listbox"], [role="option"], [role="menu"], [role="menuitem"]', {
        state: 'visible',
        timeout: 5000
    }).catch(() => undefined);

    return true;
}

async function selectLanguageOption(page: import('playwright').Page, targetLanguage: string): Promise<boolean> {
    const optionPrefix = process.env.LANGUAGE_OPTION_PREFIX || '[role="option"]:has-text';
    const selectorTarget = `${optionPrefix}("${targetLanguage.replace(/"/g, '\\"')}")`;

    if (await page.locator(selectorTarget).first().isVisible().catch(() => false)) {
        const directOption = page.locator(selectorTarget).first();
        try {
            await directOption.click({ timeout: 3000 });
        } catch {
            await directOption.click({ force: true, timeout: 3000 });
        }
        return true;
    }

    const normalizedTarget = canonicalLanguageLabel(targetLanguage);

    const roleOptions = page.getByRole('option');
    const fallbackOptions = page.locator('[role="menuitem"], [role="menuitemradio"], [data-radix-collection-item], [role="treeitem"]');

    let candidates = roleOptions;
    if ((await roleOptions.count()) === 0) {
        candidates = fallbackOptions;
    }

    if ((await candidates.count()) === 0) {
        return false;
    }

    await candidates.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

    const candidateCount = await candidates.count();
    let matchedIndex = -1;

    for (let idx = 0; idx < candidateCount; idx++) {
        const optionText = (await candidates.nth(idx).innerText()).trim();
        const normalizedOptionText = canonicalLanguageLabel(optionText);
        if (
            normalizedOptionText === normalizedTarget ||
            normalizedOptionText.includes(normalizedTarget) ||
            normalizedTarget.includes(normalizedOptionText)
        ) {
            matchedIndex = idx;
            break;
        }
    }

    if (matchedIndex >= 0) {
        const matchedOption = candidates.nth(matchedIndex);
        try {
            await matchedOption.click({ timeout: 3000 });
        } catch {
            await matchedOption.click({ force: true, timeout: 3000 });
        }
        return true;
    }

    const regexFallback = page.getByRole('option', {
        name: new RegExp(escapeRegex(targetLanguage), 'i')
    }).first();

    await regexFallback.waitFor({ state: 'visible', timeout: 3000 });
    try {
        await regexFallback.click({ timeout: 3000 });
    } catch {
        await regexFallback.click({ force: true, timeout: 3000 });
    }

    return true;
}

// CRITICAL FIX: Serve files directly from the absolute src/public path root
app.use(express.static(path.join(__dirname, '../src/public')));

io.on('connection', (socket) => {
    console.log('🔌 Browser client context connected to automation bridge.');

    socket.on('start_test', async (config) => {
        process.env.TARGET_URL = config.url;
        process.env.SUPPORTED_LANGUAGES = config.languages;
        process.env.APPLICATION_VERSION = config.version;

        try {
            socket.emit('progress', { percent: 10, status: "Purging and initializing workspace dirs..." });
            initializeOutputDirectory();

            socket.emit('progress', { percent: 20, status: "Launching headless browser workspace..." });
            const browser = await chromium.launch({ headless: true });
            
            socket.emit('progress', { percent: 35, status: "Processing active credentials validation..." });
            const context = await handleAuthentication(browser);
            const page = await context.newPage();
            
            await page.goto(process.env.TARGET_URL || '');
            await page.waitForLoadState('networkidle');

            const targetedLanguages = config.languages.split(',').map((l: string) => l.trim());
            const totalLanguages = targetedLanguages.length;

            const appVersion = process.env.APPLICATION_VERSION || 'v1.0.0';
            const versionOutputDir = path.join(__dirname, '../globalization-output', appVersion);

            for (let i = 0; i < totalLanguages; i++) {
                const currentLanguageName = targetedLanguages[i];
                const languagePercentageBase = 40 + Math.round(((i + 1) / totalLanguages) * 55);
                
                socket.emit('progress', { percent: languagePercentageBase, status: `Evaluating text layers for: ${currentLanguageName}` });

                const canOpenLanguageDropdown = await openLanguageDropdown(page);
                if (!canOpenLanguageDropdown) {
                    if (i !== 0) {
                        throw new Error(`Language switcher not found on ${page.url()}. Check LANGUAGE_SWITCHER_SELECTOR in .env.`);
                    }
                } else {
                    const didSelectLanguage = await selectLanguageOption(page, currentLanguageName);
                    if (!didSelectLanguage) {
                        throw new Error(`Could not locate language option "${currentLanguageName}". Check LANGUAGE_OPTION_PREFIX in .env or language label formatting.`);
                    }
                }

                await page.waitForTimeout(1000);
                await page.waitForLoadState('networkidle');
                
                const initialSnapshot = await extractPageSnapshot(page);
                const safeFileName = currentLanguageName.replace(/[^a-zA-Z0-9]/g, '_');
                logLanguageValidation(initialSnapshot, safeFileName);
            }

            socket.emit('progress', { percent: 100, status: "Assessment run finalized successfully." });
            
            socket.emit('complete', {
                path: versionOutputDir,
                reportContent: `✅ Snapshots generated successfully! All JSON target baseline files for these languages have been stored in: ${versionOutputDir}\n\nReady for GitHub Copilot Chat analysis.`
            });

            await browser.close();

        } catch (error: any) {
            console.error(error);
            socket.emit('progress', { percent: 100, status: `❌ Run aborted: ${error.message}` });
        }
    });
});

const PORT = 4000;
httpServer.listen(PORT, () => {
    console.log(`\n🚀 Assistant active in your browser! Access dashboard here: http://localhost:${PORT}`);
});
