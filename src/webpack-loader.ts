import { create, ModuleType, type InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { join, extname } from 'path';
import { readFileSync } from 'fs';
import * as moduleDetailsFromPathImport from 'module-details-from-path';

// Handle CJS default export - module-details-from-path exports a function directly
const moduleDetailsFromPath = (moduleDetailsFromPathImport as any).default || moduleDetailsFromPathImport as any;

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

// Matcher cache with config hash for cache invalidation
const matcherCache = new Map<string, ReturnType<typeof create>>();

/**
 * Get or create a matcher instance with caching based on config hash
 */
function getMatcher(instrumentations: InstrumentationConfig[], dcModule?: string) {
    const configHash = JSON.stringify({ instrumentations, dcModule });

    if (matcherCache.has(configHash)) {
        return matcherCache.get(configHash)!;
    }

    // Free old matchers to prevent memory leaks
    for (const [hash, matcher] of matcherCache.entries()) {
        if (hash !== configHash) {
            matcher.free();
            matcherCache.delete(hash);
        }
    }

    const matcher = create(instrumentations, dcModule ?? null);
    matcherCache.set(configHash, matcher);
    return matcher;
}

/**
 * Webpack loader that instruments JavaScript code using code-transformer
 *
 * This is a webpack loader (not a plugin) for compatibility with tools that only support loaders,
 * such as Next.js Turbopack. Unlike the other exports in this package, this does not use unplugin.
 */
function codeTransformerLoader(
    this: any,
    code: string,
    inputSourceMap?: any
) {
    const callback = this.async();
    const options: codeTransformerLoader.Options = this.getOptions();
    const resourcePath: string = this.resourcePath;

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
    const matcher = getMatcher(options.instrumentations, options.dcModule);
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

        callback(null, result.code, result.map);
    } catch (error) {
        console.warn(`[code-transformer-loader] Error transforming ${resourcePath}:`, error);
        callback(null, code, inputSourceMap);
    } finally {
        transformer.free();
    }
}

// Cleanup on process exit
process.on('exit', () => {
    for (const matcher of matcherCache.values()) {
        matcher.free();
    }
    matcherCache.clear();
});

// Namespace to attach types to the function
namespace codeTransformerLoader {
    /** Options for the code transformer webpack loader */
    export interface Options {
        /** Array of instrumentation configurations */
        instrumentations: InstrumentationConfig[];
        /** Optional path to a polyfill module for diagnostics_channel */
        dcModule?: string;
    }
}

export default codeTransformerLoader;
