import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../dist/esm/vite.js';
import { build } from 'vite';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { createTestFixture, commonTestCases, type TestFixture } from './test-utils.js';
import { builtinModules } from 'module';

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

    it('should have a transform method', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        // The plugin can be a single plugin or an array, check the first plugin
        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        expect(typeof firstPlugin.transform).toBe('function');
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
                    versionRange: '>=2.0.0' as any // Version doesn't match (module is 1.2.3)
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
