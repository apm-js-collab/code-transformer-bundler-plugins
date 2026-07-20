import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    mkdtempSync,
    mkdirSync,
    writeFileSync,
    symlinkSync,
    unlinkSync,
    rmSync,
    existsSync,
} from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Regression tests for https://github.com/apm-js-collab/code-transformer-bundler-plugins/issues/40
//
// The published `.d.mts` / `.d.cts` declarations must reference their sibling
// modules with explicit `.mjs` / `.cjs` extensions, otherwise they fail to
// resolve under TypeScript's Node16/NodeNext module resolution with
// `error TS2307: Cannot find module`. These tests type-check a consumer that
// imports every advertised subpath under each resolution mode.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const PKG = '@apm-js-collab/code-transformer-bundler-plugins';
const SUBPATHS = ['core', 'rollup', 'webpack', 'vite', 'esbuild', 'bun', 'webpack-loader'] as const;

// A single consumer module that imports (and references) every subpath, so an
// unresolved declaration surfaces as a hard error rather than being elided.
const consumer =
    SUBPATHS.map((s, i) => `import * as m${i} from '${PKG}/${s}';`).join('\n') +
    `\nexport const used = [${SUBPATHS.map((_, i) => `m${i}`).join(', ')}];\n`;

// `skipLibCheck: false` is essential: issue #40's TS2307 originates inside the
// package's own declaration files, which `skipLibCheck: true` would hide.
const baseCompilerOptions = {
    target: 'esnext',
    strict: true,
    skipLibCheck: false,
    esModuleInterop: true,
    types: ['node'],
    noEmit: true,
};

const modes = [
    // Node16/NodeNext — the resolution that broke in #40. `.mts` exercises the
    // `import` condition (`.d.mts`); `.cts` exercises `require` (`.d.cts`).
    {
        name: 'nodenext',
        compilerOptions: { ...baseCompilerOptions, module: 'nodenext' },
        files: ['consumer.mts', 'consumer.cts'],
    },
    {
        name: 'bundler',
        compilerOptions: { ...baseCompilerOptions, module: 'esnext', moduleResolution: 'bundler' },
        files: ['consumer.ts'],
    },
    // Legacy resolution routes subpaths through `typesVersions` → dist/types/*.d.ts.
    {
        name: 'node10',
        compilerOptions: { ...baseCompilerOptions, module: 'commonjs', moduleResolution: 'node10' },
        files: ['consumer.ts'],
    },
];

let fixture: string;
let symlink: string;

beforeAll(() => {
    expect(
        existsSync(join(root, 'dist/esm/core.d.mts')),
        'Declarations are missing — run `yarn build` before the tests.',
    ).toBe(true);

    // The fixture lives under the repo's own node_modules so that `@types/node`
    // and `@apm-js-collab/code-transformer` resolve up the tree, exactly as
    // they would for a real installed consumer.
    fixture = mkdtempSync(join(root, 'node_modules', '.type-resolution-'));

    // Symlink the package into place so resolution flows through package.json
    // `exports` / `typesVersions` rather than a `paths` alias — that routing is
    // precisely what we are testing.
    const scope = join(fixture, 'node_modules', '@apm-js-collab');
    mkdirSync(scope, { recursive: true });
    symlink = join(scope, 'code-transformer-bundler-plugins');
    symlinkSync(root, symlink, process.platform === 'win32' ? 'junction' : 'dir');

    for (const ext of ['mts', 'cts', 'ts'] as const) {
        writeFileSync(join(fixture, `consumer.${ext}`), consumer);
    }
});

afterAll(() => {
    // Unlink the symlink explicitly first so cleanup can never recurse into the
    // repo it points at.
    if (symlink && existsSync(symlink)) unlinkSync(symlink);
    if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe('published type declarations resolve for consumers', () => {
    it.each(modes)('$name: every subpath type-checks cleanly', (mode) => {
        const tsconfig = join(fixture, `tsconfig.${mode.name}.json`);
        writeFileSync(
            tsconfig,
            JSON.stringify({ compilerOptions: mode.compilerOptions, files: mode.files }, null, 2),
        );

        const { status, stdout, stderr } = spawnSync(process.execPath, [tsc, '-p', tsconfig], {
            cwd: fixture,
            encoding: 'utf8',
        });
        const output = stdout + stderr;

        // `node10` was removed as a `moduleResolution` value in TypeScript 7;
        // skip the mode if the installed compiler no longer accepts it.
        if (/error TS510[78]|moduleResolution.*removed/.test(output)) return;

        expect(status, output).toBe(0);
    });
});
