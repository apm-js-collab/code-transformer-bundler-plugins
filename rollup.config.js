import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const external = [
    'unplugin',
    '@rollup/pluginutils',
    '@apm-js-collab/code-transformer',
    'module-details-from-path',
    'path',
    'fs'
]

const entries = [
    'rollup',
    'webpack', 
    'vite',
    'esbuild'
];

const configs = [];

// Generate ESM and CJS builds for each entry point
for (const entry of entries) {
    // ESM build
    configs.push({
        input: `src/${entry}.ts`,
        external,
        output: {
            file: `dist/${entry}.mjs`,
            format: 'es',
            sourcemap: true
        },
        plugins: [
            nodeResolve(),
            typescript({
                tsconfig: './tsconfig.json',
            })
        ]
    });
    
    // CommonJS build
    configs.push({
        input: `src/${entry}.ts`,
        external,
        output: {
            file: `dist/${entry}.js`,
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
    });
}

export default configs;
