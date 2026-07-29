# @apm-js-collab/code-transformer-bundler-plugins

A universal plugin that uses
[`@apm-js-collab/code-transformer`](https://github.com/apm-js-collab/orchestrion-js)
to instrument JavaScript code at build time for application performance
monitoring and tracing.

**Compatible with Rollup, Webpack, Vite, esbuild, Bun, and more!**

## Installation

```bash
npm install @apm-js-collab/code-transformer-bundler-plugins
# or
yarn add @apm-js-collab/code-transformer-bundler-plugins
# or
pnpm add @apm-js-collab/code-transformer-bundler-plugins
```

## Usage

### Rollup

```javascript
// rollup.config.js
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/rollup";

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    codeTransformer({
      instrumentations: [
        {
          channelName: "fetch:request",
          module: {
            name: "undici",
            versionRange: ">=5.0.0",
            filePath: "index.js",
          },
          functionQuery: {
            className: "Undici",
            methodName: "fetch",
            kind: "Async",
          },
        },
      ],
    }),
  ],
};
```

### Webpack

```javascript
// webpack.config.js
const codeTransformer = require(
  "@apm-js-collab/code-transformer-bundler-plugins/webpack",
);

module.exports = {
  entry: "./src/index.js",
  plugins: [
    codeTransformer({
      instrumentations: [
        // ... your instrumentations
      ],
    }),
  ],
};
```

### Vite

```javascript
// vite.config.js
import { defineConfig } from "vite";
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/vite";

export default defineConfig({
  plugins: [
    codeTransformer({
      instrumentations: [
        // ... your instrumentations
      ],
    }),
  ],
});
```

### esbuild

```javascript
// build.js
import { build } from "esbuild";
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/esbuild";

build({
  entryPoints: ["src/index.js"],
  bundle: true,
  plugins: [
    codeTransformer({
      instrumentations: [
        // ... your instrumentations
      ],
    }),
  ],
});
```

### Bun Build

```javascript
// build.ts
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/bun";

await Bun.build({
  entrypoints: ["src/index.ts"],
  plugins: [
    codeTransformer({
      instrumentations: [
        // ... your instrumentations
      ],
    }),
  ],
});
```

### Bun Run

```javascript
// plugin.ts
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/bun";
import { plugin } from "bun";

plugin(codeTransformer({
  instrumentations: [
    // ... your instrumentations
  ],
}));
```

```bash
$ bun run --import=./plugin.ts app.ts
```

## Options

| Option | Type | Description |
| --- | --- | --- |
| `instrumentations` | `InstrumentationConfig[]` | The instrumentations to apply. See [orchestrion-js](https://github.com/nodejs/orchestrion-js) for the config shape. |
| `dcModule` | `string?` | Path to a polyfill module for `diagnostics_channel`. |
| `injectDiagnostics` | `(diagnostics) => string?` | Called after the build with `{ transformedModules, failedModules }`; the returned code is prepended to every entry point bundle. The code is injected after bundling, so it must not contain `import`/`require`. |
| `transformFilter` | `TransformIdFilter \| false` | Restricts which module ids the transform hook runs on (default `/node_modules/`). Supported by bundlers with hook filters (Rollup ≥ 4.38, Rolldown, Vite). |
| `customTransforms` | `Record<string, CustomTransform>` | Custom transforms registered on the matcher via orchestrion's `addTransform`. See below. |
| `loaderPath` | `string?` | Webpack only. The loader to run instead of this package's own, for wrapping it with transforms bound at require time. See below. |
| `cacheVersion` | `string?` | Webpack only. Folded into the loader's cache key. Bump it when a transform's behaviour changes in a way its source text does not show. See below. |

## Custom transforms: injecting code into instrumented files

`customTransforms` registers transforms on the matcher under a name. A name
that an `InstrumentationConfig` opts into through its `transform` field runs
for the nodes that config matches; a name that collides with one of
orchestrion's built-ins overrides that built-in everywhere, including where
orchestrion calls it internally. Either way the function receives
`(state, node, parent, ancestry)`, where `state` is the matched config spread
together with `{ dcModule, moduleType, moduleVersion, transforms }`.

Overriding `tracingChannelImport` is the way to inject code — including
`import`/`require` statements — into the files being instrumented. Orchestrion
calls it when it sets up a file's diagnostics channel, so it runs exactly when
a function was really wrapped. Because the injection happens during the
transform, the bundler resolves and bundles whatever the injected code imports,
and the code is only included when the instrumented package is actually part of
the build. A single transform can serve every injection site by branching on
`state.module.name`:

```javascript
import { parse } from "meriyah";
import codeTransformer from "@apm-js-collab/code-transformer-bundler-plugins/vite";

const INTEGRATIONS = {
  mysql: `import { subscribeToMysql } from 'my-tracing-library';
subscribeToMysql();`,
};

// Marks the statement orchestrion's built-in adds, which is both what tells us
// the import is in place and where we want our own code to go.
const isTracingChannelImport = (node) =>
  node.declarations?.[0]?.id?.properties?.[0]?.value?.name ===
  "tr_ch_apm_tracingChannel";

// One transform handles every injection site; `state` identifies the site.
function injectIntegration(state, program) {
  // Run the built-in first: it adds the diagnostics_channel import our code is
  // placed after, and orchestrion still needs it to declare the channel.
  state.transforms.defaults.tracingChannelImport(state, program);

  const snippet = INTEGRATIONS[state.module.name];
  if (!snippet) return;

  // Called once per channel, so a file with several instrumented functions
  // arrives here more than once.
  if (program.__integrationInjected) return;
  program.__integrationInjected = true;

  const statements = parse(snippet, { module: state.moduleType === "esm" }).body;
  program.body.splice(
    program.body.findIndex(isTracingChannelImport) + 1,
    0,
    ...statements,
  );
}

codeTransformer({
  instrumentations: [
    {
      channelName: "mysql:query",
      module: {
        name: "mysql",
        versionRange: ">=2.0.0",
        filePath: "lib/connection.js",
      },
      functionQuery: { methodName: "query", kind: "Callback" },
    },
  ],
  // Overrides orchestrion's built-in of the same name.
  customTransforms: { tracingChannelImport: injectIntegration },
});
```

Things to be aware of:

- The override replaces the built-in, so it has to call the original. Skipping
  it leaves the file without its `diagnostics_channel` import, and the channel
  declaration orchestrion appends next will reference an undefined variable.
- Orchestrion invokes it once per channel rather than once per file, so a file
  with several instrumented functions needs the dedupe flag above. The built-in
  is idempotent and can be called every time.
- Nothing is injected into a file whose instrumentation found no functions to
  wrap, which is the point of overriding this transform rather than adding a
  `Program` config that matches every file the module matcher does. Such a file
  still fails as it normally would, and still appears in `injectDiagnostics`'s
  `failedModules`.
- This requires `@apm-js-collab/code-transformer` >= 0.18.1, where internal
  calls to built-in transforms dispatch through the override map and
  `state.transforms.defaults` exposes the originals.
- Custom transforms mutate ESTree nodes. Parse code snippets with
  [`meriyah`](https://github.com/meriyah/meriyah) (orchestrion's own parser)
  so the resulting AST round-trips through code generation.
- Under webpack, a transform that reads data it does not name — a captured
  variable, or a module-scope table of snippets — needs `cacheVersion` to
  invalidate a filesystem cache. See below.

### Custom transforms with Webpack

`customTransforms` works with the webpack plugin as it does everywhere else.
The plugin instruments through a loader, and webpack hands loader options to
the loader by reference, so the functions arrive intact.

One thing to know if you use `cache: { type: 'filesystem' }`. Webpack keys a
loader by its ruleset ident rather than by the contents of its options, so a
changed config would ordinarily go unnoticed and cached modules would be reused.
The plugin therefore derives the ident from the config itself: the
instrumentations, `dcModule`, and the source text of every custom transform.
Editing any of those rebuilds the affected modules.

What the ident cannot see is data a transform reads without naming it, because
`Function.prototype.toString` does not capture it:

```javascript
const INTEGRATIONS = { mysql: "..." }; // editing this does not change the source

function injectIntegration(state, program) {
  const snippet = INTEGRATIONS[state.module.name];
  // ...
}
```

Set `cacheVersion` when that data changes — derived from the data itself, or
from your package's version:

```javascript
codeTransformer({
  instrumentations: [
    /* ... */
  ],
  customTransforms: { tracingChannelImport: injectIntegration },
  cacheVersion: require("./package.json").version,
});
```

### Custom transforms with Turbopack

Turbopack serializes loader options as JSON, so functions cannot reach the
loader through them; the same applies to loaders that run in worker processes,
such as `thread-loader`. For those, ship a loader of your own with the
transforms already bound. They then live in that module's scope inside the
loader process and never cross a serialization boundary — only the JSON-safe
`instrumentations` do. Webpack also tracks the loader file's own contents, so
editing a transform there invalidates cached modules without `cacheVersion`.

```javascript
// my-library/loader.cjs
const {
  createLoader,
} = require("@apm-js-collab/code-transformer-bundler-plugins/webpack-loader-factory");
const { injectIntegration } = require("./transforms.cjs");

module.exports = createLoader({
  customTransforms: { tracingChannelImport: injectIntegration },
  // Optional: bake in the instrumentations too, so callers pass no options at
  // all. Per-rule loader options override these when present.
  // instrumentations: [...],
});
```

Point webpack at it with the plugin's `loaderPath`, which keeps
`injectDiagnostics` working:

```javascript
codeTransformer({
  loaderPath: require.resolve("my-library/loader.cjs"),
  instrumentations: [
    /* ... */
  ],
});
```

Or register it directly, which is what Turbopack needs:

```javascript
// next.config.js
module.exports = {
  turbopack: {
    rules: {
      "**/*.{js,cjs,mjs}": {
        loaders: [
          {
            loader: "my-library/loader.cjs",
            options: { instrumentations: serializeInstrumentations(configs) },
          },
        ],
      },
    },
  },
};
```
