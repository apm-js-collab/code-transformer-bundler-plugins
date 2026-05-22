import {
    create,
    type InstrumentationConfig,
    type ModuleType,
} from '@apm-js-collab/code-transformer';
import { extname, join } from 'path';
import { readFileSync } from 'fs';
import * as moduleDetailsFromPathImport from 'module-details-from-path';

const moduleDetailsFromPath =
    (moduleDetailsFromPathImport as any).default ||
    (moduleDetailsFromPathImport as any);

export interface CodeTransformerPluginOptions {
    /** Array of instrumentation configurations */
    instrumentations: InstrumentationConfig[];
    /** Optional path to a polyfill module for diagnostics_channel */
    dcModule?: string;
}

export interface TransformResult {
    code: string;
    map?: string;
}

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
    return undefined;
}

function detectModuleType(id: string, code: string): ModuleType {
    const ext = extname(id);
    if (ext === '.mjs' || ext === '.ts' || ext === '.tsx') return 'esm';
    if (ext === '.cjs') return 'cjs';
    if (ext === '.js') {
        return code.includes('export ') || code.includes('import ')
            ? 'esm'
            : 'cjs';
    }
    return 'unknown';
}

/**
 * Build a reusable code transformer from plugin options. The returned
 * `transform` function returns `null` for files that should not be modified.
 * Call `dispose` when the bundler tears the plugin down.
 */
export function createCodeTransformer(options: CodeTransformerPluginOptions) {
    const matcher = create(options.instrumentations, options.dcModule ?? null);

    return (
        code: string,
        id: string,
        inputSourceMap?: string | null,
    ): TransformResult | null => {
        const moduleType = detectModuleType(id, code);
        const moduleDetails = moduleDetailsFromPath(id);
        if (!moduleDetails) return null;

        const moduleVersion = getModuleVersion(moduleDetails.basedir);
        if (!moduleVersion) {
            console.warn(
                `No 'package.json' version found for module ${moduleDetails.name} at ${moduleDetails.basedir}. Skipping transformation.`,
            );
            return null;
        }

        const transformer = matcher.getTransformer(
            moduleDetails.name,
            moduleVersion,
            moduleDetails.path,
        );
        if (!transformer) return null;

        try {
            const result = transformer.transform(
                code,
                moduleType,
                inputSourceMap ?? null,
            );
            return { code: result.code, map: result.map };
        } catch (error) {
            console.warn(`Code transformation failed for ${id}: ${error}`);
            return null;
        }
    };
}
