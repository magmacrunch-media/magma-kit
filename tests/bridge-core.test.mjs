// bridge-core.js under test.
//
// It had no suite until the options passthrough went in, which is its own small
// lesson: this is the file every consumer's every backend call goes through,
// and the one that rides a Tauri internal on purpose. A recording
// __TAURI_INTERNALS__ is the whole of what it takes.
//
// What is asserted here is the SHAPE of the call handed to Tauri, because that
// shape is load-bearing in ways a consumer cannot see: whether a payload
// arrives as JSON or as a raw body depends on it, and so does whether a
// command's other arguments arrive at all.

import { test, eq, ok } from '../testkit/assert.mjs';
import { kitSandbox } from './load.mjs';

/** A fake Tauri that records rather than invokes. */
function bridgeWorld(opts = {}) {
    const calls = [];
    const listeners = [];
    const classes = [];
    // A closure, not a property on `globals`: baseSandbox spreads that object
    // into the context, so what the sandbox gets is a copy and a later
    // assignment to it is invisible there.
    let registered = null;
    const globals = {
        document: {
            documentElement: { classList: { add: (c) => classes.push(c) } },
            addEventListener: (type, fn) => listeners.push({ type, fn }),
        },
    };
    if (!opts.noInternals) {
        globals.__TAURI_INTERNALS__ = {
            invoke: (cmd, payload, options) => {
                calls.push({ cmd, payload, options });
                return Promise.resolve('ok');
            },
            transformCallback: (fn) => { registered = fn; return 77; },
        };
    }
    const sandbox = kitSandbox(['bridge-core.js'], globals);
    return {
        sandbox, calls, listeners, classes,
        tauri: sandbox.MagmaKit.tauri,
        /** Play the backend emitting an event to whatever on() registered. */
        emit: (envelope) => registered(envelope),
    };
}

export default function () {
    // ── the feature switch ───────────────────────────────────

    test('no Tauri means no MagmaKit.tauri, which is the whole switch', () => {
        const w = bridgeWorld({ noInternals: true });
        eq(w.tauri, undefined, 'the object is absent, not a stub that throws later');
        eq(w.classes, [], 'and nothing claimed the page is a desktop build');
    });

    test('a Tauri that cannot invoke is treated as no Tauri', () => {
        const sandbox = kitSandbox(['bridge-core.js'], {
            document: { documentElement: { classList: { add: () => {} } } },
            __TAURI_INTERNALS__: { invoke: 'not a function' },
        });
        eq(sandbox.MagmaKit.tauri, undefined, 'the shape is checked, not just the presence');
    });

    test('the desktop build says so on <html>', () => {
        eq(bridgeWorld().classes, ['desktop'], 'CSS has something to hang the shell overrides on');
    });

    // ── invoke ───────────────────────────────────────────────

    test('invoke names the command and passes the arguments through', () => {
        const w = bridgeWorld();
        w.tauri.invoke('read_text', { path: 'a.deck' });
        eq(w.calls.length, 1);
        eq(w.calls[0].cmd, 'read_text');
        eq(w.calls[0].payload, { path: 'a.deck' });
    });

    test('invoke with no arguments sends an object, never undefined', () => {
        const w = bridgeWorld();
        w.tauri.invoke('decks_dir');
        eq(w.calls[0].payload, {}, 'a command taking nothing still gets a payload');
    });

    /* THE ONE THIS SUITE WAS ADDED FOR. A raw body is the whole payload, so
       everything else a command needs travels in options.headers; before the
       third parameter was forwarded there was no way to send one, and
       deck-press framed its path into the front of the body instead. */
    test('invoke forwards the options Tauri takes as its third argument', () => {
        const w = bridgeWorld();
        const headers = { 'x-path': 'C:\\decks\\a.deckpack' };
        w.tauri.invoke('write_blob', new Uint8Array([1, 2, 3]), { headers });
        eq(w.calls[0].cmd, 'write_blob');
        eq(w.calls[0].options, { headers }, 'the options reached Tauri');
    });

    test('a payload that is bytes is handed over as bytes', () => {
        const w = bridgeWorld();
        const bytes = new Uint8Array([0x50, 0x4B, 3, 4]);
        w.tauri.invoke('write_blob', bytes);
        ok(ArrayBuffer.isView(w.calls[0].payload),
            'still a view when Tauri sees it — Tauri sends those as a raw body,'
            + ' and anything that wrapped it would silently become JSON');
        eq([...w.calls[0].payload], [0x50, 0x4B, 3, 4], 'and the same bytes');
    });

    test('options are optional, and their absence is undefined rather than {}', () => {
        const w = bridgeWorld();
        w.tauri.invoke('exists', { path: 'a' });
        eq(w.calls[0].options, undefined,
            'Tauri defaults them itself; sending {} would be this file inventing a default');
    });

    test.async('invoke resolves with whatever the backend answered', async () => {
        const w = bridgeWorld();
        eq(await w.tauri.invoke('app_version'), 'ok');
    });

    // ── dialog ───────────────────────────────────────────────

    test('dialog addresses the plugin in the wire format the package uses', () => {
        const w = bridgeWorld();
        w.tauri.dialog('save', { options: { defaultPath: 'a.deck' } });
        eq(w.calls[0].cmd, 'plugin:dialog|save');
        eq(w.calls[0].payload, { options: { defaultPath: 'a.deck' } });
    });

    test('dialog forwards options too, so the two doors stay the same door', () => {
        const w = bridgeWorld();
        w.tauri.dialog('ask', { message: 'go on?' }, { headers: { 'x-a': 'b' } });
        eq(w.calls[0].options, { headers: { 'x-a': 'b' } });
    });

    test('dialog with no arguments sends an object', () => {
        const w = bridgeWorld();
        w.tauri.dialog('message');
        eq(w.calls[0].payload, {});
    });

    // ── on ───────────────────────────────────────────────────

    test('on registers through transformCallback and listens by id', () => {
        const w = bridgeWorld();
        w.tauri.on('deck-changed', () => {});
        eq(w.calls[0].cmd, 'plugin:event|listen');
        eq(w.calls[0].payload.event, 'deck-changed');
        eq(w.calls[0].payload.target, { kind: 'Any' });
        eq(w.calls[0].payload.handler, 77, 'the id transformCallback minted');
    });

    test('on hands the listener the payload, not the envelope', () => {
        const w = bridgeWorld();
        const seen = [];
        w.tauri.on('deck-changed', (p) => seen.push(p));
        w.emit({ payload: { id: 'c1' }, event: 'deck-changed' });
        eq(seen, [{ id: 'c1' }], 'unwrapped once, so a consumer never sees .payload');
    });

    // ── suppressContextMenu ──────────────────────────────────

    test('suppressContextMenu is opt-in and does nothing until called', () => {
        const w = bridgeWorld();
        eq(w.listeners, [], 'loading the file subscribes to nothing');
        w.tauri.suppressContextMenu();
        eq(w.listeners.length, 1);
        eq(w.listeners[0].type, 'contextmenu');
    });

    test('a text field keeps its own menu, because Cut and Paste are real', () => {
        const w = bridgeWorld();
        w.tauri.suppressContextMenu();
        const handler = w.listeners[0].fn;

        let prevented = false;
        handler({ target: { closest: (s) => (s.includes('input') ? {} : null) },
            preventDefault: () => { prevented = true; } });
        ok(!prevented, 'inside a field, the browser menu stands');

        handler({ target: { closest: () => null },
            preventDefault: () => { prevented = true; } });
        ok(prevented, 'anywhere else it is suppressed');
    });
}
