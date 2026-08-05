import { createLoader } from './webpack-loader-factory.js';
import { type CustomTransform } from '@apm-js-collab/code-transformer';
import { type AnyInstrumentationConfig } from './instrumentation-serde.js';

const loader = createLoader();

/**
 * Webpack loader that instruments JavaScript code using code-transformer
 *
 * This is a webpack loader (not a plugin) for compatibility with tools that only support loaders,
 * such as Next.js Turbopack. Unlike the other exports in this package, this does not use unplugin.
 *
 * Everything it needs arrives through loader options, which have to be
 * JSON-serializable. To use custom transforms — which are functions, and so
 * cannot — build your own loader module with `createLoader` from the
 * `/webpack-loader-factory` export and point the bundler at that instead.
 */
function codeTransformerLoader(
    this: any,
    code: string,
    inputSourceMap?: any
) {
    return loader.call(this, code, inputSourceMap);
}

// Namespace to attach types to the function
namespace codeTransformerLoader {
    /**
     * Options for the code transformer webpack loader.
     *
     * Turbopack requires loader options to be JSON-serializable, so any
     * `RegExp` in `module.filePath` must be passed in its serialized
     * `{ source, flags }` form there — see `serializeInstrumentations` in the
     * `/core` export.
     */
    export interface Options {
        /** Array of instrumentation configurations */
        instrumentations: AnyInstrumentationConfig[];
        /** Optional path to a polyfill module for diagnostics_channel */
        dcModule?: string;
        /**
         * Custom transforms registered on the matcher via orchestrion's
         * `addTransform`. Functions, so webpack only: Turbopack and
         * worker-based loaders serialize their options. Bind them with
         * `createLoader` from the `/webpack-loader-factory` export instead.
         */
        customTransforms?: Record<string, CustomTransform>;
    }
}

export default codeTransformerLoader;
