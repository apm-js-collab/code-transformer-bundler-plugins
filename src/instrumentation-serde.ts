import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

/**
 * A plain-object encoding of a `RegExp` that survives JSON serialization.
 * Revive it with `new RegExp(source, flags)`.
 */
export interface SerializedRegExp {
    type: 'RegExp';
    source: string;
    flags: string;
}

/**
 * An `InstrumentationConfig` whose `module.filePath` is never a `RegExp`
 * instance — regexes are encoded as {@link SerializedRegExp} — making the
 * whole config a POJO that can cross serialization boundaries such as
 * Turbopack's loader options.
 */
export type SerializableInstrumentationConfig = InstrumentationConfig extends infer T
    ? T extends { module: InstrumentationConfig['module'] }
        ? Omit<T, 'module'> & {
              module: Omit<T['module'], 'filePath'> & {
                  filePath: string | SerializedRegExp;
              };
          }
        : never
    : never;

/** Either the native config shape or its JSON-safe counterpart. */
export type AnyInstrumentationConfig =
    | InstrumentationConfig
    | SerializableInstrumentationConfig;

function isSerializedRegExp(value: unknown): value is SerializedRegExp {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as SerializedRegExp).type === 'RegExp' &&
        typeof (value as SerializedRegExp).source === 'string' &&
        typeof (value as SerializedRegExp).flags === 'string'
    );
}

/**
 * Converts any `RegExp` `module.filePath` into a plain `{ source, flags }`
 * object so the configs can be passed where only JSON-serializable values are
 * allowed (e.g. Turbopack loader options). Configs that are already
 * serializable are returned unchanged.
 */
export function serializeInstrumentations(
    configs: AnyInstrumentationConfig[],
): SerializableInstrumentationConfig[] {
    return configs.map((config) => {
        const { filePath } = config.module;
        if (!(filePath instanceof RegExp)) {
            return config as SerializableInstrumentationConfig;
        }
        return {
            ...config,
            module: {
                ...config.module,
                filePath: { type: 'RegExp', source: filePath.source, flags: filePath.flags },
            },
        } as SerializableInstrumentationConfig;
    });
}

/**
 * Revives serialized `{ source, flags }` file paths back into `RegExp`
 * instances. Accepts a mix of serialized and native configs so callers can
 * pass user-supplied options straight through.
 */
export function deserializeInstrumentations(
    configs: AnyInstrumentationConfig[],
): InstrumentationConfig[] {
    return configs.map((config) => {
        const { filePath } = config.module;
        if (typeof filePath === 'string' || filePath instanceof RegExp) {
            return config as InstrumentationConfig;
        }
        if (!isSerializedRegExp(filePath)) {
            throw new Error(
                `Invalid instrumentation config for module '${config.module.name}': ` +
                    "'filePath' must be a string, a RegExp, or a { type: 'RegExp', source, flags } object",
            );
        }
        return {
            ...config,
            module: {
                ...config.module,
                filePath: new RegExp(filePath.source, filePath.flags),
            },
        } as InstrumentationConfig;
    });
}
