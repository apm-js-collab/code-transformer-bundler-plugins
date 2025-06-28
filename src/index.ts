import type { Plugin } from 'rollup';
import { createFilter } from '@rollup/pluginutils';
import { create, type InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { extname, basename, join } from 'path';
import { readFileSync } from 'fs';
import moduleDetailsFromPath from 'module-details-from-path';

export interface CodeTransformerPluginOptions {
    /** Array of instrumentation configurations */
    instrumentations: InstrumentationConfig[];

    /** Optional path to a polyfill module for diagnostics_channel */
    dcModule?: string;

    /** File patterns to include (glob patterns) */
    include?: string | string[];

    /** File patterns to exclude (glob patterns) */
    exclude?: string | string[];
}

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
        // If we can't read the package.json, fall back to default version
    }

    return undefined; // No version found
}

/**
 * Rollup plugin that uses @apm-js-collab/code-transformer to instrument JavaScript code
 */
export default function codeTransformerPlugin(options: CodeTransformerPluginOptions): Plugin {
    const {
        instrumentations,
        dcModule,
        include = ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.tsx'],
        exclude = ['node_modules/**'],
    } = options;

    // Create the filter function for file inclusion/exclusion
    const filter = createFilter(include, exclude);

    // Create the code transformer instrumentor
    const instrumentor = create(instrumentations, dcModule);

    return {
        name: 'code-transformer',

        transform(code: string, id: string) {
            // Skip files that don't match our filter
            if (!filter(id)) {
                return null;
            }

            // Determine if this is an ES module using multiple methods for accurate detection
            const ext = extname(id);
            let isModule = ext === '.mjs' || ext === '.ts' || ext === '.tsx';

            // For .js files, use Rollup's module information when available
            if (ext === '.js') {
                // Method 1: Use Rollup's parsed module information (most reliable)
                const moduleInfo = this.getModuleInfo(id);
                if (moduleInfo) {
                    // Check if the AST indicates it's a module
                    if (moduleInfo.ast && moduleInfo.ast.sourceType === 'module') {
                        isModule = true;
                    }
                    // Check if it has ES module exports
                    else if (moduleInfo.hasDefaultExport !== null || (moduleInfo.exports && moduleInfo.exports.length > 0)) {
                        isModule = true;
                    }
                }

                // Method 2: Fallback to content analysis if module info isn't complete yet
                if (!isModule) {
                    isModule = code.includes('export ') || code.includes('import ');
                }
            }

            try {
                // Extract module information for matching
                const fileName = basename(id);

                // Try to get module details from the file path
                const moduleDetails = moduleDetailsFromPath(id);

                // If no module details found, skip transformation
                if (!moduleDetails) {
                    return null;
                }

                // Use module details for accurate module information
                const moduleName = moduleDetails.name;
                const moduleVersion = getModuleVersion(moduleDetails.basedir);

                // If no version found
                if (!moduleVersion) {
                    return null;
                }

                const relativeFilePath = moduleDetails.path;

                // Try to get a transformer for this file
                const transformer = instrumentor.getTransformer(
                    moduleName,
                    moduleVersion,
                    relativeFilePath
                );

                if (!transformer) {
                    // No instrumentations match this file
                    return null;
                }

                // Transform the code
                const transformedCode = transformer.transform(code, isModule);

                return {
                    code: transformedCode,
                    // map: sourceMap // TODO: Implement source map support
                };

            } catch (error) {
                // If transformation fails, warn and return original code
                this.warn(`Code transformation failed for ${id}: ${error}`);
                return null;
            }
        }
    };
}
