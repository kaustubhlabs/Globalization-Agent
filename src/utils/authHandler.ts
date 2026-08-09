import { Browser, BrowserContext, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

function pickEnv(...keys: string[]): string {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim().length > 0) {
            return value.trim();
        }
    }
    return '';
}

async function resolveFirstVisibleSelector(page: any, selectors: string[], timeoutMs = 8000): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        for (const selector of selectors) {
            const locator = page.locator(selector).first();
            const count = await locator.count();
            if (count > 0 && await locator.isVisible().catch(() => false)) {
                return selector;
            }
        }
        await page.waitForTimeout(150);
    }
    return null;
}

function readMaybeIndirectValue(directKeys: string[], indirectionKeys: string[]): string {
    const direct = pickEnv(...directKeys);
    if (direct) {
        return direct;
    }

    for (const key of indirectionKeys) {
        const maybeVarName = pickEnv(key);
        if (!maybeVarName) {
            continue;
        }

        const resolved = process.env[maybeVarName];
        if (resolved && resolved.trim().length > 0) {
            return resolved.trim();
        }
    }

    return '';
}

async function isProbablyAuthenticated(page: Page): Promise<boolean> {
    const authMarkers = [
        "[data-testid='logout']",
        "button:has-text('Logout')",
        "a:has-text('Logout')",
        "a:has-text('Sign out')",
        "button:has-text('Sign out')",
        '.inventory_list'
    ];

    for (const marker of authMarkers) {
        const locator = page.locator(marker).first();
        if (await locator.count() > 0 && await locator.isVisible().catch(() => false)) {
            return true;
        }
    }

    const url = page.url().toLowerCase();
    return !url.includes('login') && !url.includes('signin') && !url.includes('auth');
}

export async function handleAuthentication(browser: Browser): Promise<BrowserContext> {
    const authType = process.env.AUTH_TYPE || 'NONE';
    if (authType === 'NONE') {
        return await browser.newContext();
    }

    const statePath = path.resolve(process.cwd(), 'storageState.json');
    
    if (fs.existsSync(statePath)) {
        console.log('🤖 Loading cached authentication state...');
        return await browser.newContext({ storageState: statePath });
    }

    console.log('🤖 Authenticating and creating new session state...');
    const context = await browser.newContext();
    const page = await context.newPage();

    const loginUrl = pickEnv('AUTH_LOGIN_URL', 'LOGIN_URL', 'TARGET_URL', 'APP_URL');
    const username = readMaybeIndirectValue(
        ['AUTH_USERNAME', 'LOGIN_USERNAME', 'USERNAME', 'EMAIL', 'AUTH_USERNAME_ENV'],
        ['AUTH_USERNAME_ENV', 'LOGIN_USERNAME_ENV']
    );
    const password = readMaybeIndirectValue(
        ['AUTH_PASSWORD', 'LOGIN_PASSWORD', 'PASSWORD', 'AUTH_PASSWORD_ENV'],
        ['AUTH_PASSWORD_ENV', 'LOGIN_PASSWORD_ENV']
    );

    if (!loginUrl) {
        throw new Error('AUTH_LOGIN_URL (or LOGIN_URL/TARGET_URL/APP_URL) is missing in environment variables.');
    }
    if (!username || !password) {
        throw new Error('Login credentials are missing in env. Set AUTH_USERNAME/AUTH_PASSWORD or *_ENV keys.');
    }

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForLoadState('networkidle').catch(() => undefined);

    if (await isProbablyAuthenticated(page)) {
        await context.storageState({ path: statePath });
        console.log('💾 Existing authenticated state detected and cached.');
        await page.close();
        return context;
    }

    const usernameSelectors = [
        pickEnv('AUTH_SELECTOR_USER', 'LOGIN_SELECTOR_USER'),
        '#username',
        '#user-name',
        "input[name='username']",
        "input[name='email']",
        "input[type='email']",
        "input[autocomplete='username']",
        "input[id*='user' i]",
        "input[id*='email' i]"
    ].filter(Boolean);

    const passwordSelectors = [
        pickEnv('AUTH_SELECTOR_PASS', 'LOGIN_SELECTOR_PASS'),
        '#password',
        "input[name='password']",
        "input[type='password']",
        "input[autocomplete='current-password']",
        "input[id*='pass' i]"
    ].filter(Boolean);

    const submitSelectors = [
        pickEnv('AUTH_SELECTOR_SUBMIT', 'LOGIN_SELECTOR_SUBMIT'),
        "button[type='submit']",
        "input[type='submit']",
        '#login-button',
        "button:has-text('Login')",
        "button:has-text('Sign in')",
        "button:has-text('Log in')"
    ].filter(Boolean);

    const userSelector = await resolveFirstVisibleSelector(page, usernameSelectors);
    const passSelector = await resolveFirstVisibleSelector(page, passwordSelectors);
    if (!userSelector || !passSelector) {
        const availableInputs = await page.locator('input').evaluateAll((els) =>
            els.map((el: any) => ({
                id: el.id || '',
                name: el.name || '',
                type: el.type || '',
                placeholder: el.placeholder || ''
            }))
        );
        throw new Error(
            `Unable to detect login form fields. userSelector=${userSelector || 'none'}, passSelector=${passSelector || 'none'}, inputs=${JSON.stringify(availableInputs)}`
        );
    }

    await page.locator(userSelector).first().waitFor({ state: 'visible', timeout: 10000 });
    await page.locator(passSelector).first().waitFor({ state: 'visible', timeout: 10000 });
    await page.locator(userSelector).first().fill(username);
    await page.locator(passSelector).first().fill(password);

    const submitSelector = await resolveFirstVisibleSelector(page, submitSelectors, 3000);
    if (submitSelector) {
        await Promise.all([
            page.waitForLoadState('networkidle').catch(() => undefined),
            page.locator(submitSelector).first().click()
        ]);
    } else {
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle').catch(() => undefined);
    }

    if (!await isProbablyAuthenticated(page)) {
        throw new Error('Login submit completed, but authenticated state was not detected. Verify selectors and credentials in .env.');
    }

    await context.storageState({ path: statePath });
    console.log('💾 Authentication context successfully cached.');
    await page.close();
    return context;
}
