import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import codeTransformerPlugin from '../dist/esm/vite.mjs';
import { build } from 'vite';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import {
    createTestFixture,
    createMultiEntryFixture,
    createTracingLibraryFixture,
    commonTestCases,
    countInjections,
    diagnosticsSnippet,
    multiEntryInstrumentation,
    programInjectionTransform,
    INTEGRATION_MARKER,
    TRACING_LIBRARY_NAME,
    type MultiEntryFixture,
    type TestFixture,
} from './test-utils.js';
import { builtinModules } from 'module';
import MagicString from 'magic-string';

describe('Vite integration tests', () => {
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

    it('should integrate with vite and transform ES modules', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(typeof output.code).toBe('string');
            expect(output.code).toContain('test:esmodule');
        }
    });

    it('should inject diagnostics code with vite', async () => {
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
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(typeof output.code).toBe('string');
            expect(output.code).toContain('transformedModules=test-module');
        }
    });

    it('should integrate with vite and transform .mjs files', async () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(typeof output.code).toBe('string');
            expect(output.code).toContain('test:mjs');
        }
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
                    versionRange: '>=1.0.0',
                    filePath: 'outside.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: outsideFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(output.code).not.toContain('test:channel');
        }
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
                    versionRange: '>=2.0.0'
                }
            }]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(output.code).not.toContain('test:function');
        }
    });

    it('should generate a sourcemap when sourcemaps are enabled', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                sourcemap: true,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const chunk = result.output.find(o => o.type === 'chunk');
            expect(chunk).toBeDefined();
            if (chunk?.type === 'chunk') {
                expect(chunk.code).toContain('test:esmodule');
                expect(chunk.map).toBeDefined();
                expect(chunk.map?.sources.some(s => s?.includes('esmodule.js'))).toBe(true);
            }
        }
    });

    it('should chain sourcemaps from a prior transform plugin', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        // Runs before code-transformer (same enforce tier, listed first) and shifts line numbers
        const priorTransformPlugin = {
            name: 'prior-transform',
            enforce: 'pre',
            transform(code: string, id: string) {
                if (!id.includes('esmodule.js')) return null;
                const ms = new MagicString(code);
                ms.prepend('// inserted by prior transform\n');
                return { code: ms.toString(), map: ms.generateMap({ hires: true, source: id }) };
            }
        };

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                sourcemap: true,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [priorTransformPlugin, plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const chunk = result.output.find(o => o.type === 'chunk');
            expect(chunk).toBeDefined();
            if (chunk?.type === 'chunk') {
                expect(chunk.code).toContain('test:esmodule');
                // Sourcemap must chain back to the original file, not the intermediate output
                expect(chunk.map).toBeDefined();
                expect(chunk.map?.sources.some(s => s?.includes('esmodule.js'))).toBe(true);
            }
        }
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
                        versionRange: '>=1.0.0',
                        filePath: 'lib/http.js'
                    },
                    functionQuery: {
                        className: 'HttpClient',
                        methodName: 'fetch',
                        kind: 'Async'
                    }
                },
                {
                    channelName: 'http:post',
                    module: {
                        name: 'test-module',
                        versionRange: '>=1.0.0',
                        filePath: 'lib/http.js'
                    },
                    functionQuery: {
                        className: 'HttpClient',
                        methodName: 'post',
                        kind: 'Async'
                    }
                }
            ]
        });

        const result = await build({
            root: fixture.testDir,
            build: {
                write: false,
                rollupOptions: {
                    input: libFile,
                    external: Array.from(builtinModules)
                }
            },
            plugins: [plugin]
        });

        expect(result).toBeDefined();
        if ('output' in result) {
            const output = result.output[0];
            expect(output.code).toBeDefined();
            expect(typeof output.code).toBe('string');
            expect(output.code).toContain('http:fetch');
            expect(output.code).toContain('http:post');
        }
    });
});

describe('Vite injectDiagnostics entry point injection', () => {
    let fixture: MultiEntryFixture;

    beforeEach(() => {
        fixture = createMultiEntryFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    async function buildChunks() {
        const result = await build({
            root: fixture.testDir,
            logLevel: 'silent',
            build: {
                write: false,
                minify: false,
                rollupOptions: {
                    input: [fixture.entryA, fixture.entryB],
                    external: Array.from(builtinModules),
                },
            },
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [multiEntryInstrumentation],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
        });

        if (!('output' in result)) {
            throw new Error('expected a rollup output');
        }

        return result.output.filter((o) => o.type === 'chunk');
    }

    it('should produce both entry and non-entry chunks', async () => {
        const chunks = await buildChunks();

        expect(chunks.filter((c) => c.isEntry)).toHaveLength(2);
        expect(chunks.filter((c) => !c.isEntry).length).toBeGreaterThan(0);
    });

    it('should inject into entry chunks only, exactly once each', async () => {
        const chunks = await buildChunks();

        for (const chunk of chunks) {
            const expected = chunk.isEntry ? 1 : 0;
            expect(countInjections(chunk.code), `chunk ${chunk.fileName}`).toBe(
                expected,
            );
        }
    });

    it('should report the transformed module in every entry chunk', async () => {
        const chunks = await buildChunks();

        for (const chunk of chunks.filter((c) => c.isEntry)) {
            expect(chunk.code).toContain('transformedModules=test-module');
        }
    });
});

describe('Vite customTransforms per-file injection', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    function integrationSnippet(moduleName: string): string {
        return `import { subscribeTo } from '${TRACING_LIBRARY_NAME}';\nsubscribeTo('${moduleName}');`;
    }

    /** The injection site: same module matcher, Program node, custom transform. */
    function injectionConfig(module: Record<string, unknown>) {
        return {
            channelName: 'integration-injection',
            module,
            astQuery: 'Program',
            transform: 'injectIntegration',
        };
    }

    async function buildOutput(input: string, plugin: unknown): Promise<string> {
        const result = await build({
            root: fixture.testDir,
            logLevel: 'silent',
            build: {
                write: false,
                minify: false,
                rollupOptions: {
                    input,
                    external: Array.from(builtinModules),
                },
            },
            plugins: [plugin as never],
        });

        if (!('output' in result)) {
            throw new Error('expected a rollup output');
        }

        return result.output
            .filter((o) => o.type === 'chunk')
            .map((c) => c.code)
            .join('\n');
    }

    it('should inject the snippet and bundle its bare import from node_modules', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        const code = await buildOutput(
            testFile,
            codeTransformerPlugin({
                instrumentations: [
                    testCase.instrumentation,
                    injectionConfig(testCase.instrumentation.module),
                ],
                customTransforms: {
                    injectIntegration: programInjectionTransform({
                        'test-module': integrationSnippet('test-module'),
                    }),
                },
            }),
        );

        // The instrumentation itself still applies
        expect(code).toContain('test:esmodule');
        // The snippet was injected and its import resolved into the bundle
        expect(code).toMatch(/subscribeTo\(["']test-module["']\)/);
        expect(code).toContain(INTEGRATION_MARKER);
    });

    it('should serve multiple modules with a single transform', async () => {
        const testCase = commonTestCases.esmodule;
        writeFileSync(join(fixture.moduleDir, testCase.filename), testCase.code);

        const otherDir = join(fixture.testDir, 'node_modules', 'other-module');
        mkdirSync(otherDir, { recursive: true });
        writeFileSync(
            join(otherDir, 'package.json'),
            JSON.stringify({ name: 'other-module', version: '2.0.0', main: 'index.js' }),
        );
        writeFileSync(
            join(otherDir, 'index.js'),
            'export async function otherFunction() { return 1; }\n',
        );

        createTracingLibraryFixture(fixture);

        const entryFile = join(fixture.testDir, 'entry.js');
        writeFileSync(
            entryFile,
            `import { testFunction } from './node_modules/test-module/${testCase.filename}';
import { otherFunction } from './node_modules/other-module/index.js';
export const results = Promise.all([testFunction(), otherFunction()]);
`,
        );

        const otherModuleMatcher = {
            name: 'other-module',
            versionRange: '>=1.0.0' as never,
            filePath: 'index.js',
        };

        const code = await buildOutput(
            entryFile,
            codeTransformerPlugin({
                instrumentations: [
                    testCase.instrumentation,
                    {
                        channelName: 'other:channel',
                        module: otherModuleMatcher,
                        functionQuery: {
                            functionName: 'otherFunction',
                            kind: 'Async' as const,
                        },
                    },
                    injectionConfig(testCase.instrumentation.module),
                    injectionConfig(otherModuleMatcher),
                ],
                customTransforms: {
                    // One transform for all sites, branching on state.module.name
                    injectIntegration: programInjectionTransform({
                        'test-module': integrationSnippet('test-module'),
                        'other-module': integrationSnippet('other-module'),
                    }),
                },
            }),
        );

        expect(code).toMatch(/subscribeTo\(["']test-module["']\)/);
        expect(code).toMatch(/subscribeTo\(["']other-module["']\)/);
        expect(code).toContain(INTEGRATION_MARKER);
    });

    it('should not call the transform when the version range does not match', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        // Fixture module is 1.2.3; nothing matches >=2.0.0
        const unmatchedModule = {
            ...testCase.instrumentation.module,
            versionRange: '>=2.0.0' as never,
        };

        const transform = vi.fn(
            programInjectionTransform({
                'test-module': integrationSnippet('test-module'),
            }),
        );

        const code = await buildOutput(
            testFile,
            codeTransformerPlugin({
                instrumentations: [
                    { ...testCase.instrumentation, module: unmatchedModule },
                    injectionConfig(unmatchedModule),
                ],
                customTransforms: { injectIntegration: transform },
            }),
        );

        expect(transform).not.toHaveBeenCalled();
        expect(code).not.toContain('subscribeTo');
        expect(code).not.toContain(INTEGRATION_MARKER);
    });

    it('should keep sourcemaps pointing at the original file', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        const result = await build({
            root: fixture.testDir,
            logLevel: 'silent',
            build: {
                write: false,
                minify: false,
                sourcemap: true,
                rollupOptions: {
                    input: testFile,
                    external: Array.from(builtinModules),
                },
            },
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [
                        testCase.instrumentation,
                        injectionConfig(testCase.instrumentation.module),
                    ],
                    customTransforms: {
                        injectIntegration: programInjectionTransform({
                            'test-module': integrationSnippet('test-module'),
                        }),
                    },
                }),
            ],
        });

        if (!('output' in result)) {
            throw new Error('expected a rollup output');
        }

        const chunk = result.output.find((o) => o.type === 'chunk');
        expect(chunk).toBeDefined();
        if (chunk?.type === 'chunk') {
            expect(chunk.code).toMatch(/subscribeTo\(["']test-module["']\)/);
            expect(chunk.map).toBeDefined();
            expect(chunk.map?.sources.some((s) => s?.includes('esmodule.js'))).toBe(true);
        }
    });
});
