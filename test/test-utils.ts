import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';

export interface TestFixture {
    testDir: string;
    moduleDir: string;
    cleanup: () => void;
}

export function createTestFixture(): TestFixture {
    // Create a temporary directory for each test
    const testDir = join(tmpdir(), `plugin-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    const moduleDir = join(testDir, 'node_modules', 'test-module');

    // Create the module structure
    mkdirSync(moduleDir, { recursive: true });

    // Create a package.json for the test module
    writeFileSync(join(moduleDir, 'package.json'), JSON.stringify({
        name: 'test-module',
        version: '1.2.3',
        main: 'index.js'
    }, null, 2));

    return {
        testDir,
        moduleDir,
        cleanup: () => {
            try {
                rmSync(testDir, { recursive: true, force: true });
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    };
}

export const commonTestCases = {
    commonjs: {
        filename: 'commonjs.js',
        code: `
const { promisify } = require('util');

function testFunction() {
    return Promise.resolve(42);
}

module.exports = { testFunction };
`,
        instrumentation: {
            channelName: 'test:commonjs',
            module: {
                name: 'test-module',
                versionRange: '>=1.0.0' as any,
                filePath: 'commonjs.js'
            },
            functionQuery: {
                functionName: 'testFunction',
                kind: 'Async' as const
            }
        }
    },

    esmodule: {
        filename: 'esmodule.js',
        code: `
import { resolve } from 'path';

export async function testFunction() {
    return Promise.resolve(42);
}

export default { testFunction };
`,
        instrumentation: {
            channelName: 'test:esmodule',
            module: {
                name: 'test-module',
                versionRange: '>=1.0.0' as any,
                filePath: 'esmodule.js'
            },
            functionQuery: {
                functionName: 'testFunction',
                kind: 'Async' as const
            }
        }
    },

    mjsModule: {
        filename: 'module.mjs',
        code: `
export async function testFunction() {
    return Promise.resolve('mjs module');
}
`,
        instrumentation: {
            channelName: 'test:mjs',
            module: {
                name: 'test-module',
                versionRange: '>=1.0.0' as any,
                filePath: 'module.mjs'
            },
            functionQuery: {
                functionName: 'testFunction',
                kind: 'Async' as const
            }
        }
    },

    basic: {
        filename: 'index.js',
        code: `
export function testFunction() {
    return Promise.resolve(42);
}
`,
        instrumentation: {
            channelName: 'test:function',
            module: {
                name: 'test-module',
                versionRange: '>=1.0.0' as any,
                filePath: 'index.js'
            },
            functionQuery: {
                functionName: 'testFunction',
                kind: 'Async' as const
            }
        }
    }
};
