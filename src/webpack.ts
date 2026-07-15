import type { Compiler } from 'webpack';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
    type CodeTransformerPluginOptions,
} from './core';
import { serializeInstrumentations } from './instrumentation-serde';

const __dirname = dirname(fileURLToPath(import.meta.url));

// dist/esm/webpack.mjs → dist/cjs/webpack-loader.cjs
// dist/cjs/webpack.cjs → dist/cjs/webpack-loader.cjs
const LOADER_PATH = resolve(__dirname, '..', 'cjs', 'webpack-loader.cjs');
const DIAGNOSTICS_STATE_KEY = '__codeTransformerWebpackDiagnostics';

type DiagnosticsState = {
    transformedModules: Set<string>;
    failedModules: Set<string>;
};

/**
 * Asset names of the chunk holding each entry module. Deliberately not
 * `entrypoint.getFiles()`, which also lists the initial chunks an entry
 * depends on, and not `compilation.getAssets()`, which lists async chunks too.
 */
function entryAssetNames(compilation: any): Set<string> {
    const names = new Set<string>();

    for (const entrypoint of compilation.entrypoints.values()) {
        const chunk = entrypoint.getEntrypointChunk?.();

        for (const file of chunk?.files ?? []) {
            names.add(file);
        }
    }

    return names;
}

class CodeTransformerWebpackPlugin {
    private readonly options: CodeTransformerPluginOptions;

    constructor(options: CodeTransformerPluginOptions) {
        this.options = options;
    }

    apply(compiler: Compiler) {
        const webpack = (compiler as any).webpack;

        compiler.options.module = compiler.options.module || ({ rules: [] } as any);
        compiler.options.module.rules = compiler.options.module.rules || [];
        // Pass only what the loader reads, in JSON-serializable form —
        // callbacks and RegExp instances would break bundlers that serialize
        // loader options (e.g. Turbopack).
        compiler.options.module.rules.unshift({
            test: /\.(c|m)?jsx?$|\.tsx?$/,
            enforce: 'pre',
            use: [
                {
                    loader: LOADER_PATH,
                    options: {
                        instrumentations: serializeInstrumentations(this.options.instrumentations),
                        ...(this.options.dcModule ? { dcModule: this.options.dcModule } : {}),
                    },
                },
            ],
        });

        if (this.options.injectDiagnostics) {
            const ConcatSource = webpack?.sources?.ConcatSource;

            if (ConcatSource && webpack?.Compilation) {
                compiler.hooks.thisCompilation.tap('code-transformer', (compilation: any) => {
                    compilation[DIAGNOSTICS_STATE_KEY] = {
                        transformedModules: new Set<string>(),
                        failedModules: new Set<string>(),
                    } satisfies DiagnosticsState;

                    compilation.hooks.processAssets.tap(
                        {
                            name: 'code-transformer',
                            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
                        },
                        () => {
                            const state: DiagnosticsState | undefined = compilation[DIAGNOSTICS_STATE_KEY];

                            if (!state) {
                                return;
                            }

                            const injectCode = this.options.injectDiagnostics?.({
                                transformedModules: Array.from(state.transformedModules),
                                failedModules: Array.from(state.failedModules),
                            });

                            if (!injectCode) {
                                return;
                            }

                            for (const assetName of entryAssetNames(compilation)) {
                                if (!/\.(js|ts|jsx|tsx|mjs|cjs)(\?[^?]*)?(#[^#]*)?$/.test(assetName)) {
                                    continue;
                                }

                                compilation.updateAsset(
                                    assetName,
                                    (source: any) => new ConcatSource(injectCode, source),
                                );
                            }
                        },
                    );
                });
            }
        }
    }
}

export default function codeTransformerWebpack(
    options: CodeTransformerPluginOptions,
): CodeTransformerWebpackPlugin {
    return new CodeTransformerWebpackPlugin(options);
}

export type { CodeTransformerPluginOptions } from './core';
