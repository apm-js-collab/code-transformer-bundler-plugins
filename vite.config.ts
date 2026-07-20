import { defineConfig, type Plugin } from 'vite';
import { builtinModules } from 'module';
import { resolve, join } from 'path';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'fs';

const entries = {
    core: 'src/core.ts',
    rollup: 'src/rollup.ts',
    webpack: 'src/webpack.ts',
    vite: 'src/vite.ts',
    esbuild: 'src/esbuild.ts',
    bun: 'src/bun.ts',
    'webpack-loader': 'src/webpack-loader.ts',
};

/**
 * Add an explicit runtime extension to extensionless relative specifiers.
 *
 * `tsc` emits declarations whose relative imports match the (extensionless)
 * source, e.g. `from './instrumentation-serde'`. That is fine for the plain
 * `.d.ts` (node10) output, but under Node16/NodeNext module resolution a
 * `.d.mts`/`.d.cts` file must reference its siblings with an explicit
 * extension or TypeScript reports TS2307 "Cannot find module".
 */
function addRelativeExtensions(content: string, ext: '.mjs' | '.cjs'): string {
    // Match `from './x'` / `from "../x"` and `import('./x')` where the
    // specifier is relative and does not already carry an extension.
    return content.replace(
        /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+?)\2/g,
        (match, prefix, quote, specifier) =>
            /\.[mc]?js$/.test(specifier)
                ? match
                : `${prefix}${quote}${specifier}${ext}${quote}`,
    );
}

/**
 * Emit TypeScript declarations for the dual ESM/CJS package.
 *
 * `tsc` emits one `.d.ts` per source into `dist/types`; these are consumed
 * directly by old `node10` module resolution via `typesVersions` in
 * package.json. Each declaration is then copied into `dist/esm` and `dist/cjs`
 * as `.d.mts` / `.d.cts` with its relative specifiers rewritten to `.mjs` /
 * `.cjs` so the types resolve under Node16/NodeNext (see the `exports` map).
 *
 * We drive `tsc` directly rather than via a plugin: it is the canonical
 * declaration emitter, and the surrounding logic is small enough to own.
 */
function emitDeclarations(): Plugin {
    return {
        name: 'emit-declarations',
        // Runs once, after Vite has written both `dist/esm` and `dist/cjs`.
        closeBundle: {
            sequential: true,
            order: 'post',
            handler() {
                const typesDir = resolve(__dirname, 'dist/types');
                rmSync(typesDir, { recursive: true, force: true });

                // Reuse tsconfig.json (rootDir/include/strict), overriding it to
                // emit declarations only, without source or declaration maps
                // (the latter reference `src/`, which is not published).
                execFileSync(
                    process.execPath,
                    [
                        resolve(__dirname, 'node_modules/typescript/bin/tsc'),
                        '--project', 'tsconfig.json',
                        '--noEmit', 'false',
                        '--emitDeclarationOnly',
                        '--declaration',
                        '--declarationMap', 'false',
                        '--sourceMap', 'false',
                        '--outDir', 'dist/types',
                    ],
                    { cwd: __dirname, stdio: 'inherit' },
                );

                for (const name of readdirSync(typesDir)) {
                    if (!name.endsWith('.d.ts')) continue;
                    const dts = readFileSync(join(typesDir, name), 'utf8');
                    const base = name.slice(0, -'.d.ts'.length);
                    writeFileSync(
                        resolve(__dirname, 'dist/esm', `${base}.d.mts`),
                        addRelativeExtensions(dts, '.mjs'),
                    );
                    writeFileSync(
                        resolve(__dirname, 'dist/cjs', `${base}.d.cts`),
                        addRelativeExtensions(dts, '.cjs'),
                    );
                }
            },
        },
    };
}

export default defineConfig({
    build: {
        target: 'node18',
        outDir: 'dist',
        emptyOutDir: true,
        minify: false,
        sourcemap: true,
        lib: {
            entry: Object.fromEntries(
                Object.entries(entries).map(([k, v]) => [k, resolve(__dirname, v)]),
            ),
            formats: ['es', 'cjs'],
        },
        rollupOptions: {
            platform: 'node',
            external: [
                ...builtinModules,
                ...builtinModules.map((m) => `node:${m}`),
                '@apm-js-collab/code-transformer',
                'module-details-from-path',
            ],
            output: [
                {
                    format: 'es',
                    dir: 'dist/esm',
                    entryFileNames: '[name].mjs',
                    chunkFileNames: '[name]-[hash].mjs',
                },
                {
                    format: 'cjs',
                    dir: 'dist/cjs',
                    entryFileNames: '[name].cjs',
                    chunkFileNames: '[name]-[hash].cjs',
                    exports: 'auto',
                },
            ],
        },
    },
    plugins: [emitDeclarations()],
});
