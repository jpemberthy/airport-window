import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const seen = new Set();
const entries = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isSymbolicLink() ||
      entry.name === '.bin' ||
      entry.name === '.cache'
    )
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (
      /^(licen[cs]e|copying|third.party.licen[cs]es)(\.|$)/i.test(entry.name)
    ) {
      const content = readFileSync(path, 'utf8')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+$/gm, '')
        .trimEnd();
      const hash = createHash('sha256').update(content).digest('hex');
      if (seen.has(hash)) continue;
      seen.add(hash);
      entries.push(`--- ${path} ---\n${content}`);
    }
  }
}
walk('node_modules');
mkdirSync('public/licenses', { recursive: true });
writeFileSync(
  'public/licenses/dependencies.txt',
  'Dependency license texts collected from the installed lockfile. Includes build and test tooling.\n' +
    entries.sort((a, b) => a.localeCompare(b)).join('\n\n') + '\n',
);
console.log(`Collected ${entries.length} distinct dependency notices.`);
