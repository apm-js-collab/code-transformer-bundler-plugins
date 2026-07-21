import { defineConfig, type Plugin } from 'vite';
import { builtinModules } from 'module';
import { resolve, join } from 'path';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync } from 'fs';

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
 * Emit TypeScript declarations for the dual ESM/CJS package.
 *
 * The source authors relative imports with explicit `.js` extensions (the
 * Node16/NodeNext convention), so `tsc`'s `.d.ts` output already resolves
 * without any rewriting. We emit it once and copy it into both output
 * directories:
 *
 * - `dist/esm` is ESM (the package is `"type": "module"`), matching `*.mjs`.
 * - `dist/cjs` gets a `package.json` marker so its `.d.ts` files are treated
 *   as CommonJS, matching `*.cjs`.
 *
 * The same `.d.ts` also serves legacy `node10` resolution via `typesVersions`.
 * We drive `tsc` directly: it is the canonical declaration emitter.
 */
function emitDeclarations(): Plugin {
    return {
        name: 'emit-declarations',
        // Runs once, after Vite has written both `dist/esm` and `dist/cjs`.
        closeBundle: {
            sequential: true,
            order: 'post',
            handler() {
                const esmDir = resolve(__dirname, 'dist/esm');
                const cjsDir = resolve(__dirname, 'dist/cjs');

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
                        '--outDir', 'dist/esm',
                    ],
                    { cwd: __dirname, stdio: 'inherit' },
                );

                // Mark `dist/cjs` as CommonJS so the copied `.d.ts` files are
                // interpreted as CJS types for the `require` condition.
                writeFileSync(join(cjsDir, 'package.json'), '{ "type": "commonjs" }\n');

                for (const name of readdirSync(esmDir)) {
                    if (!name.endsWith('.d.ts')) continue;
                    writeFileSync(join(cjsDir, name), readFileSync(join(esmDir, name)));
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
