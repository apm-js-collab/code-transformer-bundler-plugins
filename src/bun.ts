import { readFileSync, writeFileSync } from 'node:fs';
import {
    createCodeTransformer,
    isJsFile,
    type CodeTransformerPluginOptions,
} from './core';
import type { Plugin } from 'esbuild';

/**
 * The subset of Bun's `PluginBuilder` we rely on beyond what esbuild's `Plugin`
 * type describes. `onEnd` and `config` are only present when the plugin runs
 * inside `Bun.build()`; the runtime `Bun.plugin()` builder has neither.
 */
type BunPluginBuilder = {
    onEnd?: (callback: (result: BunBuildOutput) => void) => unknown;
    config?: { outdir?: string };
};

type BunBuildOutput = {
    success: boolean;
    outputs: Array<{ path: string; kind: string }>;
};

function loaderForPath(path: string): 'ts' | 'tsx' | 'jsx' | 'js' {
    if (path.endsWith('.tsx')) return 'tsx';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.ts') || path.endsWith('.cts') || path.endsWith('.mts'))
        return 'ts';
    return 'js';
}

// Narrow filter to only files inside node_modules of an instrumented
// package. Bun's onLoad requires returning an object, and re-emitting
// contents for unrelated CJS modules (e.g. transitive dependencies of
// the transformer itself, like `source-map`) can cause Bun to lose their
// exports — so we exclude them from interception entirely.
function buildFilter(options: CodeTransformerPluginOptions): RegExp {
    const names = Array.from(
        new Set(options.instrumentations.map((i) => i.module.name)),
    ).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (names.length === 0) return /(?!)/;
    const alt = names.join('|');
    return new RegExp(
        `node_modules[/\\\\](?:${alt})[/\\\\].*\\.(?:cjs|mjs|cts|mts|tsx|jsx|ts|js)$`,
    );
}

export default function codeTransformerBun(
    options: CodeTransformerPluginOptions,
): Plugin {
    const filter = buildFilter(options);

    return {
        name: 'code-transformer',
        setup(build) {
            let transformer = createCodeTransformer(options);
            const bunBuild = build as unknown as BunPluginBuilder;

            if (typeof build.onStart === 'function') {
                build.onStart(() => {
                    transformer = createCodeTransformer(options);
                });
            }

            build.onLoad({ filter, namespace: 'file' }, (args) => {
                const contents = readFileSync(args.path, 'utf8');
                const result = transformer.transform(contents, args.path);
                const loader = loaderForPath(args.path);
                return { contents: result ? result.code : contents, loader };
            });

            if (!options.injectDiagnostics) {
                return;
            }

            if (typeof bunBuild.onEnd !== 'function') {
                console.warn(
                    "'injectDiagnostics' is not supported when the plugin is registered at runtime via 'Bun.plugin()' because there is no bundle to inject into. Use it with 'Bun.build()'.",
                );
                return;
            }

            // Bun exposes built artifacts as immutable Blobs, so entry points can
            // only be rewritten once they have been written to disk. `onEnd` runs
            // after that write, but only an `outdir` build performs one.
            if (!bunBuild.config?.outdir) {
                console.warn(
                    "'injectDiagnostics' requires an 'outdir' in the 'Bun.build()' config because in-memory build outputs cannot be modified.",
                );
                return;
            }

            bunBuild.onEnd((result) => {
                if (!result.success) {
                    return;
                }

                const injectCode = transformer.getCodeToInject();

                if (!injectCode) {
                    return;
                }

                for (const artifact of result.outputs) {
                    if (
                        artifact.kind !== 'entry-point' ||
                        !isJsFile(artifact.path)
                    ) {
                        continue;
                    }

                    const code = readFileSync(artifact.path, 'utf8');
                    writeFileSync(artifact.path, injectCode + code);
                }
            });
        },
    };
}

export type { CodeTransformerPluginOptions } from './core';
