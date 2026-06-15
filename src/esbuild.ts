import type { Plugin } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import {
    createCodeTransformer,
    isJsFile,
    type CodeTransformerPluginOptions,
} from './core';

const filter = /\.(cjs|mjs|cts|mts|tsx|jsx|ts|js)$/;

function shouldInjectOutput(path: string): boolean {
    return path === '<stdout>' || isJsFile(path);
}

export default function codeTransformerEsbuild(
    options: CodeTransformerPluginOptions,
): Plugin {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    return {
        name: 'code-transformer',
        setup(build) {
            let transformer: ReturnType<typeof createCodeTransformer>;

            build.onStart(() => {
                transformer = createCodeTransformer(options);
            });

            build.onLoad({ filter }, (args) => {
                const code = readFileSync(args.path, 'utf8');
                const result = transformer.transform(code, args.path);
                if (!result) return null;

                return {
                    contents: result.code,
                    loader: 'default',
                };
            });

            if (!options.injectDiagnostics) {
                return;
            }

            if (build.initialOptions.write !== false) {
                build.initialOptions.metafile = true;
            }

            build.onEnd((result) => {
                if (result.errors.length > 0) {
                    return;
                }

                const injectCodeRaw = transformer.getCodeToInject();

                if (!injectCodeRaw) {
                    return;
                }

                if (result.outputFiles) {
                    for (const file of result.outputFiles) {
                        if (!shouldInjectOutput(file.path)) {
                            continue;
                        }

                        const code = decoder.decode(file.contents);
                        file.contents = encoder.encode(injectCodeRaw + code);
                    }

                    return;
                }

                if (!result.metafile) {
                    return;
                }

                for (const outputPath of Object.keys(result.metafile.outputs)) {
                    if (!shouldInjectOutput(outputPath)) {
                        continue;
                    }

                    const code = readFileSync(outputPath, 'utf8');
                    writeFileSync(outputPath, injectCodeRaw + code);
                }
            });
        },
    };
}

export type { CodeTransformerPluginOptions } from './core';
