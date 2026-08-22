/**
 * Stämplar in commit-hashen i worker/src/version.js vid bygget, så att
 * /health visar vilken version som faktiskt kör.
 *
 * Skriver bara när en CI-hash finns i miljön. Lokala byggen lämnar
 * filen orörd, så `git status` inte blir smutsig av att man byggt.
 */
import { writeFileSync } from 'node:fs';

const commit =
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  '';

if (!commit) {
  console.log('stamp-version: ingen CI-hash i miljön, lämnar version.js orörd');
  process.exit(0);
}

const gren =
  process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || '';

writeFileSync(
  new URL('../worker/src/version.js', import.meta.url),
  `// Genererad av scripts/stamp-version.mjs vid bygget. Redigera inte.\n` +
    `export const VERSION = ${JSON.stringify({
      commit: commit.slice(0, 7),
      gren: gren || null,
      byggd: new Date().toISOString(),
    })};\n`
);
console.log(`stamp-version: ${commit.slice(0, 7)}${gren ? ` (${gren})` : ''}`);
