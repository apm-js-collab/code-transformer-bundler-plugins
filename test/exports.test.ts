import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    name: string;
    exports: Record<string, unknown>;
};

function collectLeafPaths(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') {
        return Object.values(value).flatMap(collectLeafPaths);
    }
    return [];
}

function runNode(format: 'module' | 'commonjs', script: string): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('node', [`--input-type=${format}`, '-e', script], {
        cwd: root,
        encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('package.json exports', () => {
    describe('every advertised file exists on disk', () => {
        for (const [subpath, value] of Object.entries(pkg.exports)) {
            for (const relPath of collectLeafPaths(value)) {
                it(`${subpath} → ${relPath}`, () => {
                    expect(existsSync(join(root, relPath))).toBe(true);
                });
            }
        }
    });

    describe('subpaths resolve through Node at runtime', () => {
        const esmEntries = ['rollup', 'webpack', 'vite', 'esbuild', 'bun'];
        const cjsEntries = ['rollup', 'webpack', 'vite', 'esbuild', 'webpack-loader'];

        it.each(esmEntries)(`import '${pkg.name}/%s' (ESM) loads and exports a function`, (entry) => {
            const script = `
                import value from '${pkg.name}/${entry}';
                if (typeof value !== 'function') {
                    console.error('expected function, got ' + typeof value);
                    process.exit(2);
                }
            `;
            const { status, stderr } = runNode('module', script);
            expect(stderr).toBe('');
            expect(status).toBe(0);
        });

        it.each(cjsEntries)(`require '${pkg.name}/%s' (CJS) loads and exports a function`, (entry) => {
            const script = `
                const value = require('${pkg.name}/${entry}');
                if (typeof value !== 'function') {
                    console.error('expected function, got ' + typeof value);
                    process.exit(2);
                }
            `;
            const { status, stderr } = runNode('commonjs', script);
            expect(stderr).toBe('');
            expect(status).toBe(0);
        });

        // Unlike the loader itself, the factory is a normal module with a named
        // export — a wrapper loader requires it and calls `createLoader`.
        const check = `
            if (typeof createLoader !== 'function') {
                console.error('expected createLoader to be a function, got ' + typeof createLoader);
                process.exit(2);
            }
            if (typeof createLoader({}) !== 'function') {
                console.error('expected createLoader() to return a loader function');
                process.exit(2);
            }
        `;

        it(`import '${pkg.name}/webpack-loader-factory' (ESM) exposes createLoader`, () => {
            const { status, stderr } = runNode(
                'module',
                `import { createLoader } from '${pkg.name}/webpack-loader-factory';\n${check}`,
            );
            expect(stderr).toBe('');
            expect(status).toBe(0);
        });

        it(`require '${pkg.name}/webpack-loader-factory' (CJS) exposes createLoader`, () => {
            const { status, stderr } = runNode(
                'commonjs',
                `const { createLoader } = require('${pkg.name}/webpack-loader-factory');\n${check}`,
            );
            expect(stderr).toBe('');
            expect(status).toBe(0);
        });
    });
});
