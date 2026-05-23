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
