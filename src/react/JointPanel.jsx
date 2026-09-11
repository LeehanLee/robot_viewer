/**
 * JointPanel — React 自建关节控制面板（方案 B，零 antd 依赖）
 *
 * 功能（对齐原版 JointControlsUI 的核心子集）：
 *   - 按身体部位自动分组：腰 / 头 / 臂 / 手 / 腿 / 其他（命名启发式，任意 URDF 通用；
 *     命中不到的关节进"其他"，可用 jointGroups 规则由调用方补充）
 *   - 关节滑块 + 数值输入（单位随 angleUnit：旋转 rad/°，prismatic m/mm）
 *   - RAD / DEG 单位切换
 *   - 一键复位全部关节
 *   - 视口拖拽关节时滑块实时同步（由父级转发 jointEvent）
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { translations } from '../utils/i18n.js';
import { ensureViewerChromeStyle } from './ViewerChrome.css.js';
import { groupJoints, groupLabel } from './jointGroups.js';

/**
 * @param {Object} props
 * @param {import('./RobotViewerCore.js').RobotViewerCore|null} props.core
 * @param {'rad'|'deg'} props.angleUnit
 * @param {(unit: 'rad'|'deg') => void} props.onUnitChange
 * @param {'zh-CN'|'en'} props.lang
 * @param {number} [props.topOffset=54] - 面板距容器顶部的偏移（跟随工具栏高度 46 + 间距）
 * @param {Array<{label:string, patterns:Array<string|RegExp>}>} [props.jointGroups]
 * @param {() => void} props.onClose
 */
const JointPanel = forwardRef(function JointPanel(props, ref) {
    const {
        core,
        angleUnit = 'rad',
        onUnitChange,
        lang = 'zh-CN',
        topOffset = 54,
        jointGroups: customGroupRules,
        onClose
    } = props;

    const [joints, setJoints] = useState([]);
    const [collapsed, setCollapsed] = useState({}); // { [groupKey]: boolean }
    const jointsRef = useRef(joints);
    jointsRef.current = joints;

    useMemo(() => ensureViewerChromeStyle(), []);

    const t = (key) => translations[lang]?.[key] || key;

    // 关节列表刷新（模型加载 / 单位切换 / 外部事件后）
    const refresh = () => {
        if (!core) {
            setJoints([]);
            return;
        }
        setJoints(core.getJointList());
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, angleUnit]);

    // 暴露给父级：视口拖拽关节时同步滑块
    useImperativeHandle(ref, () => ({
        handleJointEvent(event) {
            if (!event || event.type !== 'jointChanged') return;
            const name = event.jointName;
            if (name == null || !core) return;
            setJoints((prev) => {
                if (!prev.length) return prev;
                const idx = prev.findIndex((j) => j.name === name);
                if (idx < 0) return prev;
                const next = prev.slice();
                const updated = { ...next[idx], value: core.getJointValue(name) ?? next[idx].value };
                next[idx] = updated;
                return next;
            });
        },
        refresh
    }), [core]);

    // ==================== 分组（身体部位启发式 + 调用方规则） ====================

    const groups = useMemo(() => {
        const controllable = (joints || []).filter((j) => j.type !== 'fixed');
        const fixedCount = (joints || []).length - controllable.length;
        const grouped = groupJoints(controllable, customGroupRules, lang)
            .map((g) => ({ ...g, label: groupLabel(g, lang), fixedCount: 0 }));
        if (fixedCount > 0 && grouped.length > 0) {
            grouped[grouped.length - 1].fixedCount = fixedCount;
        }
        return grouped;
    }, [joints, customGroupRules, lang]);

    const toggleGroup = (key) => {
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // ==================== 交互处理 ====================

    const setJoint = (name, displayValue) => {
        if (!core) return;
        const applied = core.setJointValue(name, displayValue);
        setJoints((prev) => prev.map((j) => (j.name === name ? { ...j, value: applied ?? displayValue } : j)));
    };

    const handleSlider = (joint, rawValue) => {
        setJoint(joint.name, Number(rawValue));
    };

    const handleNumberCommit = (joint, rawValue) => {
        const v = Number(rawValue);
        if (Number.isFinite(v)) {
            setJoint(joint.name, v);
        }
    };

    const handleReset = () => {
        core?.resetJoints();
        refresh();
    };

    // 滑块范围与步长（无 limits 时给宽默认值）
    const sliderBounds = (joint) => {
        const lower = joint.limits?.lower;
        const upper = joint.limits?.upper;
        if (lower != null && upper != null && upper > lower) {
            return { min: lower, max: upper };
        }
        if (joint.translational) {
            return angleUnit === 'deg' ? { min: -1000, max: 1000 } : { min: -1, max: 1 };
        }
        return angleUnit === 'deg' ? { min: -360, max: 360 } : { min: -Math.PI * 2, max: Math.PI * 2 };
    };

    const stepOf = (joint) => {
        if (joint.translational) {
            return angleUnit === 'deg' ? 1 : 0.001;
        }
        return angleUnit === 'deg' ? 0.5 : 0.01;
    };

    const decimalsOf = (joint) => {
        if (joint.translational) {
            return angleUnit === 'deg' ? 1 : 3;
        }
        return angleUnit === 'deg' ? 1 : 2;
    };

    // ==================== 渲染 ====================

    const renderJoint = (joint) => {
        const { min, max } = sliderBounds(joint);
        const step = stepOf(joint);
        const decimals = decimalsOf(joint);
        return (
            <div className="rv-joint-item" key={joint.name}>
                <div className="rv-joint-item-label">
                    <span className="rv-joint-name" title={joint.name}>{joint.name}</span>
                    <span className="rv-joint-type">{joint.type}</span>
                </div>
                <div className="rv-joint-row">
                    <input
                        className="rv-joint-slider"
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={joint.value}
                        onChange={(e) => handleSlider(joint, e.target.value)}
                    />
                    <input
                        className="rv-joint-value"
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={Number(joint.value.toFixed(decimals))}
                        onChange={(e) => handleNumberCommit(joint, e.target.value)}
                    />
                    <span className="rv-joint-unit">{joint.unit}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="rv-joint-panel" style={{ top: topOffset }}>
            <div className="rv-joint-panel-header">
                <span className="rv-joint-panel-title">{t('joints')}</span>
                <div className="rv-unit-toggle">
                    <button
                        type="button"
                        className={`rv-unit-btn${angleUnit === 'rad' ? ' rv-active' : ''}`}
                        onClick={() => onUnitChange?.('rad')}
                    >
                        RAD
                    </button>
                    <button
                        type="button"
                        className={`rv-unit-btn${angleUnit === 'deg' ? ' rv-active' : ''}`}
                        onClick={() => onUnitChange?.('deg')}
                    >
                        DEG
                    </button>
                </div>
                <div className="rv-joint-panel-actions">
                    <button type="button" className="rv-icon-btn" onClick={handleReset} title={t('reset')}>
                        ⟲
                    </button>
                    <button type="button" className="rv-icon-btn" onClick={onClose} title="✕">
                        ✕
                    </button>
                </div>
            </div>

            <div className="rv-joint-list">
                {groups.length === 0 && <div className="rv-joint-empty">{t('noModel')}</div>}
                {groups.map((group) => {
                    const isCollapsed = !!collapsed[group.key];
                    return (
                        <div className="rv-joint-group" key={group.key}>
                            <div
                                className="rv-joint-group-header"
                                onClick={() => toggleGroup(group.key)}
                                title={group.label}
                            >
                                <span className={`rv-joint-group-chevron${isCollapsed ? '' : ' rv-open'}`}>▶</span>
                                <span>{group.label}</span>
                                <span className="rv-joint-group-count">
                                    ({group.joints.length}{group.fixedCount ? ` +${group.fixedCount} fixed` : ''})
                                </span>
                            </div>
                            {!isCollapsed && group.joints.map(renderJoint)}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export { JointPanel };
export default JointPanel;
