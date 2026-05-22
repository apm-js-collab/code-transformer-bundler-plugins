import type { Plugin } from 'esbuild';
import { readFileSync } from 'fs';
import {
    createCodeTransformer,
    type CodeTransformerPluginOptions,
} from './core';

export default function codeTransformerEsbuild(
    options: CodeTransformerPluginOptions,
): Plugin {
    return {
        name: 'code-transformer',
        setup(build) {
            const transform = createCodeTransformer(options);

            build.onLoad({ filter: /\.(c|m)?js$|\.tsx?$/ }, (args) => {
                const code = readFileSync(args.path, 'utf8');
                const result = transform(code, args.path);
                if (!result) return null;

                return {
                    contents: result.code,
                    loader: 'default',
                };
            });
        },
    };
}

export type { CodeTransformerPluginOptions } from './core';
