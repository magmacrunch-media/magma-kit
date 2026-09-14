#!/usr/bin/env node
// Dependency-free test runner for the kit. `node tests/run.mjs`.

import { results } from '../testkit/assert.mjs';

const suites = [
    './keys.test.mjs',
    './history.test.mjs',
    './prefs.test.mjs',
    './modal.test.mjs',
    './dom.test.mjs', './artstore.test.mjs', './menu.test.mjs',
    './boot.test.mjs',
    './bridge-core.test.mjs',
    './harness.test.mjs',
    './versions.test.mjs',
    './sync.test.mjs',
    './kit-integrity.test.mjs',
    './new-app.test.mjs',
    './agents-git.test.mjs',
    // Last, and the only suite that reaches outside this repo: it asks whether
    // the apps vendoring this kit still hold the current copy. Consumers that
    // are not checked out are skipped, not failed.
    './consumers.test.mjs',
];

// Awaited: an async suite that is merely called reports zero passes and zero
// failures, which looks exactly like a suite that is fine.
//
// And bounded: a promise that never settles produces no output at all, which
// is the least useful failure there is. A deadline turns it into a named one.
for (const s of suites) {
    await Promise.race([
        (async () => (await import(s)).default())(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${s} did not finish in 30s — a promise never settled`)), 30_000)
                .unref()),
    ]);
}

console.log(`${results.pass} passed, ${results.fail} failed`);
if (results.fail) {
    console.log('\n' + results.fails.map((f) => '  FAIL ' + f).join('\n\n'));
    process.exit(1);
}
