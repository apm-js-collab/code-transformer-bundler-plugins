import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const external = [
    'rollup',
    '@rollup/pluginutils',
    '@apm-js-collab/code-transformer',
    'module-details-from-path',
    'path',
    'fs'
]

export default [
  // ESM build
  {
    input: 'src/index.ts',
    external,
    output: {
      file: 'dist/index.mjs',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      nodeResolve(),
      typescript({
        tsconfig: './tsconfig.json',
      })
    ]
  },
  // CommonJS build
  {
    input: 'src/index.ts',
    external,
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'auto'
    },
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
      })
    ]
  }
];
