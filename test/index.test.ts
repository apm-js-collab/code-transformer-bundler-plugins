import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../src/index.js';
import { rollup } from 'rollup';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('rollup-plugin-code-transformer integration tests', () => {
    let testDir: string;
    let moduleDir: string;

    beforeEach(() => {
        // Create a temporary directory for each test
        testDir = join(tmpdir(), `rollup-plugin-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        moduleDir = join(testDir, 'node_modules', 'test-module');

        // Create the module structure
        mkdirSync(moduleDir, { recursive: true });

        // Create a package.json for the test module
        writeFileSync(join(moduleDir, 'package.json'), JSON.stringify({
            name: 'test-module',
            version: '1.2.3',
            main: 'index.js'
        }, null, 2));
    });

    afterEach(() => {
        // Clean up the test directory
        try {
            rmSync(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should create a plugin with the correct name', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        expect(plugin.name).toBe('code-transformer');
    });

    it('should have a transform method', () => {
        const plugin = codeTransformerPlugin({
            instrumentations: []
        });

        expect(typeof plugin.transform).toBe('function');
    });

    it('should handle CommonJS modules correctly', async () => {
        // Create a CommonJS test file in the module
        const testFile = join(moduleDir, 'commonjs.js');
        const testCode = `
const { promisify } = require('util');

function testFunction() {
    return Promise.resolve(42);
}

module.exports = { testFunction };
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:commonjs',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'commonjs.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'cjs' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // Should be transformed with CommonJS-specific handling
        expect(result.code).toContain('test:commonjs');

        // Snapshot the output to verify CommonJS transformation
        expect(result.code).toMatchSnapshot('commonjs-module-output');
    });

    it('should handle ES modules with explicit import/export', async () => {
        // Create an ES module test file
        const testFile = join(moduleDir, 'esmodule.js');
        const testCode = `
import { resolve } from 'path';

export async function testFunction() {
    return Promise.resolve(42);
}

export default { testFunction };
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:esmodule',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'esmodule.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // Should be transformed with ES module-specific handling
        expect(result.code).toContain('test:esmodule');

        // Snapshot the output to verify ES module transformation
        expect(result.code).toMatchSnapshot('esmodule-explicit-output');
    });

    it('should handle .mjs files as ES modules', async () => {
        // Create an .mjs file
        const testFile = join(moduleDir, 'module.mjs');
        const testCode = `
export async function testFunction() {
    return Promise.resolve('mjs module');
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:mjs',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'module.mjs'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // Should be transformed as ES module
        expect(result.code).toContain('test:mjs');

        // Snapshot the output to verify .mjs transformation
        expect(result.code).toMatchSnapshot('mjs-module-output');
    });


    it('should handle mixed module syntax correctly', async () => {
        // Create a file with mixed syntax (should be detected as ES module due to export)
        const testFile = join(moduleDir, 'mixed.js');
        const testCode = `
const fs = require('fs'); // CommonJS require

export async function testFunction() {
    return Promise.resolve(42);
}

// Also has CommonJS-style export (but export keyword makes it ESM)
module.exports.legacy = testFunction;
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:mixed',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'mixed.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // Should be transformed as ES module (export keyword takes precedence)
        expect(result.code).toContain('test:mixed');

        // Snapshot the output to verify mixed syntax handling
        expect(result.code).toMatchSnapshot('mixed-syntax-output');
    });

    it('should skip excluded files during rollup build', async () => {
        const testFile = join(moduleDir, 'index.excluded.js');
        const testCode = `
export function testFunction() {
    return Promise.resolve(42);
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:function',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'index.excluded.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }],
            exclude: ['**/*.excluded.js']
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        // The code should not be transformed due to exclusion, but Rollup may still normalize it
        // Check that our plugin-specific instrumentation is not present
        expect(result.code).not.toContain('test:function');

        // Snapshot the output to verify exact behavior
        expect(result.code).toMatchSnapshot('excluded-file-output');
    });

    it('should skip files outside of node_modules', async () => {
        // Create a file outside of node_modules
        const outsideFile = join(testDir, 'outside.js');
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
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: outsideFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        // The code should not be transformed since it's outside node_modules
        // Check that our plugin-specific instrumentation is not present
        expect(result.code).not.toContain('test:channel');

        // Snapshot the output to verify exact behavior
        expect(result.code).toMatchSnapshot('outside-node-modules-output');
    });

    it('should transform code in matching module with correct version', async () => {
        // Create test file in the module
        const testFile = join(moduleDir, 'index.js');
        const testCode = `
export function testFunction() {
    return Promise.resolve(42);
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:function',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0' as any,
                    filePath: 'index.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true // Mark all imports as external to avoid resolution issues
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // The code should be transformed and include instrumentation
        expect(result.code).toContain('test:function');

        // Snapshot the transformed output to verify instrumentation
        expect(result.code).toMatchSnapshot('transformed-function-output');
    });

    it('should not transform code when version does not match', async () => {
        // Create test file in the module
        const testFile = join(moduleDir, 'index.js');
        const testCode = `
export function testFunction() {
    return Promise.resolve(42);
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:function',
                module: {
                    name: 'test-module',
                    versionRange: '>=2.0.0' as any, // Version doesn't match (module is 1.2.3)
                    filePath: 'index.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        // The code should not be transformed (version doesn't match)
        // Check that our plugin-specific instrumentation is not present
        expect(result.code).not.toContain('test:function');

        // Snapshot the output to verify no instrumentation when version doesn't match
        expect(result.code).toMatchSnapshot('version-mismatch-output');
    });

    it('should not transform code when module name does not match', async () => {
        // Create test file in the module
        const testFile = join(moduleDir, 'index.js');
        const testCode = `
export function testFunction() {
    return Promise.resolve(42);
}
`;
        writeFileSync(testFile, testCode);

        const plugin = codeTransformerPlugin({
            instrumentations: [{
                channelName: 'test:function',
                module: {
                    name: 'different-module', // Different module name
                    versionRange: '>=1.0.0' as any,
                    filePath: 'index.js'
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        // The code should not be transformed (module name doesn't match)
        // Check that our plugin-specific instrumentation is not present
        expect(result.code).not.toContain('test:function');

        // Snapshot the output to verify no instrumentation when module name doesn't match
        expect(result.code).toMatchSnapshot('module-name-mismatch-output');
    });

    it('should handle multiple instrumentations correctly', async () => {
        // Create a more complex module structure
        const libFile = join(moduleDir, 'lib', 'http.js');
        mkdirSync(join(moduleDir, 'lib'), { recursive: true });

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
                        kind: 'Async'
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
                        kind: 'Async'
                    }
                }
            ]
        });

        const bundle = await rollup({
            input: libFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        expect(typeof result.code).toBe('string');
        // Should be transformed with both instrumentations
        expect(result.code).toContain('http:fetch');
        expect(result.code).toContain('http:post');

        // Snapshot the output to verify multiple instrumentations
        expect(result.code).toMatchSnapshot('multiple-instrumentations-output');
    });

    it('should handle complex semver ranges correctly', async () => {
        // Update the package.json to version 1.5.2
        writeFileSync(join(moduleDir, 'package.json'), JSON.stringify({
            name: 'test-module',
            version: '1.5.2',
            main: 'index.js'
        }, null, 2));

        const testFile = join(moduleDir, 'index.js');
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
                    kind: 'Async'
                }
            }]
        });

        const bundle = await rollup({
            input: testFile,
            plugins: [plugin],
            external: () => true
        });

        const { output } = await bundle.generate({ format: 'es' });
        const result = output[0];

        expect(result.code).toBeDefined();
        // Should be transformed since version 1.5.2 matches ^1.5.0
        expect(result.code).toContain('test:complex');

        // Snapshot the output to verify semver range matching
        expect(result.code).toMatchSnapshot('semver-range-match-output');
    });
});
