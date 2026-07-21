import type { Plugin } from 'vite';
import type { CodeTransformerPluginOptions } from './core.js';
import codeTransformerRollup from './rollup.js'; // Ensure rollup types are included for TransformResult

export default function codeTransformerVite(
    options: CodeTransformerPluginOptions,
): Plugin { 
    return {
        enforce: 'pre',
        ...codeTransformerRollup(options) as Plugin,
    };
}

export type { CodeTransformerPluginOptions } from './core.js';
