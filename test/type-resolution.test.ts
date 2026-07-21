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
// The published declarations must reference their sibling modules with explicit
// extensions, otherwise they fail to resolve under TypeScript's Node16/NodeNext
// module resolution with `error TS2307: Cannot find module` (or `TS2834`).
// These tests type-check a consumer that imports every advertised subpath under
// each resolution mode.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const PKG = '@apm-js-collab/code-transformer-bundler-plugins';
const ALL_SUBPATHS = ['core', 'rollup', 'webpack', 'vite', 'esbuild', 'bun', 'webpack-loader'] as const;

// `vite` ships `exports`-only type declarations that legacy `node10` resolution
// cannot follow, so the `/vite` subpath's peer types are unresolvable there —
// a limitation of vite itself, not of our declarations (which resolve fine).
const NODE10_SUBPATHS = ALL_SUBPATHS.filter((s) => s !== 'vite');

// A consumer module that imports (and references) each subpath, so an
// unresolved declaration surfaces as a hard error rather than being elided.
function consumerFor(subpaths: readonly string[]): string {
    return (
        subpaths.map((s, i) => `import * as m${i} from '${PKG}/${s}';`).join('\n') +
        `\nexport const used = [${subpaths.map((_, i) => `m${i}`).join(', ')}];\n`
    );
}

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
    // `import` condition; `.cts` exercises `require`.
    {
        name: 'nodenext',
        compilerOptions: { ...baseCompilerOptions, module: 'nodenext' },
        files: ['consumer.mts', 'consumer.cts'],
        subpaths: ALL_SUBPATHS,
    },
    {
        name: 'bundler',
        compilerOptions: { ...baseCompilerOptions, module: 'esnext', moduleResolution: 'bundler' },
        files: ['consumer.ts'],
        subpaths: ALL_SUBPATHS,
    },
    // Legacy resolution routes subpaths through `typesVersions` → the `.d.ts`
    // files. `ignoreDeprecations` silences TS6's non-fatal `node10` deprecation
    // warning so the mode actually runs; TS7 removes `node10` outright, which
    // the skip below detects.
    {
        name: 'node10',
        compilerOptions: {
            ...baseCompilerOptions,
            module: 'commonjs',
            moduleResolution: 'node10',
            ignoreDeprecations: '6.0',
        },
        files: ['consumer.ts'],
        subpaths: NODE10_SUBPATHS,
    },
];

let fixture: string;
let symlink: string;

beforeAll(() => {
    expect(
        existsSync(join(root, 'dist/esm/core.d.ts')),
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
});

afterAll(() => {
    // Unlink the symlink explicitly first so cleanup can never recurse into the
    // repo it points at.
    if (symlink && existsSync(symlink)) unlinkSync(symlink);
    if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe('published type declarations resolve for consumers', () => {
    it.each(modes)('$name: every subpath type-checks cleanly', (mode) => {
        const source = consumerFor(mode.subpaths);
        for (const file of mode.files) writeFileSync(join(fixture, file), source);

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
