#!/usr/bin/env node
// new-app.mjs — stamp out a new app from template/.
//
//   node scripts/new-app.mjs ../my-app --name "MY//APP" --ns MyApp
//   node scripts/new-app.mjs ../my-app --name "MY//APP" --ns MyApp --from ../sprite-forge
//
// Copies the template, replaces six placeholders, syncs the kit, and — given
// --from — carries the chrome across from an existing app so the result builds
// and runs on the first try rather than after a six-step checklist.
//
// The three donated directories are the three the template deliberately does
// not carry its own copies of:
//
//   app/shell/                    vendored chrome; the website repo is upstream
//   app/fonts/                    self-hosted faces the CSP requires
//   desktop/src-tauri/icons/      tauri-build REFUSES TO BUILD without these
//
// That last one is why this flag exists. A stamped app with no icons does not
// fail with a checklist reminder, it fails inside tauri-build, which is a bad
// first five minutes with a new tool.
//
// app/shell/fonts.css travels cleanly because every app in this family puts
// shell/ and fonts/ as siblings under app/, so its `url('../fonts/...')`
// resolves the same everywhere. That is the one path assumption in the shell
// (see website/ware/shell/README.md), and copying between two apps at equal
// depth does not disturb it. Verify it if the layout ever changes.
//
// Placeholders:
//   __APP_NAME__       display name, e.g. "CARD//FORGE"
//   __APP_PRODUCT__    Tauri productName, e.g. "CARD FORGE" (see productName)
//   __APP_NS__         JS namespace, e.g. CardForge
//   __app_slug__       kebab id, e.g. card-forge (crate name, bundle id, log)
//   __app_snake__      snake id, e.g. card_forge (Rust lib name)
//   __APP_ENV_PREFIX__ shouty snake, e.g. CARD_FORGE (env overrides)

import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { sync } from './sync.mjs';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(KIT, 'template');

// What --from carries across, and whether the app is unusable without it.
const DONATED = [
    { path: join('app', 'shell'), what: 'chrome', fatal: false },
    { path: join('app', 'fonts'), what: 'typefaces', fatal: false },
    { path: join('desktop', 'src-tauri', 'icons'), what: 'icons', fatal: true },
];

// Files copied byte-for-byte: a placeholder inside one would be data, not a
// name to stamp.
const BINARY = /\.(png|ico|icns|woff2?|ttf|svg)$/i;

// Tauri validates productName against ^[^/:*?"<>|]+$ and refuses the whole
// config otherwise, because the name becomes the installer and executable
// file name. So the "//" in a display name has to go: CARD//FORGE ships as
// CARD FORGE. Every app stamped before this placeholder existed made that
// edit by hand after stamping. Any run of forbidden characters becomes one
// space, which for the family's "//" names is exactly that edit. The window
// title and descriptions are not validated and keep __APP_NAME__.
function productName(name) {
    return name.replace(/[/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function replacements(name, ns) {
    const slug = ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return {
        __APP_NAME__: name,
        __APP_PRODUCT__: productName(name),
        __APP_NS__: ns,
        __app_slug__: slug,
        __app_snake__: slug.replaceAll('-', '_'),
        __APP_ENV_PREFIX__: slug.replaceAll('-', '_').toUpperCase(),
    };
}

function stamp(text, subs) {
    let out = text;
    for (const [from, to] of Object.entries(subs)) out = out.replaceAll(from, to);
    return out;
}

function copyTree(from, to, subs) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
        const src = join(from, entry);
        const dest = join(to, stamp(entry, subs));
        if (statSync(src).isDirectory()) { copyTree(src, dest, subs); continue; }
        if (BINARY.test(entry)) { writeFileSync(dest, readFileSync(src)); continue; }
        writeFileSync(dest, stamp(readFileSync(src, 'utf8'), subs));
    }
}

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i]] = argv[++i];
    else positional.push(argv[i]);
}
const target = positional[0];
const flag = (f) => flags[f] || null;

if (!target) {
    console.error('usage: new-app.mjs <dir> --name "MY//APP" --ns MyApp [--from ../donor-app]');
    process.exit(2);
}

const root = resolve(target);
const ns = flag('--ns') || basename(root).replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const name = flag('--name') || basename(root).toUpperCase();

if (existsSync(root) && readdirSync(root).length) {
    console.error(`${root} exists and is not empty — refusing to stamp over it`);
    process.exit(1);
}

if (!productName(name)) {
    console.error(`--name ${JSON.stringify(name)} leaves no product name once / : * ? " < > | are removed`);
    process.exit(1);
}

const donor = flag('--from') ? resolve(flag('--from')) : null;
if (donor && !existsSync(donor)) {
    console.error(`--from ${donor} does not exist`);
    process.exit(1);
}

const subs = replacements(name, ns);
copyTree(TEMPLATE, root, subs);
const n = sync(root);

console.log(`stamped ${name} (${ns}) into ${root}`);
console.log(`synced ${n} kit files`);

// Carry the chrome across, and be loud about anything the donor turned out not
// to have — a silently missing icons/ is a build failure several minutes later,
// somewhere that does not mention this script.
const outstanding = [];
if (donor) {
    for (const { path, what, fatal } of DONATED) {
        const from = join(donor, path);
        if (!existsSync(from)) {
            outstanding.push({ path, what, fatal });
            continue;
        }
        cpSync(from, join(root, path), { recursive: true });
        console.log(`copied ${path} (${what}) from ${basename(donor)}`);
    }
} else {
    outstanding.push(...DONATED);
}

console.log('');
if (outstanding.length) {
    console.log('STILL NEEDED:');
    for (const { path, what, fatal } of outstanding) {
        console.log(`  ${path} — ${what}${fatal ? '   ** the Rust build FAILS without this **' : ''}`);
    }
    if (!donor) console.log('  (or re-stamp with --from ../sprite-forge to copy all three)');
    console.log('');
}

console.log('Next:');
console.log(`  cd ${target}`);
console.log('  npm install && (cd desktop && npm install)');
console.log('  npm run check');
console.log('  cd desktop && npm run dev');
console.log('  git init  # then a first commit');
console.log('');
console.log(`Add "${target}" to magma-kit/consumers.json so the kit's own tests`);
console.log('keep this app in sync when a kit file changes.');
