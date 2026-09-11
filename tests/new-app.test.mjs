// Stamps a real app from template/ with a "//" display name and reads back
// what Tauri will read. Every app in the family is named that way, and until
// __APP_PRODUCT__ existed every one of them had to hand-fix productName before
// its first `tauri dev`, because Tauri refuses the config outright:
//
//   Error `tauri.conf.json` error on `productName`: "BOT//FARM" does not
//   match "^[^/:*?"<>|]+$"
//
// new-app.mjs is a CLI with top-level side effects, so it runs as a child
// process — which is also exactly how anybody else runs it.

import { test, eq, ok } from '../testkit/assert.mjs';
import { readFileSync, readdirSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Tauri's own pattern for productName, from its config schema. The name
// becomes the installer and executable file name, hence the characters
// Windows forbids in a file name.
const TAURI_PRODUCT_NAME = /^[^/:*?"<>|]+$/;

// Anything placeholder-shaped. A template placeholder with no entry in
// replacements() survives stamping verbatim, and "__APP_PRODUCT__" itself
// matches TAURI_PRODUCT_NAME, so the pattern check alone would pass it.
const PLACEHOLDER = /__APP_[A-Z_]+__|__app_[a-z_]+__/;
const BINARY = /\.(png|ico|icns|woff2?|ttf|svg)$/i;

function* files(dir) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) yield* files(p);
        else yield p;
    }
}

export default function () {
    const dir = mkdtempSync(join(tmpdir(), 'magma-kit-new-app-'));
    const app = join(dir, 'card-forge');
    try {
        execFileSync(process.execPath,
            [join(KIT, 'scripts', 'new-app.mjs'), app, '--name', 'CARD//FORGE', '--ns', 'CardForge'],
            { stdio: 'pipe' });
        const conf = JSON.parse(readFileSync(join(app, 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8'));

        test('a "//" name stamps a productName Tauri accepts', () => {
            ok(TAURI_PRODUCT_NAME.test(conf.productName),
                `productName ${JSON.stringify(conf.productName)} must match ${TAURI_PRODUCT_NAME}`);
            eq(conf.productName, 'CARD FORGE', 'productName');
        });

        test('the window title keeps the display name, "//" and all', () => {
            eq(conf.app.windows[0].title, 'CARD//FORGE', 'window title');
        });

        test('no placeholder survives stamping, in any file name or text file', () => {
            const left = [];
            for (const f of files(app)) {
                const rel = relative(app, f);
                if (PLACEHOLDER.test(rel)) left.push(`${rel} (file name)`);
                if (BINARY.test(f)) continue;
                const hit = readFileSync(f, 'utf8').match(PLACEHOLDER);
                if (hit) left.push(`${rel}: ${hit[0]}`);
            }
            eq(left, [], 'unstamped placeholders');
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
