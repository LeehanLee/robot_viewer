import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * npm 包（React 封装层）构建配置
 *
 * 与原 vite.config.js（网页版应用构建）互不影响：
 *   - 原构建：vite build            -> dist/      （网页应用，保持不变）
 *   - 库构建：vite build --config vite.lib.config.js -> dist-lib/ （npm 包）
 *
 * 产物为 ESM（项目本身 "type": "module"）。
 * react / react-dom 作为 peerDependencies 外部化；
 * three / urdf-loader / xacro-parser 等已在 dependencies 中，同样外部化，
 * 由宿主项目间接安装，避免重复打包与多 Three.js 实例冲突。
 */

const PKG_DEPENDENCIES = [
    'three',
    'urdf-loader',
    'xacro-parser',
    'mujoco-js',
    'd3',
    '@babel/runtime'
];

function isExternal(id) {
    if (id === 'react' || id.startsWith('react/')) return true;
    if (id === 'react-dom' || id.startsWith('react-dom/')) return true;
    if (id === 'three' || id.startsWith('three/')) return true;
    return PKG_DEPENDENCIES.includes(id);
}

export default defineConfig({
    // 库构建不需要复制 public/ 静态资源（那是网页版应用的东西）
    publicDir: false,
    esbuild: {
        target: 'es2020',
        charset: 'utf8'
    },
    build: {
        outDir: 'dist-lib',
        sourcemap: true,
        minify: false,
        lib: {
            entry: resolve(__dirname, 'src/react/index.js'),
            formats: ['es'],
            fileName: () => 'index.js'
        },
        rollupOptions: {
            external: isExternal,
            output: {
                entryFileNames: 'index.js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]'
            }
        }
    }
});
