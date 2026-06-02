import type { Plugin } from 'vite';
import type { CodeTransformerPluginOptions } from './core';
import codeTransformerRollup from './rollup'; // Ensure rollup types are included for TransformResult

export default function codeTransformerVite(
    options: CodeTransformerPluginOptions,
): Plugin { 
    return {
        enforce: 'pre',
        ...codeTransformerRollup(options),
    };
}

export type { CodeTransformerPluginOptions } from './core';
