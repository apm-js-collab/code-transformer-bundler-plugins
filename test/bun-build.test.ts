import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import codeTransformerPlugin from '../dist/esm/bun.mjs';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';
import {
    createTestFixture,
    commonTestCases,
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
): RunBunBuildResult {
    mkdirSync(outdir, { recursive: true });
    const runnerPath = join(outdir, '__bun_runner.mjs');
    const script = `
import codeTransformerBun from ${JSON.stringify(pluginPath)};
const result = await Bun.build({
    entrypoints: [${JSON.stringify(entry)}],
    outdir: ${JSON.stringify(outdir)},
    target: 'node',
    external: ${JSON.stringify(builtinModules)},
    plugins: [codeTransformerBun({ instrumentations: ${JSON.stringify(instrumentations)} })],
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
