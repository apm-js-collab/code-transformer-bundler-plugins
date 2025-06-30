import { createUnplugin } from 'unplugin';
import { create, type InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { extname, join } from 'path';
import { readFileSync } from 'fs';
import moduleDetailsFromPath from 'module-details-from-path';

export interface CodeTransformerPluginOptions {
    /** Array of instrumentation configurations */
    instrumentations: InstrumentationConfig[];
    /** Optional path to a polyfill module for diagnostics_channel */
    dcModule?: string;
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
        //
    }

    return undefined; // No version found
}

/**
 * Universal plugin that uses @apm-js-collab/code-transformer to instrument JavaScript code
 */
const unplugin = createUnplugin<CodeTransformerPluginOptions>((options) => {
    const {
        instrumentations,
        dcModule,
    } = options;

    // Create the code transformer instrumentor
    const instrumentationMatcher = create(instrumentations, dcModule);

    return {
        name: 'code-transformer',
        transform(code: string, id: string) {
            // Determine if this is an ES module using multiple methods for accurate detection
            const ext = extname(id);
            let isModule = ext === '.mjs' || ext === '.ts' || ext === '.tsx';

            // For .js files, use content analysis for module detection
            if (ext === '.js') {
                isModule = code.includes('export ') || code.includes('import ');
            }

            // Try to get module details from the file path
            const moduleDetails = moduleDetailsFromPath(id);

            // If no module details found, the file is not part of a module
            if (!moduleDetails) {
                return null;
            }

            // Use module details for accurate module information
            const moduleName = moduleDetails.name;
            const moduleVersion = getModuleVersion(moduleDetails.basedir);

            // If no version found
            if (!moduleVersion) {
                console.warn(`No 'package.json' version found for module ${moduleName} at ${moduleDetails.basedir}. Skipping transformation.`);
                return null;
            }

            // Try to get a transformer for this file
            const transformer = instrumentationMatcher.getTransformer(
                moduleName,
                moduleVersion,
                moduleDetails.path,
            );

            if (!transformer) {
                // No instrumentations match this file
                return null;
            }

            try {
                // Transform the code
                const transformedCode = transformer.transform(code, isModule);

                return {
                    code: transformedCode,
                    // map: sourceMap // TODO: Implement source map support
                };

            } catch (error) {
                // If transformation fails, warn and return original code
                console.warn(`Code transformation failed for ${id}: ${error}`);
                return null;
            } finally {
                transformer.free();
            }
        }
    };
});

export default unplugin;
