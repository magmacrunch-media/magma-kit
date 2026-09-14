// The kit's AGENTS.md and template/AGENTS.md carry the same git instruction,
// and they drifted apart for nine days. The kit's was corrected on 2026-09-04
// — one-word `magmacrunchmedia`, and do not set `user.name`/`user.email` per
// repo, because a local override is exactly what was cleared that day. The
// template kept the old spaced spelling, so every app stamped after that date
// shipped an instruction the kit itself says not to follow; `apps/bot-farm`
// and `apps/font-litho` both had it, and following it would mean re-adding the
// override that was deliberately removed.
//
// copyTree() in new-app.mjs stamps AGENTS.md verbatim (it holds no
// placeholders), so checking template/ is checking what every new app gets.
//
// The rules below run against BOTH files, from one list. That is the point: a
// rule added for one is a rule for the other, which is what "they cannot drift
// again" has to mean — two independently written assertions drift as readily
// as the two independently written documents did.

import { test, eq, ok } from '../testkit/assert.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

// `## Git` through the next `##` heading, or end of file.
function gitSection(path) {
    const md = readFileSync(path, 'utf8');
    const start = md.search(/^## Git$/m);
    if (start < 0) return null;
    const rest = md.slice(start);
    const end = rest.slice(1).search(/^## /m);
    return end < 0 ? rest : rest.slice(0, end + 1);
}

// Matched against the section with all whitespace collapsed, so a rule does
// not depend on where a sentence happens to wrap.
const RULES = [
    {
        what: 'names the one-word commit identity',
        must: /Commit as magmacrunchmedia <magmacrunchmedia@gmail\.com>/,
    },
    {
        what: 'does not spell the commit identity `magmacrunch media`',
        mustNot: /magmacrunch media\s*</,
        why: 'that spelling came from a local user.name override, cleared 2026-09-04',
    },
    {
        what: 'forbids a per-repo user.name / user.email',
        must: /[Dd]o not set `user\.name` or `user\.email` per repo/,
    },
    {
        what: 'says the spaced spelling survives in package metadata on purpose',
        must: /package metadata/,
        why: 'otherwise the rule above reads as licence to sweep it out of Cargo.toml',
    },
    { what: 'refuses AI attribution', must: /No AI attribution/ },
];

const FILES = {
    'AGENTS.md': join(KIT, 'AGENTS.md'),
    'template/AGENTS.md': join(KIT, 'template', 'AGENTS.md'),
};

export default function () {
    for (const [label, path] of Object.entries(FILES)) {
        const section = gitSection(path);

        test(`${label} has a Git section`, () => {
            ok(section, `no "## Git" heading in ${label}`);
        });
        if (!section) continue;

        const flat = section.replace(/\s+/g, ' ');
        for (const rule of RULES) {
            test(`${label} ${rule.what}`, () => {
                const hit = (rule.must || rule.mustNot).test(flat);
                ok(rule.must ? hit : !hit,
                    `${label}: ${rule.what}${rule.why ? ` — ${rule.why}` : ''}`);
            });
        }
    }

    // The other half of the same instruction, and the half a careless fix
    // breaks: `authors` and `publisher`/`copyright` are package metadata, not
    // an identity, and are spelled with the space deliberately. A sweep that
    // "finished the job" of the 2026-09-04 correction would rewrite these.
    test('template package metadata keeps the spaced `magmacrunch media`', () => {
        const cargo = readFileSync(
            join(KIT, 'template', 'desktop', 'src-tauri', 'Cargo.toml'), 'utf8');
        ok(/^authors = \["magmacrunch media"\]$/m.test(cargo),
            'template Cargo.toml authors');

        const conf = JSON.parse(readFileSync(
            join(KIT, 'template', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8'));
        eq(conf.bundle.publisher, 'magmacrunch media LLC', 'publisher');
        ok(/magmacrunch media/.test(conf.bundle.copyright),
            `copyright ${JSON.stringify(conf.bundle.copyright)}`);
    });
}
