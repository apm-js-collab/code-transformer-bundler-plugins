import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../src/rollup.js';
import { rollup } from 'rollup';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { builtinModules } from 'module';
import { createTestFixture, commonTestCases, type TestFixture } from './test-utils.js';

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

    it('should have a transform method', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        // The plugin can be a single plugin or an array, check the first plugin
        const firstPlugin = Array.isArray(plugin) ? plugin[0] : plugin;
        expect(typeof firstPlugin.transform).toBe('function');
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
});
