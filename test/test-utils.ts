import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { parse } from 'meriyah';

export interface TestFixture {
    testDir: string;
    moduleDir: string;
    cleanup: () => void;
}

export interface MultiEntryFixture extends TestFixture {
    /** Entry that statically imports the shared module and dynamically imports the lazy one */
    entryA: string;
    /** Entry that statically imports the shared module */
    entryB: string;
    /** Imported by both entries, so it becomes a shared chunk under code splitting */
    sharedFile: string;
    /** Only reachable via dynamic import, so it becomes an async chunk */
    lazyFile: string;
}

/**
 * A unique token that `diagnosticsSnippet` embeds in the injected code so tests
 * can count how many times a chunk was injected into.
 */
export const DIAGNOSTICS_MARKER = 'DIAGNOSTICS_INJECTED_MARKER';

export type Diagnostics = {
    transformedModules: string[];
    failedModules: string[];
};

/** The `injectDiagnostics` callback used across the entry point injection tests. */
export function diagnosticsSnippet(diagnostics: Diagnostics): string {
    return `console.log('${DIAGNOSTICS_MARKER} transformedModules=${diagnostics.transformedModules.join('|')} failedModules=${diagnostics.failedModules.join('|')}');`;
}

/** How many times the diagnostics snippet was injected into `code`. */
export function countInjections(code: string): number {
    return code.split(DIAGNOSTICS_MARKER).length - 1;
}

/** A unique token logged by the fixture tracing library, proving its import was bundled. */
export const INTEGRATION_MARKER = 'INTEGRATION_LIBRARY_MARKER';

export const TRACING_LIBRARY_NAME = 'my-tracing-library';

/**
 * Creates a `my-tracing-library` package inside the fixture's node_modules for
 * injected code to import. Returns the absolute path of its entry file, for
 * bundlers without bare-specifier resolution (plain rollup).
 */
export function createTracingLibraryFixture(fixture: TestFixture): string {
    const dir = join(fixture.testDir, 'node_modules', TRACING_LIBRARY_NAME);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify(
            {
                name: TRACING_LIBRARY_NAME,
                version: '1.0.0',
                type: 'module',
                main: 'index.js',
            },
            null,
            2,
        ),
    );

    const entryFile = join(dir, 'index.js');
    writeFileSync(
        entryFile,
        `export function subscribeTo(name) { console.log('${INTEGRATION_MARKER}', name); }\n`,
    );

    return entryFile;
}

/**
 * A custom transform (orchestrion `addTransform` signature) that injects a
 * per-module snippet at the top of the matched file's Program, after any
 * "use strict" directive — the pattern the README documents. One transform
 * instance serves every injection site by branching on `state.module.name`.
 */
export function programInjectionTransform(snippets: Record<string, string>) {
    return (state: any, node: any): void => {
        const { module: { name }, moduleType } = state;
        const snippet = snippets[name];

        // A file can be matched by several configs; only inject once.
        if (!snippet || node.__integrationInjected) return;
        node.__integrationInjected = true;

        const statements = parse(snippet, { module: moduleType === 'esm' }).body;
        const index = node.body.findIndex(
            (child: any) => child.directive === 'use strict',
        );
        node.body.splice(index + 1, 0, ...statements);
    };
}

/**
 * A custom transform that overrides orchestrion's built-in
 * `tracingChannelImport` — the pattern the README documents. Orchestrion calls
 * it while setting up a file's diagnostics channel, so it only runs for files
 * where a function was really wrapped, and once per channel rather than once
 * per file.
 */
export function tracingChannelImportOverride(snippets: Record<string, string>) {
    return (state: any, program: any): void => {
        // The built-in adds the diagnostics_channel import that the channel
        // declaration orchestrion appends next depends on.
        state.transforms.defaults.tracingChannelImport(state, program);

        const snippet = snippets[state.module.name];

        if (!snippet || program.__integrationInjected) return;
        program.__integrationInjected = true;

        const statements = parse(snippet, { module: state.moduleType === 'esm' }).body;
        const index = program.body.findIndex(
            (node: any) =>
                node.declarations?.[0]?.id?.properties?.[0]?.value?.name ===
                'tr_ch_apm_tracingChannel',
        );

        program.body.splice(index + 1, 0, ...statements);
    };
}

/** Two instrumented functions in one file, so its channel is set up twice. */
export const twoChannelTestCase = {
    filename: 'two-channels.js',
    code: `
export async function alpha() { return 1; }
export async function beta() { return 2; }
`,
    instrumentations: ['alpha', 'beta'].map((fn) => ({
        channelName: `test:${fn}`,
        module: {
            name: 'test-module',
            versionRange: '>=1.0.0' as any,
            filePath: 'two-channels.js',
        },
        functionQuery: { functionName: fn, kind: 'Async' as const },
    })),
};

/**
 * A two-entry app that also produces non-entry chunks: `shared.js` is imported
 * by both entries and `lazy.js` is only reachable through a dynamic import.
 * Both entries pull in the instrumented `test-module` so that the diagnostics
 * payload is non-empty.
 *
 * The instrumented module is referenced by relative path rather than by bare
 * specifier so that no bundler needs a node-resolution plugin.
 */
export function createMultiEntryFixture(): MultiEntryFixture {
    const fixture = createTestFixture();
    const srcDir = join(fixture.testDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    const testCase = commonTestCases.esmodule;
    writeFileSync(join(fixture.moduleDir, testCase.filename), testCase.code);

    const instrumented = `../node_modules/test-module/${testCase.filename}`;

    const sharedFile = join(srcDir, 'shared.js');
    writeFileSync(
        sharedFile,
        `import { testFunction } from '${instrumented}';
export async function shared() { return testFunction(); }
`,
    );

    const lazyFile = join(srcDir, 'lazy.js');
    writeFileSync(lazyFile, `export function lazy() { return 'lazy'; }\n`);

    const entryA = join(srcDir, 'a.js');
    writeFileSync(
        entryA,
        `import { shared } from './shared.js';
export const a = shared().then(() => import('./lazy.js'));
`,
    );

    const entryB = join(srcDir, 'b.js');
    writeFileSync(
        entryB,
        `import { shared } from './shared.js';
export const b = shared();
`,
    );

    return { ...fixture, entryA, entryB, sharedFile, lazyFile };
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

/** The instrumentation matching the module pulled in by `createMultiEntryFixture`. */
export const multiEntryInstrumentation = commonTestCases.esmodule.instrumentation;
