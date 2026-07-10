import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../dist/esm/esbuild.mjs';
import { build } from 'esbuild';
import { join } from 'path';
import { writeFileSync, mkdirSync, readFileSync, realpathSync } from 'fs';
import { resolve } from 'path';
import {
    createTestFixture,
    createMultiEntryFixture,
    commonTestCases,
    countInjections,
    diagnosticsSnippet,
    multiEntryInstrumentation,
    type MultiEntryFixture,
    type TestFixture,
} from './test-utils.js';
import { builtinModules } from 'module';

describe('esbuild integration tests', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('should create a plugin with the correct name', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        expect(plugin.name).toBe('code-transformer');
    });

    it('should have a setup method', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        expect(typeof plugin.setup).toBe('function');
    });

    it('should integrate with esbuild and transform ES modules', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            entryPoints: [testFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            external: Array.from(builtinModules),
            platform: 'node'
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).toContain('test:esmodule');        // Normalize file paths in output for consistent snapshots
        output = output.replace(/\/tmp\/[^\/]+/g, '/tmp/NORMALIZED_TEST_DIR');
        output = output.replace(/plugin-test-\d+-[a-z0-9]+/g, 'NORMALIZED_TEST_DIR');
    });

    it('should inject diagnostics code with esbuild', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation],
            injectDiagnostics: (diagnostics) => {
                return `console.log('Diagnostics: transformedModules=${diagnostics.transformedModules.join(',')}, failedModules=${diagnostics.failedModules.join(',')}');`;
            }
        });

        const result = await build({
            entryPoints: [testFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            external: Array.from(builtinModules),
            platform: 'node'
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        const output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).toContain('transformedModules=test-module');
    });

    it('should integrate with esbuild and transform .mjs files', async () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            entryPoints: [testFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            platform: 'node',
            external: Array.from(builtinModules),
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).toContain('test:mjs');        // Normalize file paths in output for consistent snapshots
    });

    it('should not transform files outside node_modules', async () => {
        const outsideFile = join(fixture.testDir, 'outside.js');
        const testCode = `
export function testFunction() {
    return Promise.resolve(42);
}
`;
        writeFileSync(outsideFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:channel',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'outside.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async' as const
                }
            }]
        });

        const result = await build({
            entryPoints: [outsideFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            platform: 'node',
            external: Array.from(builtinModules),
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).not.toContain('test:channel');        // Normalize file paths in output for consistent snapshots
    });

    it('should handle version mismatches correctly', async () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                ...testCase.instrumentation,
                module: {
                    ...testCase.instrumentation.module,
                    versionRange: '>=2.0.0' as any // Version doesn't match (module is 1.2.3)
                }
            }]
        });

        const result = await build({
            entryPoints: [testFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            platform: 'node',
            external: Array.from(builtinModules),
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).not.toContain('test:function');        // Normalize file paths in output for consistent snapshots
    });

    it('should handle multiple instrumentations correctly', async () => {
        const libFile = join(fixture.moduleDir, 'lib', 'http.js');
        mkdirSync(join(fixture.moduleDir, 'lib'), { recursive: true });

        const httpCode = `
export class HttpClient {
    async fetch(url) {
        return { status: 200, data: 'test' };
    }
    
    async post(url, data) {
        return { status: 201, data: 'created' };
    }
}
`;
        writeFileSync(libFile, httpCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [
                {
                    channelName: 'http:fetch',
                    module: {
                        name: 'test-module',
                        versionRange: '>=1.0.0' as any,
                        filePath: 'lib/http.js'
                    },
                    functionQuery: {
                        className: 'HttpClient',
                        methodName: 'fetch',
                        kind: 'Async' as const
                    }
                },
                {
                    channelName: 'http:post',
                    module: {
                        name: 'test-module',
                        versionRange: '>=1.0.0' as any,
                        filePath: 'lib/http.js'
                    },
                    functionQuery: {
                        className: 'HttpClient',
                        methodName: 'post',
                        kind: 'Async' as const
                    }
                }
            ]
        });

        const result = await build({
            entryPoints: [libFile],
            bundle: true,
            write: false,
            format: 'esm',
            plugins: [plugin],
            platform: 'node',
            external: Array.from(builtinModules),
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).toContain('http:fetch');
        expect(output).toContain('http:post');        // Normalize file paths in output for consistent snapshots
    });

    it('should handle CommonJS transformation with esbuild', async () => {
        const testCase = commonTestCases.commonjs;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            entryPoints: [testFile],
            bundle: true,
            write: false,
            format: 'cjs',
            plugins: [plugin],
            external: Array.from(builtinModules),
            platform: 'node'
        });

        expect(result.outputFiles).toBeDefined();
        expect(result.outputFiles.length).toBeGreaterThan(0);

        let output = new TextDecoder().decode(result.outputFiles[0].contents);
        expect(output).toContain('test:commonjs');        // Normalize file paths in output for consistent snapshots
    });
});

describe('esbuild injectDiagnostics entry point injection', () => {
    let fixture: MultiEntryFixture;

    beforeEach(() => {
        fixture = createMultiEntryFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    function buildOptions(write: boolean) {
        return {
            entryPoints: [fixture.entryA, fixture.entryB],
            bundle: true,
            splitting: true,
            format: 'esm' as const,
            outdir: join(fixture.testDir, 'out'),
            write,
            platform: 'node' as const,
            external: Array.from(builtinModules),
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [multiEntryInstrumentation],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
        };
    }

    /**
     * Outputs for the two configured entry points. esbuild also sets
     * `entryPoint` on dynamically imported chunks, so that field alone would
     * wrongly classify the `lazy.js` async chunk as an entry.
     */
    function entryOutputPaths(metafile: {
        outputs: Record<string, { entryPoint?: string }>;
    }): Set<string> {
        // esbuild reports source paths with symlinks resolved, and the fixture
        // lives under a symlinked tmpdir on macOS.
        const configured = new Set([
            realpathSync(fixture.entryA),
            realpathSync(fixture.entryB),
        ]);

        return new Set(
            Object.entries(metafile.outputs)
                .filter(
                    ([, o]) =>
                        o.entryPoint && configured.has(realpathSync(resolve(o.entryPoint))),
                )
                .map(([path]) => resolve(path)),
        );
    }

    it('should force the metafile on so entry points can be identified', async () => {
        const result = await build(buildOptions(false));

        expect(result.metafile).toBeDefined();
    });

    it('should produce async chunks that esbuild also labels as entry points', async () => {
        const result = await build(buildOptions(false));

        const labelled = Object.values(result.metafile!.outputs).filter(
            (o) => o.entryPoint,
        );

        // Guards the tests below: the lazy.js chunk carries an `entryPoint` but
        // is not one of the two configured entries.
        expect(labelled.length).toBe(3);
        expect(entryOutputPaths(result.metafile!).size).toBe(2);
    });

    it('should inject into entry outputs only when writing to disk', async () => {
        const result = await build(buildOptions(true));

        const entryPaths = entryOutputPaths(result.metafile!);
        const allPaths = Object.keys(result.metafile!.outputs).map((p) =>
            resolve(p),
        );

        expect(allPaths.length).toBeGreaterThan(entryPaths.size);

        for (const path of allPaths) {
            const expected = entryPaths.has(path) ? 1 : 0;
            expect(countInjections(readFileSync(path, 'utf8'))).toBe(expected);
        }
    });

    it('should inject into entry outputs only when write is false', async () => {
        const result = await build(buildOptions(false));

        const entryPaths = entryOutputPaths(result.metafile!);

        expect(entryPaths.size).toBe(2);
        expect(result.outputFiles.length).toBeGreaterThan(entryPaths.size);

        for (const file of result.outputFiles) {
            const expected = entryPaths.has(resolve(file.path)) ? 1 : 0;
            expect(countInjections(file.text)).toBe(expected);
        }
    });

    it('should inject into the stdout output', async () => {
        const result = await build({
            entryPoints: [fixture.entryA],
            bundle: true,
            write: false,
            format: 'esm',
            platform: 'node',
            external: Array.from(builtinModules),
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [multiEntryInstrumentation],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
        });

        expect(result.outputFiles[0].path).toBe('<stdout>');
        expect(countInjections(result.outputFiles[0].text)).toBe(1);
    });

    it('should report the transformed module in every entry output', async () => {
        const result = await build(buildOptions(false));

        const entryPaths = entryOutputPaths(result.metafile!);
        const entryFiles = result.outputFiles.filter((f) =>
            entryPaths.has(resolve(f.path)),
        );

        expect(entryFiles).toHaveLength(2);

        for (const file of entryFiles) {
            expect(file.text).toContain('transformedModules=test-module');
        }
    });
});
