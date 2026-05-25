import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
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

describeIfBun('Bun run (Bun.plugin) tests', () => {
    let fixture: TestFixture;

    beforeEach(() => {
        fixture = createTestFixture();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('instruments modules imported under `bun run --import=plugin`', () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const pluginFile = join(fixture.testDir, 'plugin.ts');
        writeFileSync(
            pluginFile,
            `import codeTransformerBun from ${JSON.stringify(pluginPath)};
import { plugin } from 'bun';
plugin(codeTransformerBun({ instrumentations: ${JSON.stringify([testCase.instrumentation])} }));
`,
        );

        const moduleName = testCase.instrumentation.module.name;
        const channelName = testCase.instrumentation.channelName;
        const tracingBase = `orchestrion:${moduleName}:${channelName}`;

        const appFile = join(fixture.testDir, 'app.ts');
        writeFileSync(
            appFile,
            `import { tracingChannel } from 'node:diagnostics_channel';
const tc = tracingChannel(${JSON.stringify(tracingBase)});
const events = [];
tc.subscribe({
    start: () => events.push('start'),
    end: () => events.push('end'),
    asyncStart: () => events.push('asyncStart'),
    asyncEnd: () => events.push('asyncEnd'),
    error: (_, name) => events.push('error:' + name),
});
const mod = await import('test-module');
const result = await mod.testFunction();
console.log('RESULT:' + result);
console.log('EVENTS:' + events.join(','));
`,
        );

        const r = spawnSync(
            'bun',
            ['run', `--import=${pluginFile}`, appFile],
            { cwd: fixture.testDir, encoding: 'utf8' },
        );

        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('RESULT:42');
        // Async function should emit start, end, asyncStart, asyncEnd
        expect(r.stdout).toContain('EVENTS:start,end,asyncStart,asyncEnd');
    });

    it('passes through modules that do not match any instrumentation', () => {
        const testCase = commonTestCases.basic;
        const testFile = join(fixture.moduleDir, testCase.filename);
        writeFileSync(testFile, testCase.code);

        const pluginFile = join(fixture.testDir, 'plugin.ts');
        writeFileSync(
            pluginFile,
            `import codeTransformerBun from ${JSON.stringify(pluginPath)};
import { plugin } from 'bun';
plugin(codeTransformerBun({
    instrumentations: [{
        channelName: 'other:channel',
        module: { name: 'other-module', versionRange: '>=1.0.0', filePath: 'other.js' },
        functionQuery: { functionName: 'other', kind: 'Async' },
    }],
}));
`,
        );

        const appFile = join(fixture.testDir, 'app.ts');
        writeFileSync(
            appFile,
            `import { tracingChannel } from 'node:diagnostics_channel';
const tc = tracingChannel('orchestrion:test-module:test:function');
const events = [];
tc.subscribe({
    start: () => events.push('start'),
    end: () => events.push('end'),
    asyncStart: () => events.push('asyncStart'),
    asyncEnd: () => events.push('asyncEnd'),
});
const mod = await import('test-module');
const result = await mod.testFunction();
console.log('RESULT:' + result);
console.log('EVENTS:' + events.join(','));
`,
        );

        const r = spawnSync(
            'bun',
            ['run', `--import=${pluginFile}`, appFile],
            { cwd: fixture.testDir, encoding: 'utf8' },
        );

        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('RESULT:42');
        // No instrumentation for test-module → no events fired
        expect(r.stdout).toContain('EVENTS:\n');
    });
});
