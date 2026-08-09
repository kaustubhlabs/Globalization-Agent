# Skill: Language Validation Strategy

## Core Objectives
1. Read the `SUPPORTED_LANGUAGES` array dynamically from the runtime environment.
2. Evaluate text extraction arrays to find globalization issues, localization errors, and layout bugs.

## Text Translation Validation Rules
* **Untranslated Content Detection:** Scan all visible text strings for alphanumeric English phrases that should be translated into the target language.
* **Hardcoded String Identification:** Flag brand terms, navigation labels, placeholder text, or error banners that remain locked in English.
* **Mixed-Language Corruption:** Identify sentences where a target language string is mixed with English fragments.

## Layout & Visual Defect Rules
* **Component Clipping:** Detect text truncation, ellipses (`...`), or characters hidden behind component borders due to word length differences.
* **Broken Text-Wraps:** Flag single words unexpectedly forced onto two lines or button containers broken by extended text elements.
* **Directional Layout Shifts:** Ensure numerical parameters, currency markers, and dates adjust cleanly to localized formatting rules.
