/**
 * RobotViewer — React 组件（薄封装，带可选工具栏）
 *
 * 用法：
 *   <RobotViewer
 *     urdfUrl="/assets/robot/robot.urdf"
 *     joints={{ shoulder: 30, elbow: -15 }}
 *     basePose={{ x: 0, y: 0, z: 0.1, rx: 0, ry: 0, rz: 0 }}
 *     angleUnit="deg"
 *     toolbar={{ visual: true, collision: true, joints: true, theme: true }}  // 白名单，不传=全显示
 *     display={{ visual: true, grid: true }}                                    // 受控显示状态
 *     ref={viewerRef}
 *   />
 *
 * 通过 ref 暴露 RobotViewerCore 全部方法（setJointValue / setBasePose / setDisplay / ...）。
 */
import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { RobotViewerCore } from './RobotViewerCore.js';
import { Toolbar } from './Toolbar.jsx';
import { JointPanel } from './JointPanel.jsx';
import { ensureViewerChromeStyle } from './ViewerChrome.css.js';

const RobotViewer = forwardRef(function RobotViewer(props, ref) {
    const {
        urdfUrl,
        joints,
        basePose,
        angleUnit,
        packages,
        toolbar = true,          // true=全部按钮；false/null=不显示工具栏；对象=白名单
        display,                 // 受控显示状态（不传则内部自管）
        theme,                   // 'dark' | 'light'（不传则内部自管，默认 dark）
        lang,                    // 'zh-CN' | 'en'（不传则内部自管）
        showGround = true,
        background,
        toolbarOffset = 0,
        jointGroups,
        darkSurface,
        darkCanvas,
        lightCanvas,
        cameraPosition,
        cameraTarget,
        style,
        className,
        onLoading,
        onLoad,
        onError,
        onJointEvent,
        onDisplayChange,
        onThemeChange,
        onLanguageChange,
        onAngleUnitChange,
        ...rest
    } = props;

    const containerRef = useRef(null);
    const [core, setCore] = useState(null);

    // ==================== 内部状态（未受控时的自管状态） ====================

    const [displayState, setDisplayState] = useState(null);   // null = 尚未从 core 初始化
    const [themeState, setThemeState] = useState(theme || 'dark');
    const [langState, setLangState] = useState(lang || 'zh-CN');
    const [unit, setUnit] = useState(angleUnit === 'deg' ? 'deg' : 'rad');
    const [jointsOpen, setJointsOpen] = useState(false);
    const jointPanelRef = useRef(null);

    // 同步给 core 的回调（避免重建 core）
    const callbacksRef = useRef({});
    callbacksRef.current = {
        onLoading, onLoad, onError, onJointEvent, onDisplayChange, onThemeChange, onLanguageChange, onAngleUnitChange
    };

    // 组件树的样式注入（幂等）
    useMemo(() => ensureViewerChromeStyle(), []);

    // 1. 创建 / 销毁 core（仅一次）
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        const instance = new RobotViewerCore(container, {
            angleUnit: unit,
            showGround,
            packages,
            background,
            display: display || undefined,
            theme: theme || 'dark',
            lang: lang || 'zh-CN',
            darkCanvas,
            lightCanvas
        });
        instance.onJointEvent = (event) => {
            callbacksRef.current.onJointEvent?.(event);
            jointPanelRef.current?.handleJointEvent(event);
        };
        setDisplayState(instance.getDisplay());
        setCore(instance);

        return () => {
            setCore(null);
            setDisplayState(null);
            instance.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. angleUnit：prop（受控）→ 内部 state → core
    useEffect(() => {
        if (angleUnit) setUnit(angleUnit === 'deg' ? 'deg' : 'rad');
    }, [angleUnit]);

    useEffect(() => {
        if (core) core.angleUnit = unit;
    }, [core, unit]);

    // 3. 外部 display prop（受控）→ core
    const displayKey = useMemo(() => JSON.stringify(display || null), [display]);
    useEffect(() => {
        if (core && display) {
            core.setDisplay(display);
            setDisplayState(core.getDisplay());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, displayKey]);

    // 4. 外部 theme / lang prop（受控）→ core
    useEffect(() => {
        if (core && theme) {
            core.setTheme(theme);
            setThemeState(theme);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, theme]);

    useEffect(() => {
        if (core && lang) {
            core.setLanguage(lang);
            setLangState(lang);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, lang]);

    // 5. 加载模型（urdfUrl / packages 变化时重新加载）
    const packagesKey = useMemo(() => JSON.stringify(packages || {}), [packages]);

    useEffect(() => {
        if (!core || !urdfUrl) return undefined;

        let cancelled = false;
        callbacksRef.current.onLoading?.(urdfUrl);

        core.loadUrdf(urdfUrl, { packages })
            .then((model) => {
                if (cancelled || !model) return;

                // 加载完成后应用相机与初始位姿
                if (cameraPosition) {
                    core.setCameraView(cameraPosition, cameraTarget);
                } else {
                    core.fitCamera();
                }

                // 应用当前 props 中的关节角与根位姿
                if (joints) core.setJointValues(joints);
                if (basePose) core.setBasePose(basePose);

                callbacksRef.current.onLoad?.(core.getJointList(), model);
            })
            .catch((err) => {
                if (!cancelled) {
                    callbacksRef.current.onError?.(err);
                }
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, urdfUrl, packagesKey]);

    // 6. joints 变化 → 同步关节角
    const jointsKey = useMemo(() => JSON.stringify(joints || {}), [joints]);
    useEffect(() => {
        if (core && joints) {
            core.setJointValues(joints);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, jointsKey]);

    // 7. basePose 变化 → 同步腰部基准位姿
    const basePoseKey = useMemo(() => JSON.stringify(basePose || {}), [basePose]);
    useEffect(() => {
        if (core && basePose) {
            core.setBasePose(basePose);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, basePoseKey]);

    // ==================== 工具栏交互 ====================

    const handleToggleDisplay = (key) => {
        if (!core) return;
        const current = core.getDisplay();
        const next = { ...current, [key]: !current[key] };
        core.setDisplay({ [key]: next[key] });
        setDisplayState(next);
        callbacksRef.current.onDisplayChange?.(next, key);
    };

    const handleToggleJoints = () => {
        setJointsOpen((open) => {
            const next = !open;
            if (next) jointPanelRef.current?.refresh?.();
            return next;
        });
    };

    const handleToggleTheme = () => {
        if (!core) return;
        const next = core.getTheme() === 'dark' ? 'light' : 'dark';
        if (theme) {
            // 受控模式：由宿主更新 theme prop 生效，此处仅通知
            callbacksRef.current.onThemeChange?.(next);
        } else {
            core.setTheme(next);
            setThemeState(next);
            callbacksRef.current.onThemeChange?.(next);
        }
    };

    const handleToggleLanguage = () => {
        if (!core) return;
        const next = core.getLanguage() === 'zh-CN' ? 'en' : 'zh-CN';
        if (lang) {
            // 受控模式：由宿主更新 lang prop 生效，此处仅通知
            callbacksRef.current.onLanguageChange?.(next);
        } else {
            core.setLanguage(next);
            setLangState(next);
            callbacksRef.current.onLanguageChange?.(next);
        }
    };

    const handleUnitChange = (nextUnit) => {
        setUnit(nextUnit);
        callbacksRef.current.onAngleUnitChange?.(nextUnit);
    };

    // ==================== 工具栏白名单 ====================

    const toolbarConfig = useMemo(() => {
        if (toolbar === true) return {};                 // 空 config = 全部默认显示
        if (!toolbar || typeof toolbar !== 'object') return null; // null = 不渲染工具栏
        return toolbar;
    }, [toolbar]);

    // 6. 暴露 core 实例作为 ref（其上即 setJointValue / setBasePose / setDisplay 等全部方法）
    React.useImperativeHandle(ref, () => core, [core]);

    // 深色主题 chrome 颜色变量（可通过 darkSurface / style 覆写；浅色主题不使用这些变量）
    const chromeVars = {
        '--rv-surface': darkSurface ?? 'rgba(30, 41, 59, 0.92)',     // #1e293b，比 #0f172a 略浅一档
        ...(darkSurface != null ? { '--rv-toolbar-bg': darkSurface } : {}),
        '--rv-border': 'rgba(148, 163, 184, 0.18)',
        '--rv-hover': 'rgba(148, 163, 184, 0.18)',
        '--rv-btn-bg': 'rgba(148, 163, 184, 0.12)'
    };

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                minHeight: 200,
                overflow: 'hidden',
                ...chromeVars,
                ...style
            }}
            {...rest}
        >
            {toolbarConfig && core && (
                <Toolbar
                    config={toolbarConfig}
                    offset={toolbarOffset}
                    display={displayState || {}}
                    onToggleDisplay={handleToggleDisplay}
                    jointsOpen={jointsOpen}
                    onToggleJoints={handleToggleJoints}
                    lang={langState}
                    onToggleLanguage={handleToggleLanguage}
                    theme={themeState}
                    onToggleTheme={handleToggleTheme}
                />
            )}

            {toolbarConfig && jointsOpen && core && (
                <JointPanel
                    ref={jointPanelRef}
                    core={core}
                    angleUnit={unit}
                    onUnitChange={handleUnitChange}
                    lang={langState}
                    topOffset={46 + toolbarOffset}
                    jointGroups={jointGroups}
                    onClose={() => setJointsOpen(false)}
                />
            )}
        </div>
    );
});

export default RobotViewer;
