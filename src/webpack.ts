import type { Compiler } from 'webpack';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createHash } from 'crypto';
import {
    type CodeTransformerPluginOptions,
} from './core.js';
import { serializeInstrumentations } from './instrumentation-serde.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// dist/esm/webpack.mjs → dist/cjs/webpack-loader.cjs
// dist/cjs/webpack.cjs → dist/cjs/webpack-loader.cjs
const LOADER_PATH = resolve(__dirname, '..', 'cjs', 'webpack-loader.cjs');
const DIAGNOSTICS_STATE_KEY = '__codeTransformerWebpackDiagnostics';

export interface CodeTransformerWebpackPluginOptions extends CodeTransformerPluginOptions {
    /**
     * The loader webpack should run, as a resolved path or a specifier
     * resolvable from the compiler's context. Defaults to this package's own
     * loader.
     *
     * Point this at a loader module built with `createLoader` from the
     * `/webpack-loader-factory` export when loader options cannot carry
     * `customTransforms` — under Turbopack, or with worker-based loaders such
     * as `thread-loader`, which serialize them.
     */
    loaderPath?: string;
    /**
     * An arbitrary string folded into the loader's cache key, for use with
     * `cache: { type: 'filesystem' }`.
     *
     * The key already covers the instrumentations and the source text of every
     * custom transform, so editing either invalidates cached modules. What it
     * cannot see is data a transform reads without naming it — a captured
     * variable, or a module-scope table of snippets. Bump this when such data
     * changes, or derive it from the data itself.
     */
    cacheVersion?: string;
}

/**
 * A stable identity for a set of loader options.
 *
 * Webpack keys a loader by its ruleset ident, not by the contents of its
 * options, so with `cache: { type: 'filesystem' }` a changed config would
 * otherwise reuse modules built by the previous one. Deriving the ident from
 * the options makes the module identifier change with them.
 *
 * A transform's captured variables are invisible to `toString`, so a factory
 * that returns textually identical functions for different inputs still hashes
 * the same. `cacheVersion` is the escape hatch for that; binding the transforms
 * with `createLoader` is the other, since webpack tracks the loader file's own
 * contents.
 */
function loaderIdent(
    options: {
        instrumentations: unknown;
        dcModule?: string;
        customTransforms?: Record<string, (...args: any[]) => void>;
    },
    cacheVersion?: string,
): string {
    const hash = createHash('sha256');

    hash.update(JSON.stringify(options.instrumentations));
    hash.update(options.dcModule ?? '');
    hash.update(cacheVersion ?? '');

    for (const name of Object.keys(options.customTransforms ?? {}).sort()) {
        hash.update(name);
        hash.update(String(options.customTransforms?.[name]));
    }

    return `code-transformer-${hash.digest('hex').slice(0, 16)}`;
}

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
    private readonly options: CodeTransformerWebpackPluginOptions;

    constructor(options: CodeTransformerWebpackPluginOptions) {
        this.options = options;
    }

    apply(compiler: Compiler) {
        const webpack = (compiler as any).webpack;

        compiler.options.module = compiler.options.module || ({ rules: [] } as any);
        compiler.options.module.rules = compiler.options.module.rules || [];

        // Pass only what the loader reads. Webpack hands loader options to the
        // loader by reference, so `customTransforms` arrives intact; everything
        // else stays JSON-serializable, keeping the options usable as-is by
        // bundlers that serialize them (e.g. Turbopack) when no custom
        // transforms are configured.
        const loaderOptions = {
            instrumentations: serializeInstrumentations(this.options.instrumentations),
            ...(this.options.dcModule ? { dcModule: this.options.dcModule } : {}),
            ...(this.options.customTransforms
                ? { customTransforms: this.options.customTransforms }
                : {}),
        };

        compiler.options.module.rules.unshift({
            test: /\.(c|m)?jsx?$|\.tsx?$/,
            enforce: 'pre',
            use: [
                {
                    loader: this.options.loaderPath ?? LOADER_PATH,
                    options: loaderOptions,
                    // Without this webpack derives the ident from the rule's
                    // position, so a persistent cache survives a config change.
                    ident: loaderIdent(loaderOptions, this.options.cacheVersion),
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
    options: CodeTransformerWebpackPluginOptions,
): CodeTransformerWebpackPlugin {
    return new CodeTransformerWebpackPlugin(options);
}

export type { CodeTransformerPluginOptions } from './core.js';
