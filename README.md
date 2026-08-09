# Globalization Agent

An intent-driven QA automation agent that validates the globalization and internationalization (i18n) coverage of any web application. It crawls a target application across all configured locales, extracts visible text, and produces per-language JSON reports that can be reviewed for untranslated strings, locale text leakage, and hardcoded English content.

---

## How It Works

1. **Authenticates** into the target application using stored session state or a FORM login flow.
2. **Iterates** through every language in `SUPPORTED_LANGUAGES`, switching the application locale via a configurable UI combobox selector.
3. **Crawls** the page after each locale switch, extracting all visible text nodes and interactive element labels.
4. **Writes** one JSON report per language to `globalization-output/`, filtering out any brand terms or domains declared in `BRAND_EXCLUSIONS`.

---

## Project Structure

```
├── src/
│   ├── index.ts          # Entry point — orchestrates the locale loop
│   ├── crawler.ts        # Page snapshot extractor (visible text + interactive elements)
│   ├── agentDriver.ts    # Report builder and output writer
│   └── utils/
│       └── authHandler.ts # Authentication engine (FORM, SSO, storageState)
├── skills/
│   ├── AUTH.md           # Authentication strategy documentation
│   ├── CRAWL.md          # Crawl map strategy documentation
│   ├── TRANSLATE.md      # Globalization validation rules
│   └── TEST_GEN.md       # Test generation strategy documentation
├── prompts/
│   └── language_prompts.txt  # Reusable prompt for report analysis
├── globalization-output/ # Generated per-language JSON reports (git-ignored)
├── .env                  # Local environment configuration (git-ignored)
├── .env.example          # Configuration template
└── storageState.json     # Cached browser auth state (git-ignored)
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

---

## Setup

```bash
npm run setup-agent
```

This installs all dependencies and downloads the required Playwright browser binaries.

---

## Configuration

Copy `.env.example` to `.env` and fill in the values for your target application. No credentials should ever be committed — `.env` is git-ignored.

```env
# Target application
TARGET_URL=https://your-app.example.com/

# Comma-separated list of language names exactly as they appear in the app's language switcher
SUPPORTED_LANGUAGES=English(US),Español(Spain),Deutsch(Germany)

DEFAULT_LANGUAGE=English(US)

# Authentication — set to NONE to skip login
AUTH_TYPE=FORM
AUTH_LOGIN_URL=https://your-app.example.com/login
AUTH_USERNAME_ENV=
AUTH_PASSWORD_ENV=

# Optional: override the selectors used to fill the login form
AUTH_SELECTOR_USER=
AUTH_SELECTOR_PASS=
AUTH_SELECTOR_SUBMIT=

# Selectors for the language switcher UI component
LANGUAGE_SWITCHER_SELECTOR=button[role="combobox"]
LANGUAGE_OPTION_PREFIX=[role="option"]:has-text

# Comma-separated exact strings excluded from translation validation
# Use this for brand names, domains, and technical acronyms that must not be translated
BRAND_EXCLUSIONS=YourBrand.com,SSO

# Browser runtime tuning (defaults are optimized for speed)
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_SLOW_MO_MS=0
BROWSER_WAIT_STRATEGY=domcontentloaded
MIN_TEXT_LENGTH=3
MAX_TEXT_LENGTH=100
MAX_REPORTED_TEXTS=80
```

### Auth Types

| `AUTH_TYPE` | Behaviour |
|---|---|
| `NONE` | Skips authentication entirely |
| `FORM` | Fills username/password fields and submits. Caches session to `storageState.json` on first run. |

---

## Running the Agent

```bash
npm run run-agent
```

On first run with `AUTH_TYPE=FORM`, the browser will authenticate and cache the session state. Subsequent runs reuse the cached state automatically.

### Performance tuning
The agent now exposes a few settings to make runs faster or easier to debug without changing code:

- `PLAYWRIGHT_HEADLESS=true` keeps the run headless by default for faster execution.
- `PLAYWRIGHT_SLOW_MO_MS=0` disables artificial slowing; increase it only when debugging UI interactions.
- `BROWSER_WAIT_STRATEGY=domcontentloaded` uses a lighter wait strategy than `networkidle` for most apps.
- `MIN_TEXT_LENGTH` and `MAX_TEXT_LENGTH` control how much text is captured from the DOM.
- `MAX_REPORTED_TEXTS` limits the number of sample strings written into each report to reduce file size and downstream token usage.

---

## Output

Reports are written to `globalization-output/` — one file per language:

```
globalization-output/
├── globalization_report_English_US_.json
├── globalization_report_Deutsch_Germany_.json
├── globalization_report_Espa_ol_Spain_.json
└── ...
```

Each report contains:

```json
{
  "language": "Deutsch_Germany_",
  "url": "https://your-app.example.com/",
  "totalTextBlocksEvaluated": 21,
  "sampleTextCaptured": [
    "Kundenanmeldung",
    "Benutzer-ID",
    ...
  ]
}
```

`totalTextBlocksEvaluated` reflects the count **after** brand exclusions are applied. The report also stores a compact sample of the most relevant strings to keep file size and token usage lower while still retaining useful validation data.

---

## Validating Reports

Use the prompt in `prompts/language_prompts.txt` with GitHub Copilot (or any AI assistant with access to the workspace) to analyse the generated JSON files against the validation rules in `skills/TRANSLATE.md`.

The validation checks for:

- **Untranslated content** — visible strings that remain in English when a non-English locale is active
- **Locale text leakage** — a locale receiving the string bundle of a different locale (e.g. PT-PT serving PT-BR strings)
- **Hardcoded English loanwords** — navigation labels or UI text that use English words instead of native equivalents
- **Mixed-language corruption** — sentences combining target-language text with English fragments

---

## Adding a New Language

1. Add the language name to `SUPPORTED_LANGUAGES` in `.env`, exactly matching the label shown in the application's language switcher UI.
2. Re-run `npm run run-agent`.
3. A new JSON report will appear in `globalization-output/`.

---

## License

See [LICENSE](LICENSE).
