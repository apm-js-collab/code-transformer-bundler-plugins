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
        const esmEntries = ['rollup', 'webpack', 'vite', 'esbuild'];
        const cjsEntries = ['rollup', 'webpack', 'vite', 'esbuild', 'webpack-loader'];

        for (const entry of esmEntries) {
            it(`import '${pkg.name}/${entry}' (ESM) loads and exports a function`, () => {
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
        }

        for (const entry of cjsEntries) {
            it(`require '${pkg.name}/${entry}' (CJS) loads and exports a function`, () => {
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
        }
    });
});
