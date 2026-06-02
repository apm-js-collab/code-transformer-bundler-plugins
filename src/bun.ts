import { readFileSync } from 'node:fs';
import {
    createCodeTransformer,
    type CodeTransformerPluginOptions,
} from './core';
import type { Plugin } from 'esbuild';

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
            const { transform } = createCodeTransformer(options);

            build.onLoad({ filter, namespace: 'file' }, (args) => {
                const contents = readFileSync(args.path, 'utf8');
                const result = transform(contents, args.path);
                const loader = loaderForPath(args.path);
                return { contents: result ? result.code : contents, loader };
            });
        },
    };
}

export type { CodeTransformerPluginOptions } from './core';
