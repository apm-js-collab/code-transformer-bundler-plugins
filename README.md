# rollup-plugin-code-transformer

A Rollup plugin that uses
[`@apm-js-collab/code-transformer`](https://github.com/apm-js-collab/orchestrion-js)
to instrument JavaScript code at build time for application performance
monitoring and tracing.

## Features

- 🔧 **Build-time instrumentation**: Transform your code during the build
  process
- 🎯 **Selective targeting**: Configure which modules and functions to
  instrument
- 📊 **APM Integration**: Seamlessly integrate with APM solutions using
  diagnostic channels
- 🚀 **Zero runtime overhead**: All transformations happen at build time
- 📦 **Universal support**: Works with ES modules and CommonJS
- 🔍 **TypeScript support**: Full TypeScript definitions included

## Installation

```bash
npm install rollup-plugin-code-transformer
# or
yarn add rollup-plugin-code-transformer
# or
pnpm add rollup-plugin-code-transformer
```

## Usage

### Basic Configuration

```javascript
// rollup.config.js
import codeTransformerPlugin from "rollup-plugin-code-transformer";

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    codeTransformerPlugin({
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

### Advanced Configuration

```javascript
// rollup.config.js
import codeTransformerPlugin from "rollup-plugin-code-transformer";

export default {
  input: "src/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  plugins: [
    codeTransformerPlugin({
      instrumentations: [
        // Instrument class methods
        {
          channelName: "database:query",
          module: {
            name: "mysql2",
            versionRange: ">=3.0.0",
            filePath: "lib/connection.js",
          },
          functionQuery: {
            className: "Connection",
            methodName: "query",
            kind: "Async",
          },
        },
        // Instrument function declarations
        {
          channelName: "http:request",
          module: {
            name: "http-client",
            versionRange: ">=1.0.0",
            filePath: "index.js",
          },
          functionQuery: {
            functionName: "request",
            kind: "Async",
          },
        },
        // Instrument object methods
        {
          channelName: "cache:operation",
          module: {
            name: "redis-client",
            versionRange: ">=2.0.0",
            filePath: "client.js",
          },
          functionQuery: {
            objectMethodName: "get",
            kind: "Async",
          },
        },
      ],
      // Optional: Include polyfill for older Node.js versions
      dcModule: "./polyfill/diagnostics-channel.js",
      // File filtering
      include: ["src/**/*.js", "src/**/*.ts"],
      exclude: ["**/*.test.js", "node_modules/**"],
    }),
  ],
};
```
