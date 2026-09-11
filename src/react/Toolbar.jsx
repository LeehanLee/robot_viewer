/**
 * Toolbar — React 版顶部工具栏（对应网页版 top-control-bar 的白名单子集）
 *
 * 按钮分组：
 *   显示开关：visual collision inertia com axes jointAxes shadow lighting grid
 *   工具开关：joints（关节面板）
 *   全局：language theme
 *
 * 全部为受控组件：状态由父级持有，点击仅回调。
 */
import React, { useMemo } from 'react';
import { translations } from '../utils/i18n.js';
import { ensureViewerChromeStyle } from './ViewerChrome.css.js';

/** 显示开关类按钮（对应 core.display 的键） */
const DISPLAY_BUTTONS = [
    { key: 'visual', i18nKey: 'visual' },
    { key: 'collision', i18nKey: 'collision' },
    { key: 'inertia', i18nKey: 'inertia' },
    { key: 'com', i18nKey: 'com' },
    { key: 'axes', i18nKey: 'axes' },
    { key: 'jointAxes', i18nKey: 'jointAxes' },
    { key: 'shadow', i18nKey: 'shadow' },
    { key: 'lighting', i18nKey: 'lighting' },
    { key: 'grid', i18nKey: 'grid' }
];

/**
 * @param {Object} props
 * @param {Object} props.config - 白名单 { visual: true, ... }，仅 true 的按钮渲染
 * @param {number} [props.offset=0] - 距容器顶部的偏移（像素）
 * @param {Object} props.display - 显示开关状态 { visual: true, ... }
 * @param {(key: string) => void} props.onToggleDisplay
 * @param {boolean} props.jointsOpen - 关节面板是否打开
 * @param {() => void} props.onToggleJoints
 * @param {'zh-CN'|'en'} props.lang
 * @param {() => void} props.onToggleLanguage
 * @param {'dark'|'light'} props.theme
 * @param {() => void} props.onToggleTheme
 */
export function Toolbar(props) {
    const {
        config,
        offset = 0,
        display = {},
        onToggleDisplay,
        jointsOpen = false,
        onToggleJoints,
        lang = 'zh-CN',
        onToggleLanguage,
        theme = 'dark',
        onToggleTheme
    } = props;

    useMemo(() => ensureViewerChromeStyle(), []);

    const t = (key) => translations[lang]?.[key] || key;

    const visibleDisplayButtons = DISPLAY_BUTTONS.filter((b) => config[b.key] !== false);
    const showJoints = config.joints !== false;
    const showLanguage = config.language !== false;
    const showTheme = config.theme !== false;
    const hasTools = showJoints || showLanguage || showTheme;

    const btn = (active, label, onClick, extra) => (
        <button
            type="button"
            className={`rv-toolbar-btn${active ? ' rv-active' : ''}${extra || ''}`}
            onClick={onClick}
        >
            {label}
        </button>
    );

    return (
        <div className="rv-toolbar" role="toolbar" style={{ top: offset }}>
            <div className="rv-toolbar-group">
                {visibleDisplayButtons.map((b) =>
                    btn(!!display[b.key], t(b.i18nKey), () => onToggleDisplay?.(b.key))
                )}
            </div>

            {hasTools && <div className="rv-toolbar-divider" />}

            <div className="rv-toolbar-group">
                {showJoints && btn(jointsOpen, t('joints'), () => onToggleJoints?.(), ' rv-tool')}
                {showLanguage &&
                    btn(false, lang === 'zh-CN' ? '语言/EN' : 'EN/中文', () => onToggleLanguage?.(), ' rv-tool')}
                {showTheme &&
                    btn(false, theme === 'dark' ? '🌙' : '☀️', () => onToggleTheme?.(), ' rv-tool')}
            </div>
        </div>
    );
}

export default Toolbar;
