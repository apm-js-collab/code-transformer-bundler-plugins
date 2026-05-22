import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import codeTransformerPlugin from '../dist/esm/webpack.mjs';
import webpack from 'webpack';
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { createTestFixture, commonTestCases, type TestFixture } from './test-utils.js';
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
