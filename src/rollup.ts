import type { Plugin } from 'rollup';
import {
    createCodeTransformer,
    type CodeTransformerPluginOptions,
} from './core';

export default function codeTransformerRollup(
    options: CodeTransformerPluginOptions,
): Plugin {
    const { transform, dispose } = createCodeTransformer(options);

    return {
        name: 'code-transformer',
        transform(code, id) {
            const result = transform(code, id);
            if (!result) return null;
            return { code: result.code, map: result.map ?? null };
        },
        closeBundle() {
            dispose();
        },
    };
}

export type { CodeTransformerPluginOptions } from './core';
