import {
    create,
    type InstrumentationConfig,
    type ModuleType,
} from '@apm-js-collab/code-transformer';
import { extname, join } from 'path';
import { readFileSync } from 'fs';
import * as moduleDetailsFromPathImport from 'module-details-from-path';
import type { ModuleDetails } from 'module-details-from-path';
import { initSync as lexerInitSync, parse as lexerParse } from 'es-module-lexer';

const moduleDetailsFromPath: (filepath: string) => ModuleDetails =
    (moduleDetailsFromPathImport as any).default ||
    (moduleDetailsFromPathImport as any);

type Diagnostics = {
  transformedModules: string[];
  failedModules: string[];
};

// We need to be careful not to inject the snippet before any `"use strict";`s.
// As an additional complication `"use strict";`s may come after any number of comments.
export const COMMENT_USE_STRICT_REGEX =
  // Note: CodeQL complains that this regex potentially has n^2 runtime. This likely won't affect realistic files.
  /^(?:\s*|\/\*(?:.|\r|\n)*?\*\/|\/\/.*[\n\r])*(?:"[^"]*";|'[^']*';)?/;

function stripQueryAndHashFromPath(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return path.split("?")[0]!.split("#")[0]!;
}

/**
 * Checks if a file is a JavaScript file based on its extension.
 * Handles query strings and hashes in the filename.
 */
export function isJsFile(fileName: string): boolean {
  const cleanFileName = stripQueryAndHashFromPath(fileName);
  return [".js", ".mjs", ".cjs"].some((ext) => cleanFileName.endsWith(ext));
}

/**
 * Checks if a chunk contains only import/export statements and no substantial code.
 *
 * In Vite MPA (multi-page application) mode, HTML entry points create "facade" chunks
 * that only contain import statements to load shared modules. These should not have
 * Sentry code injected. However, in SPA mode, the main bundle also has an HTML facade
 * but contains substantial application code that SHOULD have debug IDs injected.
 *
 * @ref https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/829
 * @ref https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/839
 */
export function containsOnlyImports(code: string): boolean {
  const codeWithoutImports = code
    // Remove side effect imports: import '/path'; or import "./path";
    // Using explicit negated character classes to avoid polynomial backtracking
    .replace(/^\s*import\s+(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)[\s;]*$/gm, "")
    // Remove named/default imports: import x from '/path'; import { x } from '/path';
    .replace(/^\s*import\b[^'"`\n]*\bfrom\s+(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)[\s;]*$/gm, "")
    // Remove re-exports: export * from '/path'; export { x } from '/path';
    .replace(/^\s*export\b[^'"`\n]*\bfrom\s+(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)[\s;]*$/gm, "")
    // Remove block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Remove line comments
    .replace(/\/\/.*$/gm, "")
    // Remove "use strict" directives
    .replace(/["']use strict["']\s*;?/g, "")
    .trim();

  return codeWithoutImports.length === 0;
}

/**
 * Checks if a chunk should be skipped for code injection
 *
 * This is necessary to handle Vite's MPA (multi-page application) mode where
 * HTML entry points create "facade" chunks that should not contain injected code.
 * See: https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/829
 *
 * However, in SPA mode, the main bundle also has an HTML facade but contains
 * substantial application code. We should NOT skip injection for these bundles.
 *
 * @param code - The chunk's code content
 * @param facadeModuleId - The facade module ID (if any) - HTML files create facade chunks
 * @returns true if the chunk should be skipped
 */
export function shouldSkipCodeInjection(
  code: string,
  facadeModuleId: string | null | undefined,
): boolean {
  // Skip empty chunks - these are placeholder chunks that should be optimized away
  if (code.trim().length === 0) {
    return true;
  }

  // For HTML facade chunks, only skip if they contain only import statements
  if (
    facadeModuleId &&
    stripQueryAndHashFromPath(facadeModuleId).endsWith(".html")
  ) {
    return containsOnlyImports(code);
  }

  return false;
}

/**
 * A matcher for module ids, mirroring the shape accepted by the bundler
 * transform hook filter (Rollup >= 4.38, Rolldown, Vite). A single string/RegExp
 * (or array) is treated as an `include`; the object form allows both.
 */
export type TransformIdFilter =
  | string
  | RegExp
  | Array<string | RegExp>
  | {
      include?: string | RegExp | Array<string | RegExp>;
      exclude?: string | RegExp | Array<string | RegExp>;
    };

export interface CodeTransformerPluginOptions {
  /** Array of instrumentation configurations */
  instrumentations: InstrumentationConfig[];
  /** Optional path to a polyfill module for diagnostics_channel */
  dcModule?: string;
  /** Optional callback that that injects the code returned */
  injectDiagnostics?: (diagnostics: Diagnostics) => string | undefined;
  /**
   * Restricts which modules the transform hook runs on, via the bundler's hook
   * filter (Rollup >= 4.38, Rolldown, Vite). All built-in instrumentations live
   * within `node_modules`, which is the default. Provide your own matcher to
   * broaden or narrow this — e.g. to also transform your own source — or pass
   * `false` to disable filtering entirely.
   *
   * Bundlers without hook-filter support (esbuild, webpack) ignore this; the
   * transformer skips non-matching modules regardless.
   *
   * @default /node_modules/
   */
  transformFilter?: TransformIdFilter | false;
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
    } catch (_) {
        //
    }
    return undefined;
}

function detectModuleType(id: string, code: string): ModuleType {
    const ext = extname(id);
    if (ext === '.mjs' || ext === '.ts' || ext === '.tsx') return 'esm';
    if (ext === '.cjs') return 'cjs';
    if (ext === '.js') {
      try {
        lexerInitSync();
        const [imports, exports] = lexerParse(code);
        return imports.length > 0 || exports.length > 0 ? 'esm' : 'cjs';
      } catch (_) {
        // ignore
      }
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
  const transformedModules = new Set<string>();
  const failedModules = new Set<string>();

  const getCodeToInject = (): string | undefined => {
    if (!options.injectDiagnostics) {
      return undefined;
    }

    const diagnostics = {
      transformedModules: Array.from(transformedModules),
      failedModules: Array.from(failedModules),
    };

    return options.injectDiagnostics(diagnostics);
  };

  const transform = (
    code: string,
    id: string,
    inputSourceMap?: string | object | null,
  ): TransformResult | null => {
    const moduleDetails = moduleDetailsFromPath(id);
    if (!moduleDetails) return null;

    const moduleVersion = getModuleVersion(moduleDetails.basedir);
    if (!moduleVersion) {
      return null;
    }

    const transformer = matcher.getTransformer(
      moduleDetails.name,
      moduleVersion,
      moduleDetails.path,
    );
    if (!transformer) return null;

    const moduleType = detectModuleType(id, code);

    if (moduleType === 'unknown') {
      failedModules.add(moduleDetails.name);
      return null;
    };

    try {
      const result = transformer.transform(
        code,
        moduleType,
        inputSourceMap ?? null,
      );
      transformedModules.add(transformer.moduleName);
      return { code: result.code, map: result.map };
    } catch (error) {
      console.warn(`Code transformation failed for '${id}'`, error);
      failedModules.add(moduleDetails.name);
      return null;
    }
  };

  return { transform, getCodeToInject };
}

export { InstrumentationConfig, ModuleMatcher, FunctionBehavior, FunctionQuery } from '@apm-js-collab/code-transformer';