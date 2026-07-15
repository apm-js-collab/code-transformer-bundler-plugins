import { describe, it, expect } from 'vitest';
import {
    serializeInstrumentations,
    deserializeInstrumentations,
    type InstrumentationConfig,
} from '../dist/esm/core.mjs';

function makeConfig(filePath: string | RegExp | { type: 'RegExp'; source: string; flags: string }) {
    return {
        channelName: 'test:channel',
        module: {
            name: 'test-module',
            versionRange: '>=1.0.0',
            filePath,
        },
        functionQuery: {
            functionName: 'testFunction',
            kind: 'Async' as const,
        },
    } as InstrumentationConfig;
}

describe('instrumentation config serialization', () => {
    it('leaves string file paths unchanged', () => {
        const configs = [makeConfig('lib/index.js')];
        expect(serializeInstrumentations(configs)).toEqual(configs);
        expect(deserializeInstrumentations(configs)).toEqual(configs);
    });

    it('converts RegExp file paths to plain objects and back', () => {
        const serialized = serializeInstrumentations([makeConfig(/lib\/.*\.js$/i)]);

        expect(serialized[0]!.module.filePath).toEqual({
            type: 'RegExp',
            source: 'lib\\/.*\\.js$',
            flags: 'i',
        });

        const revived = deserializeInstrumentations(serialized);
        const filePath = revived[0]!.module.filePath as RegExp;
        expect(filePath).toBeInstanceOf(RegExp);
        expect(filePath.source).toBe('lib\\/.*\\.js$');
        expect(filePath.flags).toBe('i');
    });

    it('survives a JSON round-trip', () => {
        const serialized = serializeInstrumentations([makeConfig(/esm\/.*\.mjs$/)]);
        const jsonRoundTripped = JSON.parse(JSON.stringify(serialized));

        expect(jsonRoundTripped).toEqual(serialized);

        const revived = deserializeInstrumentations(jsonRoundTripped);
        expect(revived[0]!.module.filePath).toEqual(/esm\/.*\.mjs$/);
    });

    it('does not mutate the input configs', () => {
        const config = makeConfig(/index\.js$/);
        serializeInstrumentations([config]);
        expect(config.module.filePath).toBeInstanceOf(RegExp);
    });

    it('deserialize passes native RegExp configs through unchanged', () => {
        const configs = [makeConfig(/index\.js$/)];
        expect(deserializeInstrumentations(configs)).toEqual(configs);
    });

    it('deserialize rejects malformed file paths', () => {
        const configs = [makeConfig({ bogus: true } as never)];
        expect(() => deserializeInstrumentations(configs)).toThrow(/filePath/);
    });

    it('deserialize rejects objects missing the RegExp type tag', () => {
        const configs = [makeConfig({ source: 'index\\.js$', flags: '' } as never)];
        expect(() => deserializeInstrumentations(configs)).toThrow(/filePath/);
    });
});
