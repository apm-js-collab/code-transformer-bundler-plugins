import type { Compiler } from 'webpack';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { CodeTransformerPluginOptions } from './core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// dist/esm/webpack.mjs → dist/cjs/webpack-loader.cjs
// dist/cjs/webpack.cjs → dist/cjs/webpack-loader.cjs
const LOADER_PATH = resolve(__dirname, '..', 'cjs', 'webpack-loader.cjs');

class CodeTransformerWebpackPlugin {
    private readonly options: CodeTransformerPluginOptions;

    constructor(options: CodeTransformerPluginOptions) {
        this.options = options;
    }

    apply(compiler: Compiler) {
        compiler.options.module = compiler.options.module || ({ rules: [] } as any);
        compiler.options.module.rules = compiler.options.module.rules || [];
        compiler.options.module.rules.unshift({
            test: /\.(c|m)?jsx?$|\.tsx?$/,
            enforce: 'pre',
            use: [
                {
                    loader: LOADER_PATH,
                    options: this.options,
                },
            ],
        });
    }
}

export default function codeTransformerWebpack(
    options: CodeTransformerPluginOptions,
): CodeTransformerWebpackPlugin {
    return new CodeTransformerWebpackPlugin(options);
}

export type { CodeTransformerPluginOptions } from './core';
