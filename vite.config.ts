import { defineConfig } from 'vite';
import dts from 'unplugin-dts/vite';
import { builtinModules } from 'module';
import { resolve } from 'path';

const entries = {
    core: 'src/core.ts',
    rollup: 'src/rollup.ts',
    webpack: 'src/webpack.ts',
    vite: 'src/vite.ts',
    esbuild: 'src/esbuild.ts',
    bun: 'src/bun.ts',
    'webpack-loader': 'src/webpack-loader.ts',
};

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
                    exports: 'default',
                },
            ],
        },
    },
    plugins: [
        dts({
            outDirs: [
                { dir: 'dist/esm', moduleFormat: 'esm' },
                { dir: 'dist/cjs', moduleFormat: 'cjs' },
            ],
            include: ['src/**/*.ts'],
            entryRoot: 'src',
        }),
    ],
});
