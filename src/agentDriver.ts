import * as fs from 'fs';
import * as path from 'path';
import { PageSnapshot } from './crawler';

export interface GlobalizationReport {
    language: string;
    url: string;
    totalTextBlocksEvaluated: number;
    sampleTextCaptured: string[];
}

// Dedicated central output directory definition
const OUTPUT_DIR = path.join(__dirname, '../globalization-output');

// Ensure the target folder exists at runtime
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const accumulatedSnapshots: { [lang: string]: PageSnapshot } = {};

// Exact-match terms that are never subject to translation (brands, domains, acronyms)
const brandExclusions: string[] = (process.env.BRAND_EXCLUSIONS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

function isExcluded(text: string): boolean {
    return brandExclusions.some(term => text === term);
}

export function limitTextSamples(texts: string[], maxItems: number = 80): string[] {
    const seen = new Set<string>();
    const limited: string[] = [];

    for (const text of texts) {
        if (limited.length >= maxItems) {
            break;
        }

        if (seen.has(text)) {
            continue;
        }

        seen.add(text);
        limited.push(text);
    }

    return limited;
}

export function logLanguageValidation(snapshot: PageSnapshot, currentLang: string): void {
    accumulatedSnapshots[currentLang] = snapshot;

    const filteredElements = snapshot.visibleTextElements
        .filter(t => !isExcluded(t))
        .map(t => t.trim());
    const maxReportedTexts = Number(process.env.MAX_REPORTED_TEXTS || 80);

    // Save language JSONs directly to the dedicated output folder
    const reportPath = path.join(OUTPUT_DIR, `globalization_report_${currentLang}.json`);
    const report: GlobalizationReport = {
        language: currentLang,
        url: snapshot.url,
        totalTextBlocksEvaluated: filteredElements.length,
        sampleTextCaptured: limitTextSamples(filteredElements, Number.isFinite(maxReportedTexts) ? maxReportedTexts : 80)
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`💾 Translation map saved for [${currentLang.toUpperCase()}]: ${reportPath}`);
}


