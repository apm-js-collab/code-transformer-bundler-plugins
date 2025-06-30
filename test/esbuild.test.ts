import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../dist/esm/esbuild.js';
import { build } from 'esbuild';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { createTestFixture, commonTestCases, type TestFixture } from './test-utils.js';
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
