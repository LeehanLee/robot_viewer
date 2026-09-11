/**
 * 样式加载器
 *
 * CSS 源码在旁边的 ViewerChrome.css（真实 .css 文件，语法高亮 / stylelint / 编辑器支持），
 * 构建时经 Vite 的 `?raw` 导入把整个文件内容读为字符串并内联进 JS 产物——
 * 宿主项目 import 包即生效，无需（也不应该）再手动引入任何 css 文件。
 *
 * 运行时一次性注入 <style id="rv-chrome-style">（幂等，多实例安全）。
 */
import cssText from './ViewerChrome.css?raw';

let _styleInjected = false;

/** 一次性注入样式（幂等） */
export function ensureViewerChromeStyle() {
    if (_styleInjected || typeof document === 'undefined') return;
    if (document.getElementById('rv-chrome-style')) {
        _styleInjected = true;
        return;
    }
    const style = document.createElement('style');
    style.id = 'rv-chrome-style';
    style.textContent = cssText;
    document.head.appendChild(style);
    _styleInjected = true;
}
