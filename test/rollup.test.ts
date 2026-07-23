import { describe, it, expect, beforeEach, afterEach, inject, vi } from 'vitest';
import codeTransformerPlugin from '../dist/esm/rollup.mjs';
import { rollup } from 'rollup';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { builtinModules } from 'module';
import {
    createTestFixture,
    createMultiEntryFixture,
    createTracingLibraryFixture,
    commonTestCases,
    countInjections,
    diagnosticsSnippet,
    multiEntryInstrumentation,
    programInjectionTransform,
    tracingChannelImportOverride,
    twoChannelTestCase,
    INTEGRATION_MARKER,
    type MultiEntryFixture,
    type TestFixture,
} from './test-utils.js';

describe('Rollup integration tests', () => {
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

        // The plugin can be a single plugin or an array, check the first plugin
        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        expect(firstPlugin.name).toBe('code-transformer');
    });

    it('should have a filtered transform hook that targets node_modules by default', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        // The plugin can be a single plugin or an array, check the first plugin
        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        // By default the transform hook uses the object form with an id filter
        expect(typeof firstPlugin.transform).toBe('object');
        expect(firstPlugin.transform.filter).toEqual({ id: /node_modules/ });
        expect(typeof firstPlugin.transform.handler).toBe('function');
    });

    it('should use a plain transform function when filtering is disabled', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: [],
            transformFilter: false
        });

        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        expect(typeof firstPlugin.transform).toBe('function');
    });

    it('should apply a custom transform filter', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: [],
            transformFilter: { include: /\.js$/, exclude: /node_modules/ }
        });

        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        expect(firstPlugin.transform.filter).toEqual({
            id: { include: /\.js$/, exclude: /node_modules/ }
        });
    });

    it('should handle CommonJS modules correctly', async () => {
        const testCase = commonTestCases.commonjs;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'cjs' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('test:commonjs');
    });

    it('should handle ES modules with explicit import/export', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)

        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('test:esmodule');
    });

    it('should handle .mjs files as ES modules', async () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)

        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('test:mjs');
    });

    it('should skip files outside of node_modules', async () => {
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

        const bundle = await rollup({
            input: outsideFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)

        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(result.code).not.toContain('test:channel');
    });

    it('should transform code in matching module with correct version', async () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('test:function');
    });

    it('should not transform code when version does not match', async () => {
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

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(result.code).not.toContain('test:function');
    });

    it('should not transform code when module name does not match', async () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                ...testCase.instrumentation,
                module: {
                    ...testCase.instrumentation.module,
                    name: 'different-module' // Different module name
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(result.code).not.toContain('test:function');
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

        const bundle = await rollup({
            input: libFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('http:fetch');
        expect(result.code).toContain('http:post');
    });

    it('should handle complex semver ranges correctly', async () => {
        // Update the package.json to version 1.5.2
        writeFileSync(join(fixture.moduleDir, 'package.json'), JSON.stringify({
            name: 'test-module',
            version: '1.5.2',
            main: 'index.js'
        }, null, 2));

        const testFile = join(fixture.moduleDir, 'index.js');
        const testCode = `
export function complexFunction() {
    return Promise.resolve('complex');
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:complex',
                module: {
                    name: 'test-module',
                    versionRange: '^1.5.0' as any, // Should match 1.5.2
                    filePath: 'index.js'
                },
                functionQuery: {
                    functionName: 'complexFunction',
                    kind: 'Async' as const
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(result.code).toContain('test:complex');
    });

    it('should handle ES modules with explicit import/export', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation],
            injectDiagnostics: (diagnostics) => {
                // For testing purposes, we can just return a string that includes the diagnostics info
                return `console.log('Diagnostics: transformedModules=${diagnostics.transformedModules.join(',')}, failedModules=${diagnostics.failedModules.join(',')}');`;
            }
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: (id) => builtinModules.includes(id)

        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        expect(result.code).toContain('transformedModules=test-module');
    });
});

describe('Rollup injectDiagnostics entry point injection', () => {
    let fixture: MultiEntryFixture;

    beforeEach(() => {
        fixture = createMultiEntryFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    async function buildChunks() {
        const bundle = await rollup({
            input: [fixture.entryA, fixture.entryB],
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [multiEntryInstrumentation],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
            external: (id) => builtinModules.includes(id),
        });

        const { output } = await bundle.generate({ format: 'es' });
        return output.filter((o) => o.type === 'chunk');
    }

    it('should produce both entry and non-entry chunks', async () => {
        const chunks = await buildChunks();

        // Guards the tests below: without a shared and an async chunk there
        // would be nothing for the entry point check to exclude.
        expect(chunks.filter((c) => c.isEntry)).toHaveLength(2);
        expect(chunks.filter((c) => !c.isEntry).length).toBeGreaterThan(0);
    });

    it('should inject into every entry chunk exactly once', async () => {
        const chunks = await buildChunks();

        for (const chunk of chunks.filter((c) => c.isEntry)) {
            expect(countInjections(chunk.code)).toBe(1);
        }
    });

    it('should not inject into shared or async chunks', async () => {
        const chunks = await buildChunks();

        for (const chunk of chunks.filter((c) => !c.isEntry)) {
            expect(countInjections(chunk.code)).toBe(0);
        }
    });

    it('should report the transformed module in every entry chunk', async () => {
        const chunks = await buildChunks();

        for (const chunk of chunks.filter((c) => c.isEntry)) {
            expect(chunk.code).toContain('transformedModules=test-module');
            expect(chunk.code).toContain('failedModules=');
        }
    });

    it('should not register renderChunk when injectDiagnostics is omitted', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: [multiEntryInstrumentation],
        });

        expect(plugin.renderChunk).toBeUndefined();
    });
});

describe('Rollup customTransforms per-file injection', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('should inject a snippet whose import is resolved into the bundle', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        // Plain rollup has no bare-specifier resolution, so the snippet
        // imports the library entry by absolute path.
        const libraryEntry = createTracingLibraryFixture(fixture);
        const snippet = `import { subscribeTo } from ${JSON.stringify(libraryEntry)};\nsubscribeTo('test-module');`;

        const bundle = await rollup({
            input: testFile,
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [
                        testCase.instrumentation,
                        {
                            channelName: 'integration-injection',
                            module: testCase.instrumentation.module,
                            astQuery: 'Program',
                            transform: 'injectIntegration',
                        },
                    ],
                    customTransforms: {
                        injectIntegration: programInjectionTransform({
                            'test-module': snippet,
                        }),
                    },
                }),
            ],
            external: (id) => builtinModules.includes(id),
        });

        const { output } = await bundle.generate({ format: 'es' });
        const code = output[0].code;

        // The instrumentation itself still applies
        expect(code).toContain('test:esmodule');
        // The snippet was injected and its import bundled
        expect(code).toMatch(/subscribeTo\(["']test-module["']\)/);
        expect(code).toContain(INTEGRATION_MARKER);
    });
});

describe('Rollup tracingChannelImport override', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    async function bundleWithOverride(
        input: string,
        instrumentations: unknown[],
    ): Promise<string> {
        // Plain rollup has no bare-specifier resolution, so the snippet
        // imports the library entry by absolute path.
        const libraryEntry = createTracingLibraryFixture(fixture);
        const snippet = `import { subscribeTo } from ${JSON.stringify(libraryEntry)};\nsubscribeTo('test-module');`;

        const bundle = await rollup({
            input,
            plugins: [
                codeTransformerPlugin({
                    instrumentations: instrumentations as never,
                    customTransforms: {
                        tracingChannelImport: tracingChannelImportOverride({
                            'test-module': snippet,
                        }),
                    },
                }),
            ],
            external: (id) => builtinModules.includes(id),
        });

        const { output } = await bundle.generate({ format: 'es' });
        return output[0].code;
    }

    it('should inject once for a file whose channel is set up twice', async () => {
        const testCase = twoChannelTestCase;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const code = await bundleWithOverride(testFile, testCase.instrumentations);

        // Both instrumentations applied, and the built-in transform still ran
        expect(code).toContain('test:alpha');
        expect(code).toContain('test:beta');
        expect(code).toContain('tr_ch_apm_tracingChannel');

        // One injection despite the override being called once per channel
        expect(code.match(/subscribeTo\(["']test-module["']\)/g)).toHaveLength(1);
        expect(code).toContain(INTEGRATION_MARKER);
    });

    // The reason to override this transform rather than add a `Program` config,
    // which would match every file the module matcher does.
    it('should not inject into a file where nothing was instrumented', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const code = await bundleWithOverride(testFile, [
            {
                ...testCase.instrumentation,
                functionQuery: { functionName: 'doesNotExist', kind: 'Async' },
            },
        ]);

        expect(code).not.toContain('subscribeTo');
        expect(code).not.toContain(INTEGRATION_MARKER);
        // The file still fails as it normally would
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('Code transformation failed'),
            expect.anything(),
        );

        warn.mockRestore();
    });
});
