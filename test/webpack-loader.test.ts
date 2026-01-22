import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import webpack from 'webpack';
import { join } from 'path';
import { writeFileSync, readFileSync } from 'fs';
import { createTestFixture, commonTestCases, type TestFixture } from './test-utils.js';
import { builtinModules } from 'module';

describe('Webpack loader tests', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('should transform ES modules using webpack loader API', async () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            module: {
                rules: [
                    {
                        test: /\.js$/,
                        use: {
                            loader: require.resolve('../dist/cjs/webpack-loader.cjs'),
                            options: {
                                instrumentations: [testCase.instrumentation]
                            }
                        }
                    }
                ]
            },
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
                expect(source).toContain('test:esmodule');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should transform CommonJS modules using webpack loader API', async () => {
        const testCase = commonTestCases.commonjs;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            module: {
                rules: [
                    {
                        test: /\.js$/,
                        use: {
                            loader: require.resolve('../dist/cjs/webpack-loader.cjs'),
                            options: {
                                instrumentations: [testCase.instrumentation]
                            }
                        }
                    }
                ]
            },
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
                expect(source).toContain('test:commonjs');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should transform basic modules using webpack loader API', async () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            module: {
                rules: [
                    {
                        test: /\.js$/,
                        use: {
                            loader: require.resolve('../dist/cjs/webpack-loader.cjs'),
                            options: {
                                instrumentations: [testCase.instrumentation]
                            }
                        }
                    }
                ]
            },
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
                expect(source).toContain('test:function');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should transform MJS modules using webpack loader API', async () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            module: {
                rules: [
                    {
                        test: /\.mjs$/,
                        use: {
                            loader: require.resolve('../dist/cjs/webpack-loader.cjs'),
                            options: {
                                instrumentations: [testCase.instrumentation]
                            }
                        }
                    }
                ]
            },
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
                expect(source).toContain('test:mjs');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });

    it('should pass through files that do not match any instrumentation', async () => {
        const testFile = join(fixture.moduleDir, 'no-match.js');
        writeFileSync(testFile, `
export function unmatchedFunction() {
    return 'no instrumentation';
}
`);

        const compiler = webpack({
            mode: 'production',
            entry: testFile,
            output: {
                path: join(fixture.testDir, 'dist'),
                filename: 'bundle.js'
            },
            module: {
                rules: [
                    {
                        test: /\.js$/,
                        use: {
                            loader: require.resolve('../dist/cjs/webpack-loader.cjs'),
                            options: {
                                instrumentations: [
                                    {
                                        channelName: 'test:different',
                                        module: {
                                            name: 'test-module',
                                            versionRange: '>=1.0.0' as any,
                                            filePath: 'different.js'  // Different file
                                        },
                                        functionQuery: {
                                            functionName: 'differentFunction',
                                            kind: 'Sync' as const
                                        }
                                    }
                                ]
                            }
                        }
                    }
                ]
            },
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
                // Should not contain the channel name since it doesn't match
                expect(source).not.toContain('test:different');

                compiler.close(() => {
                    resolve();
                });
            });
        });
    });
});
