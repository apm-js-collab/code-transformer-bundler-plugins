import { create, ModuleType, type CustomTransform } from '@apm-js-collab/code-transformer';
import { join, extname } from 'path';
import { readFileSync } from 'fs';
import * as moduleDetailsFromPathImport from 'module-details-from-path';
import {
    deserializeInstrumentations,
    serializeInstrumentations,
    type AnyInstrumentationConfig,
} from './instrumentation-serde.js';

// Handle CJS default export - module-details-from-path exports a function directly
const moduleDetailsFromPath = (moduleDetailsFromPathImport as any).default || moduleDetailsFromPathImport as any;

const DIAGNOSTICS_STATE_KEY = '__codeTransformerWebpackDiagnostics';

type DiagnosticsState = {
    transformedModules: Set<string>;
    failedModules: Set<string>;
};

/**
 * Helper function to get module version from package.json
 */
function getModuleVersion(basedir: string): string | undefined {
    try {
        const packageJsonPath = join(basedir, 'package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.version) {
            return packageJson.version;
        }
    } catch (error) {
        //
    }

    return undefined; // No version found
}

function getDiagnosticsState(loaderContext: any): DiagnosticsState | undefined {
    return loaderContext?._compilation?.[DIAGNOSTICS_STATE_KEY];
}

/**
 * The per-rule options a loader reads from `this.getOptions()`. Every field is
 * optional here because {@link createLoader} can supply it instead; the
 * loader still needs `instrumentations` from one of the two sources.
 *
 * Turbopack requires loader options to be JSON-serializable, so any `RegExp`
 * in `module.filePath` must be passed in its serialized `{ source, flags }`
 * form there — see `serializeInstrumentations` in the `/core` export.
 */
export interface LoaderOptions {
    /** Array of instrumentation configurations */
    instrumentations?: AnyInstrumentationConfig[];
    /** Optional path to a polyfill module for diagnostics_channel */
    dcModule?: string;
    /**
     * Custom transforms registered on the matcher via orchestrion's
     * `addTransform`. An `InstrumentationConfig` opts in by naming one of these
     * in its `transform` field.
     *
     * Webpack passes loader options through by reference, so functions arrive
     * intact. Turbopack does not — it serializes them as JSON — and neither do
     * loaders that run in worker processes, such as `thread-loader`. For those,
     * bind the transforms with {@link createLoader} instead.
     */
    customTransforms?: Record<string, CustomTransform>;
}

/**
 * Baked-in configuration for a loader built with {@link createLoader}. These
 * values live in the loader module's own scope, so unlike per-rule loader
 * options they never cross a serialization boundary.
 *
 * Per-rule options take precedence over `instrumentations` and `dcModule`
 * given here, and per-rule `customTransforms` are merged over these.
 */
export interface CreateLoaderOptions extends LoaderOptions {}

/**
 * Identity keys for transform functions, so that the matcher cache can tell two
 * sets of custom transforms apart. Functions have no stable serialization —
 * `toString` ignores captured variables — so identity is all we can key on.
 */
const transformIds = new WeakMap<CustomTransform, number>();
let nextTransformId = 0;

function customTransformsKey(customTransforms: Record<string, CustomTransform>): string {
    return Object.keys(customTransforms)
        .sort()
        .map((name) => {
            const fn = customTransforms[name]!;
            let id = transformIds.get(fn);

            if (id === undefined) {
                id = nextTransformId++;
                transformIds.set(fn, id);
            }

            return `${name}:${id}`;
        })
        .join(',');
}

/** A webpack-compatible loader function, as returned by {@link createLoader}. */
export type CodeTransformerLoader = (
    this: any,
    code: string,
    inputSourceMap?: any,
) => void;

/**
 * Builds a webpack loader that instruments JavaScript code using
 * code-transformer.
 *
 * Use this to wrap the loader in your own package when loader options are not
 * a viable channel for custom transforms — under Turbopack, which serializes
 * them as JSON, or with worker-based loaders such as `thread-loader`:
 *
 * ```js
 * // my-library/loader.cjs
 * const { createLoader } = require('@apm-js-collab/code-transformer-bundler-plugins/webpack-loader-factory');
 * module.exports = createLoader({ customTransforms: { injectIntegration } });
 * ```
 *
 * Webpack resolves that module by path, so the transform stays in the loader
 * process and only the JSON-serializable `instrumentations` cross into the
 * loader options.
 *
 * The plain `/webpack-loader` export is `createLoader()` with no baked-in
 * configuration; the webpack plugin passes `customTransforms` to it directly.
 */
export function createLoader(
    factoryOptions: CreateLoaderOptions = {},
): CodeTransformerLoader {
    // Scoped to this loader instance: two loaders sharing the module-level
    // cache would collide whenever their instrumentations match but their
    // custom transforms differ, since only the former is part of the key.
    const matcherCache = new Map<string, ReturnType<typeof create>>();

    /**
     * Get or create a matcher instance with caching based on config hash
     */
    function getMatcher(
        instrumentations: AnyInstrumentationConfig[],
        dcModule: string | undefined,
        customTransforms: Record<string, CustomTransform>,
    ) {
        // Hash the serialized form: JSON.stringify turns a raw RegExp into `{}`,
        // which would make configs differing only in their regex hash identically.
        const configHash = JSON.stringify({
            instrumentations: serializeInstrumentations(instrumentations),
            dcModule,
            customTransforms: customTransformsKey(customTransforms),
        });

        if (matcherCache.has(configHash)) {
            return matcherCache.get(configHash)!;
        }

        // Free old matchers to prevent memory leaks
        for (const [hash, matcher] of matcherCache.entries()) {
            if (hash !== configHash) {
                matcherCache.delete(hash);
            }
        }

        const matcher = create(deserializeInstrumentations(instrumentations), dcModule ?? null);

        for (const [name, fn] of Object.entries(customTransforms)) {
            matcher.addTransform(name, fn);
        }

        matcherCache.set(configHash, matcher);
        return matcher;
    }

    return function codeTransformerLoader(
        this: any,
        code: string,
        inputSourceMap?: any,
    ) {
        const callback = this.async();
        const options: LoaderOptions = this.getOptions();
        const resourcePath: string = this.resourcePath;

        // Per-rule options win over whatever the loader was built with, and
        // per-rule transforms are merged over the baked-in ones by name.
        const instrumentations = options.instrumentations ?? factoryOptions.instrumentations;
        const dcModule = options.dcModule ?? factoryOptions.dcModule;
        const customTransforms = {
            ...factoryOptions.customTransforms,
            ...options.customTransforms,
        };

        if (!instrumentations || instrumentations.length === 0) {
            return callback(null, code, inputSourceMap);
        }

        // Determine if this is an ES module using multiple methods for accurate detection
        const ext = extname(resourcePath);
        let moduleType: ModuleType =
            ext === '.mjs' || ext === '.ts' || ext === '.tsx' ? 'esm' : 'unknown';

        // For .js files, use content analysis for module detection
        if (ext === '.js') {
            moduleType = code.includes('export ') || code.includes('import ') ? 'esm' : 'cjs';
        } else if (ext === '.cjs') {
            moduleType = 'cjs';
        }

        // Try to get module details from the file path
        const moduleDetails = moduleDetailsFromPath(resourcePath);

        // If no module details found, the file is not part of a module
        if (!moduleDetails) {
            return callback(null, code, inputSourceMap);
        }

        // Use module details for accurate module information
        const moduleName = moduleDetails.name;
        const moduleVersion = getModuleVersion(moduleDetails.basedir);

        // If no version found
        if (!moduleVersion) {
            return callback(null, code, inputSourceMap);
        }

        // Try to get a transformer for this file
        const matcher = getMatcher(instrumentations, dcModule, customTransforms);
        const transformer = matcher.getTransformer(
            moduleName,
            moduleVersion,
            moduleDetails.path
        );

        if (!transformer) {
            // No instrumentations match this file
            return callback(null, code, inputSourceMap);
        }

        try {
            // Transform the code
            const result = transformer.transform(code, moduleType, inputSourceMap);
            const diagnosticsState = getDiagnosticsState(this);

            diagnosticsState?.transformedModules.add(transformer.moduleName);

            callback(null, result.code, result.map);
        } catch (error) {
            console.warn(`[code-transformer-loader] Error transforming ${resourcePath}:`, error);
            const diagnosticsState = getDiagnosticsState(this);

            diagnosticsState?.failedModules.add(moduleDetails.name);
            callback(null, code, inputSourceMap);
        }
    };
}

export type { CustomTransform } from '@apm-js-collab/code-transformer';
export type { AnyInstrumentationConfig } from './instrumentation-serde.js';
