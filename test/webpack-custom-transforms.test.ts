import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import codeTransformerPlugin from '../dist/esm/webpack.mjs';
import { createLoader } from '../dist/esm/webpack-loader-factory.mjs';
import webpack from 'webpack';
import { join, dirname } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { builtinModules, createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
    createTestFixture,
    createTracingLibraryFixture,
    commonTestCases,
    diagnosticsSnippet,
    programInjectionTransform,
    INTEGRATION_MARKER,
    TRACING_LIBRARY_NAME,
    type TestFixture,
} from './test-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const FACTORY_PATH = join(__dirname, '..', 'dist', 'cjs', 'webpack-loader-factory.cjs');
const MERIYAH_PATH = require.resolve('meriyah');

/** The injection site: same module matcher, Program node, custom transform. */
function injectionConfig(module: Record<string, unknown>) {
    return {
        channelName: 'integration-injection',
        module,
        astQuery: 'Program',
        transform: 'injectIntegration',
    };
}

function integrationSnippet(moduleName: string): string {
    return `import { subscribeTo } from '${TRACING_LIBRARY_NAME}';\nsubscribeTo('${moduleName}');`;
}

/**
 * Writes the kind of loader a downstream library would ship: a CommonJS module
 * that binds its custom transforms with `createLoader` at require time, so the
 * functions never have to survive loader-option serialization.
 */
function writeWrapperLoader(fixture: TestFixture, moduleName: string): string {
    const loaderPath = join(fixture.testDir, 'wrapper-loader.cjs');

    writeFileSync(
        loaderPath,
        `const { createLoader } = require(${JSON.stringify(FACTORY_PATH)});
const { parse } = require(${JSON.stringify(MERIYAH_PATH)});

const SNIPPET = ${JSON.stringify(integrationSnippet(moduleName))};

module.exports = createLoader({
    customTransforms: {
        injectIntegration(state, program) {
            if (state.module.name !== ${JSON.stringify(moduleName)}) return;
            // A file can be matched by several configs; only inject once.
            if (program.__integrationInjected) return;
            program.__integrationInjected = true;

            const statements = parse(SNIPPET, { module: state.moduleType === 'esm' }).body;
            const index = program.body.findIndex((node) => node.directive === 'use strict');
            program.body.splice(index + 1, 0, ...statements);
        },
    },
});
`,
    );

    return loaderPath;
}

function runWebpack(config: webpack.Configuration, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const compiler = webpack(config);

        compiler.run((err, stats) => {
            if (err) {
                reject(err);
                return;
            }

            if (stats?.hasErrors()) {
                reject(new Error(stats.toString()));
                return;
            }

            let source: string;
            try {
                source = readFileSync(outputPath, 'utf8');
            } catch (readErr) {
                reject(new Error(`Failed to read output file: ${readErr}`));
                return;
            }

            compiler.close(() => resolve(source));
        });
    });
}

describe('Webpack custom transforms via a wrapper loader', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
        vi.restoreAllMocks();
    });

    it('should apply a transform bound by createLoader, with instrumentations still passed as JSON', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        const outputPath = join(fixture.testDir, 'dist', 'bundle.js');
        const source = await runWebpack(
            {
                mode: 'production',
                entry: testFile,
                output: { path: join(fixture.testDir, 'dist'), filename: 'bundle.js' },
                module: {
                    rules: [
                        {
                            test: /\.js$/,
                            use: {
                                loader: writeWrapperLoader(fixture, 'test-module'),
                                options: {
                                    instrumentations: [
                                        testCase.instrumentation,
                                        injectionConfig(testCase.instrumentation.module),
                                    ],
                                },
                            },
                        },
                    ],
                },
                externals: Array.from(builtinModules),
                optimization: { minimize: false },
            },
            outputPath,
        );

        // The instrumentation itself still applies
        expect(source).toContain('test:esmodule');
        // The snippet was injected and its bare import resolved into the bundle
        expect(source).toMatch(/subscribeTo\(["']test-module["']\)/);
        expect(source).toContain(INTEGRATION_MARKER);
    });

    it('should use the wrapper loader when the plugin is given a loaderPath, keeping diagnostics', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        const outputPath = join(fixture.testDir, 'dist', 'bundle.js');
        const source = await runWebpack(
            {
                mode: 'production',
                entry: testFile,
                output: { path: join(fixture.testDir, 'dist'), filename: 'bundle.js' },
                plugins: [
                    codeTransformerPlugin({
                        loaderPath: writeWrapperLoader(fixture, 'test-module'),
                        instrumentations: [
                            testCase.instrumentation,
                            injectionConfig(testCase.instrumentation.module),
                        ],
                        injectDiagnostics: diagnosticsSnippet,
                    }),
                ],
                externals: Array.from(builtinModules),
                optimization: { minimize: false },
            },
            outputPath,
        );

        expect(source).toContain('test:esmodule');
        expect(source).toContain(INTEGRATION_MARKER);
        // The loader still reports into the plugin's diagnostics state
        expect(source).toContain('transformedModules=test-module');
    });

});

describe('Webpack plugin customTransforms', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
        vi.restoreAllMocks();
    });

    it('should apply transforms passed straight to the plugin', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);
        createTracingLibraryFixture(fixture);

        const outputPath = join(fixture.testDir, 'dist', 'bundle.js');
        const source = await runWebpack(
            {
                mode: 'production',
                entry: testFile,
                output: { path: join(fixture.testDir, 'dist'), filename: 'bundle.js' },
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
                        injectDiagnostics: diagnosticsSnippet,
                    }),
                ],
                externals: Array.from(builtinModules),
                optimization: { minimize: false },
            },
            outputPath,
        );

        // The instrumentation itself still applies
        expect(source).toContain('test:esmodule');
        // The snippet was injected and its bare import resolved into the bundle
        expect(source).toMatch(/subscribeTo\(["']test-module["']\)/);
        expect(source).toContain(INTEGRATION_MARKER);
        expect(source).toContain('transformedModules=test-module');
    });

    it('should forward the transforms to the loader by reference', () => {
        const injectIntegration = () => {};
        const compiler = webpack({
            mode: 'production',
            entry: join(fixture.moduleDir, commonTestCases.esmodule.filename),
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [],
                    customTransforms: { injectIntegration },
                }),
            ],
        });

        const rule = compiler.options.module.rules[0] as {
            use: Array<{ options: { customTransforms?: Record<string, unknown> } }>;
        };

        // By reference, not a copy: a serialized round trip would drop it.
        expect(rule.use[0]!.options.customTransforms?.injectIntegration).toBe(injectIntegration);

        compiler.close(() => {});
    });

    // A persistent cache keyed only on the rule's position would serve the
    // first build's output forever.
    describe('with a filesystem cache', () => {
        /**
         * Injects `marker` at the top of the program. Written as a factory over
         * the *source* of the transform rather than over a captured variable,
         * because captured data is invisible to the cache key.
         */
        function markerTransform(marker: string) {
            // eslint-disable-next-line no-new-func
            return new Function(
                'state',
                'program',
                `if (program.__injected) return;
                 program.__injected = true;
                 program.body.unshift({
                     type: 'ExpressionStatement',
                     expression: { type: 'Identifier', name: '${marker}' },
                 });`,
            ) as (state: unknown, program: unknown) => void;
        }

        function build(
            transform: (state: any, program: any) => void,
            extra: { cacheVersion?: string } = {},
        ): Promise<string> {
            const testCase = commonTestCases.esmodule;

            return runWebpack(
                {
                    mode: 'production',
                    entry: join(fixture.moduleDir, testCase.filename),
                    output: { path: join(fixture.testDir, 'dist'), filename: 'bundle.js' },
                    cache: {
                        type: 'filesystem',
                        cacheDirectory: join(fixture.testDir, '.webpack-cache'),
                    },
                    plugins: [
                        codeTransformerPlugin({
                            ...extra,
                            instrumentations: [
                                testCase.instrumentation,
                                injectionConfig(testCase.instrumentation.module),
                            ],
                            customTransforms: { injectIntegration: transform },
                        }),
                    ],
                    externals: Array.from(builtinModules),
                    optimization: { minimize: false },
                },
                join(fixture.testDir, 'dist', 'bundle.js'),
            );
        }

        const buildWith = (marker: string, extra: { cacheVersion?: string } = {}) =>
            build(markerTransform(marker), extra);

        beforeEach(() => {
            writeFileSync(
                join(fixture.moduleDir, commonTestCases.esmodule.filename),
                commonTestCases.esmodule.code,
            );
        });

        it('should rebuild when a transform body changes', async () => {
            expect(await buildWith('MARKER_ONE')).toContain('MARKER_ONE');

            const second = await buildWith('MARKER_TWO');
            expect(second).toContain('MARKER_TWO');
            expect(second).not.toContain('MARKER_ONE');
        });

        it('should still serve the cache when nothing changed', async () => {
            let calls = 0;
            // Source text identical across both builds, so the cache key is too.
            const transform = (state: any, program: any) => {
                calls++;
                markerTransform('MARKER_ONE')(state, program);
            };

            expect(await build(transform)).toContain('MARKER_ONE');
            expect(calls).toBe(1);

            expect(await build(transform)).toContain('MARKER_ONE');
            expect(calls, 'the second build should have come from the cache').toBe(1);
        });

        // The cache key cannot see data a transform reads without naming it, so
        // `cacheVersion` is the way to invalidate on a change it cannot detect.
        it('should rebuild when cacheVersion changes', async () => {
            const first = await buildWith('MARKER_ONE', { cacheVersion: 'v1' });
            expect(first).toContain('MARKER_ONE');

            const second = await buildWith('MARKER_TWO', { cacheVersion: 'v2' });
            expect(second).toContain('MARKER_TWO');
            expect(second).not.toContain('MARKER_ONE');
        });
    });

    // Webpack keys a loader by its ruleset ident, so with `cache: { type:
    // 'filesystem' }` an ident derived from the rule's position would let a
    // changed config reuse modules built by the previous one.
    describe('loader ident', () => {
        function identFor(options: Parameters<typeof codeTransformerPlugin>[0]): string {
            const compiler = webpack({
                mode: 'production',
                entry: join(fixture.moduleDir, commonTestCases.esmodule.filename),
                plugins: [codeTransformerPlugin(options)],
            });

            const rule = compiler.options.module.rules[0] as {
                use: Array<{ ident: string }>;
            };
            const ident = rule.use[0]!.ident;

            compiler.close(() => {});
            return ident;
        }

        const instrumentations = [commonTestCases.esmodule.instrumentation];

        it('should stay stable for an unchanged config', () => {
            expect(identFor({ instrumentations })).toBe(identFor({ instrumentations }));
        });

        it('should change when the instrumentations change', () => {
            expect(identFor({ instrumentations })).not.toBe(
                identFor({
                    instrumentations: [
                        { ...commonTestCases.esmodule.instrumentation, channelName: 'other' },
                    ],
                }),
            );
        });

        it('should change when a transform body changes', () => {
            expect(
                identFor({
                    instrumentations,
                    customTransforms: { injectIntegration: () => 'v1' },
                }),
            ).not.toBe(
                identFor({
                    instrumentations,
                    customTransforms: { injectIntegration: () => 'v2' },
                }),
            );
        });

        it('should change when dcModule changes', () => {
            expect(identFor({ instrumentations, dcModule: 'a' })).not.toBe(
                identFor({ instrumentations, dcModule: 'b' }),
            );
        });

        it('should change when cacheVersion changes', () => {
            expect(identFor({ instrumentations, cacheVersion: 'v1' })).not.toBe(
                identFor({ instrumentations, cacheVersion: 'v2' }),
            );
        });
    });
});

describe('createLoader matcher caching', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    /** Minimal stand-in for webpack's loader context. */
    function runLoader(
        loader: ReturnType<typeof createLoader>,
        resourcePath: string,
        code: string,
        options: unknown,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            loader.call(
                {
                    resourcePath,
                    getOptions: () => options,
                    async:
                        () =>
                        (err: Error | null, result?: string) =>
                            err ? reject(err) : resolve(result!),
                },
                code,
            );
        });
    }

    // The matcher cache is keyed on the instrumentations alone, so a cache
    // shared across loaders would hand the second loader the first one's
    // transforms.
    it('should not share matchers between loaders with different customTransforms', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const instrumentations = [
            testCase.instrumentation,
            injectionConfig(testCase.instrumentation.module),
        ];

        const makeLoader = (marker: string) =>
            createLoader({
                customTransforms: {
                    injectIntegration(_state: any, program: any) {
                        if (program.__integrationInjected) return;
                        program.__integrationInjected = true;
                        program.body.unshift({
                            type: 'ExpressionStatement',
                            expression: { type: 'Identifier', name: marker },
                        });
                    },
                },
            });

        const first = await runLoader(makeLoader('FIRST_MARKER'), testFile, testCase.code, {
            instrumentations,
        });
        const second = await runLoader(makeLoader('SECOND_MARKER'), testFile, testCase.code, {
            instrumentations,
        });

        expect(first).toContain('FIRST_MARKER');
        expect(first).not.toContain('SECOND_MARKER');
        expect(second).toContain('SECOND_MARKER');
        expect(second).not.toContain('FIRST_MARKER');
    });

    it('should fall back to the instrumentations createLoader was built with', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const loader = createLoader({ instrumentations: [testCase.instrumentation] });
        const output = await runLoader(loader, testFile, testCase.code, {});

        expect(output).toContain('test:esmodule');
    });

    it('should let per-rule options override the baked-in instrumentations', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const loader = createLoader({ instrumentations: [testCase.instrumentation] });
        const output = await runLoader(loader, testFile, testCase.code, {
            instrumentations: [
                { ...testCase.instrumentation, channelName: 'override:channel' },
            ],
        });

        expect(output).toContain('override:channel');
        expect(output).not.toContain('test:esmodule');
    });

    it('should let per-rule transforms override the baked-in ones by name', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const marker = (name: string) => (_state: any, program: any) => {
            if (program.__integrationInjected) return;
            program.__integrationInjected = true;
            program.body.unshift({
                type: 'ExpressionStatement',
                expression: { type: 'Identifier', name },
            });
        };

        const loader = createLoader({
            instrumentations: [
                testCase.instrumentation,
                injectionConfig(testCase.instrumentation.module),
            ],
            customTransforms: { injectIntegration: marker('BAKED_IN') },
        });

        const output = await runLoader(loader, testFile, testCase.code, {
            customTransforms: { injectIntegration: marker('PER_RULE') },
        });

        expect(output).toContain('PER_RULE');
        expect(output).not.toContain('BAKED_IN');
    });

    it('should pass code through when no instrumentations are configured', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const output = await runLoader(createLoader(), testFile, testCase.code, {});

        expect(output).toBe(testCase.code);
    });
});
