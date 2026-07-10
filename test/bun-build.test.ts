import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../dist/esm/bun.mjs';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';
import {
    createTestFixture,
    createMultiEntryFixture,
    commonTestCases,
    countInjections,
    DIAGNOSTICS_MARKER,
    multiEntryInstrumentation,
    type MultiEntryFixture,
    type TestFixture,
} from './test-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginPath = resolve(__dirname, '..', 'dist', 'esm', 'bun.mjs');

const hasBun = (() => {
    try {
        const r = spawnSync('bun', ['--version'], { encoding: 'utf8' });
        return r.status === 0;
    } catch {
        return false;
    }
})();

const describeIfBun = hasBun ? describe : describe.skip;

interface RunBunBuildResult {
    status: number | null;
    stdout: string;
    stderr: string;
    output: string;
}

function runBunBuild(
    entry: string,
    outdir: string,
    instrumentations: unknown[],
    withDiagnosticsInjection = false,
): RunBunBuildResult {
    mkdirSync(outdir, { recursive: true });
    const runnerPath = join(outdir, '__bun_runner.mjs');
    const diagnosticsConfig = withDiagnosticsInjection
        ? `,
    injectDiagnostics: (diagnostics) => "console.log('Diagnostics: transformedModules=" + diagnostics.transformedModules.join(',') + ", failedModules=" + diagnostics.failedModules.join(',') + "');"`
        : '';
    const script = `
import codeTransformerBun from ${JSON.stringify(pluginPath)};
const result = await Bun.build({
    entrypoints: [${JSON.stringify(entry)}],
    outdir: ${JSON.stringify(outdir)},
    target: 'node',
    external: ${JSON.stringify(builtinModules)},
    plugins: [codeTransformerBun({ instrumentations: ${JSON.stringify(instrumentations)}${diagnosticsConfig} })],
});
if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    process.exit(1);
}
`;
    writeFileSync(runnerPath, script);
    const r = spawnSync('bun', [runnerPath], { encoding: 'utf8' });

    let output = '';
    if (r.status === 0) {
        const files = readdirSync(outdir).filter(
            (f) => f.endsWith('.js') && f !== '__bun_runner.mjs',
        );
        if (files.length > 0) {
            output = readFileSync(join(outdir, files[0]), 'utf8');
        }
    }
    return {
        status: r.status,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
        output,
    };
}

describe('Bun plugin shape', () => {
    it('should create a plugin with the correct name', () => {
        const plugin = codeTransformerPlugin({ instrumentations: [] });
        expect(plugin.name).toBe('code-transformer');
    });

    it('should have a setup method', () => {
        const plugin = codeTransformerPlugin({ instrumentations: [] });
        expect(typeof plugin.setup).toBe('function');
    });
});

describeIfBun('Bun integration tests', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('should integrate with Bun and transform ES modules', () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const r = runBunBuild(testFile, join(fixture.testDir, 'out'), [
            testCase.instrumentation,
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).toContain('test:esmodule');
    });

    it('should integrate with Bun and transform .mjs files', () => {
        const testCase = commonTestCases.mjsModule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const r = runBunBuild(testFile, join(fixture.testDir, 'out'), [
            testCase.instrumentation,
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).toContain('test:mjs');
    });

    it('should integrate with Bun and transform CommonJS modules', () => {
        const testCase = commonTestCases.commonjs;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const r = runBunBuild(testFile, join(fixture.testDir, 'out'), [
            testCase.instrumentation,
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).toContain('test:commonjs');
    });

    it('should inject diagnostics code with Bun', () => {
        const testCase = commonTestCases.esmodule;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const r = runBunBuild(
            testFile,
            join(fixture.testDir, 'out'),
            [testCase.instrumentation],
            true,
        );
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).toContain('transformedModules=test-module');
    });

    it('should not transform files outside node_modules', () => {
        const outsideFile = join(fixture.testDir, 'outside.js');
        writeFileSync(
            outsideFile,
            `export function testFunction() { return Promise.resolve(42); }\n`,
        );

        const r = runBunBuild(outsideFile, join(fixture.testDir, 'out'), [
            {
                channelName: 'test:channel',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0',
                    filePath: 'outside.js',
                },
                functionQuery: {
                    functionName: 'testFunction',
                    kind: 'Async',
                },
            },
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).not.toContain('test:channel');
    });

    it('should handle version mismatches correctly', () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const r = runBunBuild(testFile, join(fixture.testDir, 'out'), [
            {
                ...testCase.instrumentation,
                module: {
                    ...testCase.instrumentation.module,
                    versionRange: '>=2.0.0', // does not match 1.2.3
                },
            },
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).not.toContain('test:function');
    });

    it('should handle multiple instrumentations correctly', () => {
        const libFile = join(fixture.moduleDir, 'lib', 'http.js');
        mkdirSync(join(fixture.moduleDir, 'lib'), { recursive: true });
        writeFileSync(
            libFile,
            `
export class HttpClient {
    async fetch(url) { return { status: 200, data: 'test' }; }
    async post(url, data) { return { status: 201, data: 'created' }; }
}
`,
        );

        const r = runBunBuild(libFile, join(fixture.testDir, 'out'), [
            {
                channelName: 'http:fetch',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0',
                    filePath: 'lib/http.js',
                },
                functionQuery: {
                    className: 'HttpClient',
                    methodName: 'fetch',
                    kind: 'Async',
                },
            },
            {
                channelName: 'http:post',
                module: {
                    name: 'test-module',
                    versionRange: '>=1.0.0',
                    filePath: 'lib/http.js',
                },
                functionQuery: {
                    className: 'HttpClient',
                    methodName: 'post',
                    kind: 'Async',
                },
            },
        ]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.output).toContain('http:fetch');
        expect(r.output).toContain('http:post');
    });
});

/** Source text of the `injectDiagnostics` callback, embedded in the Bun runner. */
const INJECT_FN = `(d) => "console.log('${DIAGNOSTICS_MARKER} transformedModules=" + d.transformedModules.join('|') + " failedModules=" + d.failedModules.join('|') + "');"`;

const OUTPUTS_PREFIX = '__OUTPUTS__';

interface BunArtifact {
    path: string;
    kind: string;
}

/** Runs a Bun script and returns its exit status, stderr and parsed stdout. */
function runBunScript(
    scriptPath: string,
    source: string,
): { status: number | null; stderr: string; stdout: string } {
    writeFileSync(scriptPath, source);
    const r = spawnSync('bun', [scriptPath], { encoding: 'utf8' });
    return {
        status: r.status,
        stderr: r.stderr ?? '',
        stdout: r.stdout ?? '',
    };
}

describeIfBun('Bun injectDiagnostics entry point injection', () => {
    let fixture: MultiEntryFixture;
    let outdir: string;

    beforeEach(() => {
        fixture = createMultiEntryFixture();
        outdir = join(fixture.testDir, 'out');
        mkdirSync(outdir, { recursive: true });
    });

    afterEach(() => {
        fixture.cleanup();
    });

    /** Builds both entries with splitting on and returns the emitted artifacts. */
    function buildMultiEntry(): { artifacts: BunArtifact[]; stderr: string } {
        const script = `
import codeTransformerBun from ${JSON.stringify(pluginPath)};
const result = await Bun.build({
    entrypoints: [${JSON.stringify(fixture.entryA)}, ${JSON.stringify(fixture.entryB)}],
    outdir: ${JSON.stringify(outdir)},
    target: 'node',
    splitting: true,
    external: ${JSON.stringify(builtinModules)},
    plugins: [codeTransformerBun({
        instrumentations: ${JSON.stringify([multiEntryInstrumentation])},
        injectDiagnostics: ${INJECT_FN},
    })],
});
if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    process.exit(1);
}
console.log('${OUTPUTS_PREFIX}' + JSON.stringify(result.outputs.map((o) => ({ path: o.path, kind: o.kind }))));
`;
        const r = runBunScript(join(outdir, '__runner.mjs'), script);
        expect(r.status).toBe(0);

        const line = r.stdout
            .split('\n')
            .find((l) => l.startsWith(OUTPUTS_PREFIX));

        return {
            artifacts: JSON.parse(line!.slice(OUTPUTS_PREFIX.length)),
            stderr: r.stderr,
        };
    }

    const jsArtifacts = (artifacts: BunArtifact[]) =>
        artifacts.filter((a) => a.path.endsWith('.js'));

    it('should emit a non-entry chunk alongside the entry points', () => {
        const { artifacts } = buildMultiEntry();
        const js = jsArtifacts(artifacts);

        // Guards the tests below: without a shared chunk there would be
        // nothing for the entry point check to exclude.
        expect(js.filter((a) => a.kind === 'entry-point')).toHaveLength(2);
        expect(js.filter((a) => a.kind !== 'entry-point').length).toBeGreaterThan(0);
    });

    it('should inject into entry points exactly once and no other chunk', () => {
        const { artifacts } = buildMultiEntry();

        for (const artifact of jsArtifacts(artifacts)) {
            const code = readFileSync(artifact.path, 'utf8');
            const expected = artifact.kind === 'entry-point' ? 1 : 0;
            expect(countInjections(code), `artifact ${artifact.path}`).toBe(expected);
        }
    });

    it('should report the transformed module, not an empty diagnostics payload', () => {
        const { artifacts } = buildMultiEntry();
        const entries = jsArtifacts(artifacts).filter(
            (a) => a.kind === 'entry-point',
        );

        for (const entry of entries) {
            const code = readFileSync(entry.path, 'utf8');
            expect(code).toContain('transformedModules=test-module');
        }
    });

    it('should warn and skip injection when the build has no outdir', () => {
        const script = `
import codeTransformerBun from ${JSON.stringify(pluginPath)};
const result = await Bun.build({
    entrypoints: [${JSON.stringify(fixture.entryA)}],
    target: 'node',
    external: ${JSON.stringify(builtinModules)},
    plugins: [codeTransformerBun({
        instrumentations: ${JSON.stringify([multiEntryInstrumentation])},
        injectDiagnostics: ${INJECT_FN},
    })],
});
if (!result.success) process.exit(1);
console.log('${OUTPUTS_PREFIX}' + (await result.outputs[0].text()).includes('${DIAGNOSTICS_MARKER}'));
`;
        const r = runBunScript(join(outdir, '__no_outdir.mjs'), script);

        expect(r.status).toBe(0);
        expect(r.stderr).toContain("requires an 'outdir'");
        expect(r.stdout).toContain(`${OUTPUTS_PREFIX}false`);
    });

    it('should warn when registered at runtime via Bun.plugin', () => {
        const script = `
import { plugin } from 'bun';
import codeTransformerBun from ${JSON.stringify(pluginPath)};
plugin(codeTransformerBun({
    instrumentations: ${JSON.stringify([multiEntryInstrumentation])},
    injectDiagnostics: ${INJECT_FN},
}));
console.log('registered');
`;
        const r = runBunScript(join(outdir, '__runtime.mjs'), script);

        expect(r.status).toBe(0);
        expect(r.stdout).toContain('registered');
        expect(r.stderr).toContain("'injectDiagnostics' is not supported");
    });
});
