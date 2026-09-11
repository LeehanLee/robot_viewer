/**
 * SSR / Node 环境兜底 shim（必须在封装层所有 import 之前引入）
 *
 * 既有模块 utils/i18n.js 在模块顶层实例化 `new I18n()`，
 * 其构造函数访问浏览器的 navigator / localStorage。为保证 npm 包在
 * Node 环境（umi SSR、单测、prerender 分析等）中可被安全 import，
 * 在缺少这些全局对象时补最小实现。
 *
 * 注意：这仅保证模块可加载；实际渲染仍需要浏览器（WebGL）环境。
 */
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = {
        language: 'zh-CN',
        userLanguage: 'zh-CN'
    };
}
if (typeof globalThis.localStorage === 'undefined') {
    const _store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (_store.has(k) ? _store.get(k) : null),
        setItem: (k, v) => { _store.set(k, String(v)); },
        removeItem: (k) => { _store.delete(k); },
        clear: () => { _store.clear(); }
    };
}
