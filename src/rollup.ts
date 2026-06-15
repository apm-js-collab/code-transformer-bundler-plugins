import type { Plugin } from "rollup";
import {
  COMMENT_USE_STRICT_REGEX,
  createCodeTransformer,
  isJsFile,
  shouldSkipCodeInjection,
  type CodeTransformerPluginOptions,
} from "./core";
import MagicString, { SourceMap } from "magic-string";

export default function codeTransformerRollup(
  options: CodeTransformerPluginOptions,
): Plugin {
  const { transform: transformCode, getCodeToInject } =
    createCodeTransformer(options);

  const renderChunk = (
    code: string,
    chunk: { fileName: string; facadeModuleId?: string | null },
    _?: unknown,
    meta?: { magicString?: MagicString },
  ): {
    code: string;
    map?: SourceMap;
  } | null => {
    if (!isJsFile(chunk.fileName)) {
      return null; // returning null means not modifying the chunk at all
    }

    // Skip empty chunks and HTML facade chunks (Vite MPA)
    if (shouldSkipCodeInjection(code, chunk.facadeModuleId)) {
      return null;
    }

    const injectCode = getCodeToInject();

    if (!injectCode) {
      return null;
    }

    const ms =
      meta?.magicString || new MagicString(code, { filename: chunk.fileName });
    const match = code.match(COMMENT_USE_STRICT_REGEX)?.[0];

    if (match) {
      // Add injected code after any comments or "use strict" at the beginning of the bundle.
      ms.appendLeft(match.length, injectCode);
    } else {
      // ms.replace() doesn't work when there is an empty string match (which happens if
      // there is neither, a comment, nor a "use strict" at the top of the chunk) so we
      // need this special case here.
      ms.prepend(injectCode);
    }

    // Rolldown can pass a native MagicString instance in meta.magicString
    // https://rolldown.rs/in-depth/native-magic-string#usage-examples
    if (ms?.constructor?.name === "BindingMagicString") {
      // Rolldown docs say to return the magic string instance directly in this case
      return { code: ms as unknown as string };
    }

    return {
      code: ms.toString(),
      map: ms.generateMap({
        file: chunk.fileName,
        hires: "boundary" as unknown as undefined,
      }),
    };
  };

  const transform = (code: string, id: string) => {
    const result = transformCode(code, id);
    if (!result) return null;
    return { code: result.code, map: result.map ?? null };
  };

  const name = "code-transformer";

  if (!options.injectDiagnostics) {
    return {
      name,
      transform,
    };
  }

  return {
    name,
    transform,
    renderChunk: renderChunk as unknown as Plugin["renderChunk"],
  };
}

export type { CodeTransformerPluginOptions } from "./core";
