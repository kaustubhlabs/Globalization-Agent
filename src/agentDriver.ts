import * as fs from 'fs';
import * as path from 'path';
import { PageSnapshot } from './crawler';

export interface GlobalizationReport {
    language: string;
    url: string;
    totalTextBlocksEvaluated: number;
    sampleTextCaptured: string[];
}

const appVersion = process.env.APPLICATION_VERSION || 'v1.0.0';
const BASE_OUTPUT_DIR = path.join(__dirname, '../globalization-output');
const VERSION_OUTPUT_DIR = path.join(BASE_OUTPUT_DIR, appVersion);
const outputMode = process.env.VERSION_OUTPUT_MODE || 'WIPE_VERSION';

export function initializeOutputDirectory(): void {
    if (outputMode === 'WIPE_VERSION' && fs.existsSync(VERSION_OUTPUT_DIR)) {
        console.log(`🧹 Wiping out previous output matrix folder for version: ${appVersion}`);
        fs.rmSync(VERSION_OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(VERSION_OUTPUT_DIR, { recursive: true });
}

export function logLanguageValidation(snapshot: PageSnapshot, currentLang: string): void {
    const timestamp = outputMode === 'PRESERVE_VERSION' ? `${Date.now()}_` : '';
    const reportPath = path.join(VERSION_OUTPUT_DIR, `${timestamp}globalization_report_${currentLang}.json`);
    
    const report: GlobalizationReport = {
        language: currentLang,
        url: snapshot.url,
        totalTextBlocksEvaluated: snapshot.visibleTextElements.length,
        sampleTextCaptured: snapshot.visibleTextElements
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
