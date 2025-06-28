import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { join } from 'path';
import codeTransformer from '../../dist/rollup.mjs';

async function build() {
  try {
    console.log('Building example with code transformer plugin...');
    
    const bundle = await rollup({
      input: join(import.meta.dirname, 'src', 'index.js'),
      plugins: [
        nodeResolve(), // Add node resolution plugin
        codeTransformer({
          instrumentations: [
            // Instrument HttpClient.fetch method
            {
              channelName: 'http:client:fetch',
              module: {
                name: 'http-client',
                versionRange: '>=1.0.0',
                filePath: 'http-client.js'
              },
              functionQuery: {
                className: 'HttpClient',
                methodName: 'fetch',
                kind: 'Async'
              }
            },
            // Instrument HttpClient.post method
            {
              channelName: 'http:client:post',
              module: {
                name: 'http-client',
                versionRange: '>=1.0.0',
                filePath: 'http-client.js'
              },
              functionQuery: {
                className: 'HttpClient',
                methodName: 'post',
                kind: 'Async'
              }
            },
            // Instrument makeRequest function
            {
              channelName: 'http:request:function',
              module: {
                name: 'http-client',
                versionRange: '>=1.0.0',
                filePath: 'http-client.js'
              },
              functionQuery: {
                functionName: 'makeRequest',
                kind: 'Async'
              }
            }
          ],
        })
      ],
      external: [] // Don't treat any modules as external
    });

    await bundle.write({
      file: join(import.meta.dirname, 'dist', 'bundle.js'),
      format: 'esm'
    });

  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
