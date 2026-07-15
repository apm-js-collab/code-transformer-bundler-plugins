import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import codeTransformerPlugin from '../dist/esm/webpack.mjs';
import webpack from 'webpack';
import { join } from 'path';
import { writeFileSync, readFileSync, readdirSync } from 'fs';
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

describe('Webpack integration tests', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('should create a plugin with apply method', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        expect(typeof plugin.apply).toBe('function');
    });

    // Turbopack rejects loader options that are not plain JSON, so the plugin
    // must not forward RegExp instances or callbacks to the loader.
    it('should register JSON-serializable loader options', () => {
        const testCase = commonTestCases.esmodule;
        const compiler = webpack({
            mode: 'production',
            entry: join(fixture.moduleDir, testCase.filename),
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [
                        {
                            ...testCase.instrumentation,
                            module: {
                                ...testCase.instrumentation.module,
                                filePath: /esmodule\.js$/,
                            },
                        },
                    ],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
        });

        const rule = compiler.options.module.rules[0] as {
            use: Array<{ options: unknown }>;
        };
        const options = rule.use[0]!.options;

        expect(JSON.parse(JSON.stringify(options))).toEqual(options);
        expect(options).toEqual({
            instrumentations: [
                {
                    ...testCase.instrumentation,
                    module: {
                        ...testCase.instrumentation.module,
                        filePath: { type: 'RegExp', source: 'esmodule\\.js$', flags: '' },
                    },
                },
            ],
        });

        compiler.close(() => {});
    });

    it('should integrate with webpack and transform ES modules', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            plugins: [plugin],
            externals: Array.from(builtinModules),
            optimization: {
                minimize: false
            }
        });

        return new Promise<void>((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(new Error(stats.toString()));
                    return;
                }                // Read the output file directly
                const outputPath = join(fixture.testDir, 'dist', 'bundle.js');

                let source: string;
                try {
                    source = readFileSync(outputPath, 'utf8');
                } catch (readErr) {
                    reject(new Error(`Failed to read output file: ${readErr}`));
                    return;
                }

                expect(source).toBeDefined();
                expect(typeof source).toBe('string');
                expect(source).toContain('test:esmodule');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should inject diagnostics code with webpack', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation],
            injectDiagnostics: (diagnostics) => {
                return `console.log('Diagnostics: transformedModules=${diagnostics.transformedModules.join(',')}, failedModules=${diagnostics.failedModules.join(',')}');`;
            }
        });

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            plugins: [plugin],
            externals: Array.from(builtinModules),
            optimization: {
                minimize: false
            }
        });

        return new Promise<void>((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(new Error(stats.toString()));
                    return;
                }

                const outputPath = join(fixture.testDir, 'dist', 'bundle.js');

                let source: string;
                try {
                    source = readFileSync(outputPath, 'utf8');
                } catch (readErr) {
                    reject(new Error(`Failed to read output file: ${readErr}`));
                    return;
                }

                expect(source).toBeDefined();
                expect(typeof source).toBe('string');
                expect(source).toContain('transformedModules=test-module');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should integrate with webpack and transform CommonJS modules', async () => {
        const testCase = commonTestCases.commonjs;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            plugins: [plugin],
            externals: Array.from(builtinModules),
            optimization: {
                minimize: false
            }
        });

        return new Promise<void>((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(new Error(stats.toString()));
                    return;
                }                // Read the output file directly
                const outputPath = join(fixture.testDir, 'dist', 'bundle.js');

                let source: string;
                try {
                    source = readFileSync(outputPath, 'utf8');
                } catch (readErr) {
                    reject(new Error(`Failed to read output file: ${readErr}`));
                    return;
                }

                expect(source).toBeDefined();
                expect(typeof source).toBe('string');
                expect(source).toContain('test:commonjs');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should integrate with webpack and transform basic modules', async () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            plugins: [plugin],
            externals: Array.from(builtinModules),
            optimization: {
                minimize: false
            }
        });

        return new Promise<void>((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(new Error(stats.toString()));
                    return;
                }

                const compilation = stats?.compilation;
                if (!compilation) {
                    reject(new Error('No compilation found'));
                    return;
                }                // Read the output file directly
                const outputPath = join(fixture.testDir, 'dist', 'bundle.js');

                let source: string;
                try {
                    source = readFileSync(outputPath, 'utf8');
                } catch (readErr) {
                    reject(new Error(`Failed to read output file: ${readErr}`));
                    return;
                }

                expect(source).toBeDefined();
                expect(typeof source).toBe('string');
                expect(source).toContain('test:function');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should integrate with webpack and transform MJS modules', async () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const plugin = codeTransformerPlugin({
            instrumentations: [testCase.instrumentation]
        });

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            plugins: [plugin],
            externals: Array.from(builtinModules),
            optimization: {
                minimize: false
            }
        });

        return new Promise<void>((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (stats?.hasErrors()) {
                    reject(new Error(stats.toString()));
                    return;
                }                // Read the output file directly
                const outputPath = join(fixture.testDir, 'dist', 'bundle.js');

                let source: string;
                try {
                    source = readFileSync(outputPath, 'utf8');
                } catch (readErr) {
                    reject(new Error(`Failed to read output file: ${readErr}`));
                    return;
                }

                expect(source).toBeDefined();
                expect(typeof source).toBe('string');
                expect(source).toContain('test:mjs');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });
});

describe('Webpack injectDiagnostics entry point injection', () => {
    let fixture: MultiEntryFixture;

    beforeEach(() => {
        fixture = createMultiEntryFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    /**
     * Builds two entries that share a vendor chunk and pull in an async chunk,
     * returning every emitted asset keyed by filename.
     */
    function buildAssets(
        extraOptimization: Record<string, unknown> = {},
    ): Promise<Record<string, string>> {
        const outputPath = join(fixture.testDir, 'dist');

        const compiler = webpack({
            mode: 'development',
            devtool: false,
            entry: { a: fixture.entryA, b: fixture.entryB },
            output: { path: outputPath, filename: '[name].js' },
            plugins: [
                codeTransformerPlugin({
                    instrumentations: [multiEntryInstrumentation],
                    injectDiagnostics: diagnosticsSnippet,
                }),
            ],
            externals: Array.from(builtinModules),
            optimization: { minimize: false, ...extraOptimization },
        });

        return new Promise((res, reject) => {
            compiler.run((err, stats) => {
                if (err) return reject(err);
                if (stats?.hasErrors()) return reject(new Error(stats.toString()));

                const assets: Record<string, string> = {};
                for (const name of readdirSync(outputPath)) {
                    assets[name] = readFileSync(join(outputPath, name), 'utf8');
                }
                res(assets);
            });
        });
    }

    it('should emit non-entry chunks alongside the entry bundles', async () => {
        const assets = await buildAssets();

        // Guards the tests below: without an async chunk there would be
        // nothing for the entry point check to exclude.
        expect(Object.keys(assets)).toContain('a.js');
        expect(Object.keys(assets)).toContain('b.js');
        expect(Object.keys(assets).length).toBeGreaterThan(2);
    });

    it('should inject into entry bundles exactly once', async () => {
        const assets = await buildAssets();

        expect(countInjections(assets['a.js'])).toBe(1);
        expect(countInjections(assets['b.js'])).toBe(1);
    });

    it('should not inject into async chunks', async () => {
        const assets = await buildAssets();

        for (const [name, code] of Object.entries(assets)) {
            if (name === 'a.js' || name === 'b.js') continue;
            expect(countInjections(code)).toBe(0);
        }
    });

    it('should not inject into a shared vendor chunk', async () => {
        const assets = await buildAssets({
            splitChunks: { chunks: 'all', minSize: 0 },
        });

        for (const [name, code] of Object.entries(assets)) {
            const expected = name === 'a.js' || name === 'b.js' ? 1 : 0;
            expect(countInjections(code), `asset ${name}`).toBe(expected);
        }
    });

    it('should report the transformed module in every entry bundle', async () => {
        const assets = await buildAssets();

        for (const name of ['a.js', 'b.js']) {
            expect(assets[name]).toContain('transformedModules=test-module');
        }
    });
});
