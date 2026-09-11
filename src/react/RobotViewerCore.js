/**
 * RobotViewerCore — 无头（headless）核心，供 React 组件或其他框架封装使用
 *
 * 仅复用既有模块，不修改任何既有源码：
 *   - SceneManager   （场景 / 相机 / 渲染 / 网格地面 / 各子 Manager）
 *   - PoseController （关节角度写入的唯一通道，含限位与约束处理）
 *   - UrdfUrlLoader  （本封装层的 URL 加载器）
 *   - i18n           （中英文案，工具栏与关节面板复用）
 *
 * 提供：
 *   - loadUrdf(url)                支持相对 / 绝对 / http(s) 路径
 *   - setJointValue(s)             各关节角度控制（rad 或 deg，prismatic 自动切 m/mm）
 *   - setBasePose({x,y,z,rx,ry,rz}) 腰部基准（模型根）位姿控制
 *   - setDisplay / setVisual 等    视觉/碰撞/惯量/质心/坐标轴/关节轴/阴影/光照/网格开关
 *   - setTheme / setLanguage       主题与语言（工具栏按钮用）
 *   - getJointList / getPose / resetJoints / fitCamera / dispose 等
 */
import './ssrShim.js'; // 必须最先执行（i18n 顶层实例化依赖 navigator/localStorage）
import * as THREE from 'three';
import { SceneManager } from '../renderer/SceneManager.js';
import { PoseController } from '../animation/runtime/PoseController.js';
import { i18n } from '../utils/i18n.js';
import { loadUrdfFromUrl } from './UrdfUrlLoader.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const DEFAULT_BASE_POSE = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

/** THREE.Color 可解析的颜色格式：#hex(3~8位) / rgb() / rgba() / hsl() / hsla() */
const CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

/**
 * 规范化画布背景颜色值。
 * THREE.Color 遇到无法解析的字符串（如 var(--x)）会静默回退为白色，
 * 这里提前解析/校验，失败时回退默认值并告警，杜绝"白屏白网格"。
 */
function normalizeCanvasColor(value, fallback) {
    if (value == null) return fallback;
    if (typeof value === 'number') return value;
    if (value && value.isColor) return value;

    let v = String(value).trim();

    // CSS 变量 / env()：借探针元素解析为具体颜色值
    if (typeof document !== 'undefined' && /var\(|env\(/i.test(v)) {
        try {
            const probe = document.createElement('span');
            probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
            probe.style.color = v;
            document.body.appendChild(probe);
            const computed = getComputedStyle(probe).color; // 如 "rgb(11, 17, 32)"
            document.body.removeChild(probe);
            if (computed && CSS_COLOR_RE.test(computed.replace(/\s+/g, ''))) {
                v = computed;
            }
        } catch (e) { /* 解析失败走校验回退 */ }
    }

    v = v.trim();
    if (CSS_COLOR_RE.test(v.replace(/\s+/g, ''))) {
        return v;
    }
    console.warn(
        `[robot-viewer] Unparseable canvas color "${value}", falling back to "${fallback}". ` +
        'Supported: #hex / rgb() / rgba() / hsl() / css var() / THREE.Color'
    );
    return fallback;
}

/** 引擎默认显示状态（与 VisualizationManager / UIController 初始态一致） */
const DEFAULT_DISPLAY = {
    visual: true,
    collision: false,
    inertia: false,
    com: false,
    axes: false,
    jointAxes: false,
    shadow: true,
    lighting: true,
    grid: true
};

export class RobotViewerCore {
    /**
     * @param {HTMLElement} container - 挂载容器（组件内部会自动创建并插入 canvas）
     * @param {Object} [options]
     * @param {'rad'|'deg'} [options.angleUnit='rad'] - 对外 API 的角度单位
     * @param {boolean} [options.showGround=true] - 是否显示地面
     * @param {Object} [options.packages] - URDF 包名映射（包名 -> 基础路径/URL）
     * @param {number|Array} [options.background] - 画布背景色（默认跟随页面 data-theme）
     * @param {Object} [options.display] - 显示开关初始状态（见 DEFAULT_DISPLAY）
     * @param {'dark'|'light'} [options.theme] - 主题（写入 document data-theme，供引擎背景联动）
     * @param {'zh-CN'|'en'} [options.lang] - 界面语言（i18n）
     * @param {string|number} [options.darkCanvas='#0b1120'] - 深色主题画布背景（覆盖引擎默认灰 #505050）
     * @param {string|number} [options.lightCanvas] - 浅色主题画布背景（缺省用引擎默认白）
     */
    constructor(container, options = {}) {
        if (!container) {
            throw new Error('[robot-viewer] container is required');
        }

        this.options = options;
        this.angleUnit = options.angleUnit === 'deg' ? 'deg' : 'rad';

        // 创建 canvas（SceneManager 内部用 ResizeObserver 监听父容器尺寸变化）
        const canvas = document.createElement('canvas');
        Object.assign(canvas.style, {
            display: 'block',
            width: '100%',
            height: '100%',
            outline: 'none',
            touchAction: 'none'
        });
        container.appendChild(canvas);

        this.container = container;
        this.canvas = canvas;

        // 复用既有渲染核心
        this.sceneManager = new SceneManager(canvas);
        this.poseController = new PoseController(this.sceneManager);
        this.sceneManager.setPoseController(this.poseController);

        // i18n（FileHandler 等既有模块通过 window.i18n 访问文案）
        if (typeof window !== 'undefined' && !window.i18n) {
            window.i18n = i18n;
        }
        this.lang = options.lang || i18n.getCurrentLanguage() || 'zh-CN';
        if (options.lang) {
            i18n.setLanguage(options.lang);
        }

        // 状态
        this.model = null;
        this._jointInternal = {};                   // 内部值：旋转=弧度，平移=米
        this._basePose = { ...DEFAULT_BASE_POSE };  // 平移米 / 旋转内部用弧度
        this.display = { ...DEFAULT_DISPLAY, ...(options.display || {}) };
        this.theme = options.theme || 'dark';
        // 画布背景色（引擎 updateBackgroundColor 写死 dark→#505050，此处封装层覆盖：
        // 主题切换后引擎 MutationObserver 会先写引擎默认色，再由 _applyCanvasBackground 补回）
        this.darkCanvas = options.darkCanvas ?? '#0b1120';
        this.lightCanvas = options.lightCanvas ?? null;
        this._loadSeq = 0;
        this._disposed = false;
        this._rafId = null;

        // 主题（写入 data-theme，SceneManager 的 MutationObserver 会自动联动背景/网格颜色）
        this._applyTheme();

        // 关节事件回调（React 层订阅用）
        this.onJointEvent = null;
        this._unsubscribeJoints = this.poseController.subscribe((event) => {
            if (event && event.type === 'jointChanged') {
                this.onJointEvent?.(event);
            }
        });

        if (options.showGround === false) {
            this.sceneManager.setGroundVisible(false);
        }
        if (options.background != null) {
            this.setBackground(options.background);
        }

        this._startLoop();
    }

    // ==================== 渲染循环 ====================

    _startLoop() {
        const tick = () => {
            if (this._disposed) return;
            this._rafId = requestAnimationFrame(tick);
            this.sceneManager.update();
            this.sceneManager.renderIfNeeded();
        };
        this._rafId = requestAnimationFrame(tick);
    }

    // ==================== 模型加载 ====================

    /**
     * 从 URL 加载 URDF（相对路径 / 站点绝对路径 / http(s) 完整地址）
     * @param {string} url
     * @param {Object} [options] - { packages, onAssetProgress, showGround }
     * @returns {Promise<Object|null>} 统一模型；若期间被新加载覆盖则返回 null
     */
    async loadUrdf(url, options = {}) {
        const seq = ++this._loadSeq;
        const packages = options.packages ?? this.options.packages;

        const model = await loadUrdfFromUrl(url, {
            packages,
            onAssetProgress: options.onAssetProgress
        });

        if (this._disposed || seq !== this._loadSeq) {
            return null; // 已被更新的加载请求取代
        }

        this.model = model;
        this.poseController.setModel(model);
        this.sceneManager.addModel(model); // addModel 内部会移除旧模型

        if (options.showGround != null) {
            this.sceneManager.setGroundVisible(!!options.showGround);
        }

        // 重放挂载后已下发的关节角与根位姿（覆盖换模型场景）
        for (const [name, internal] of Object.entries(this._jointInternal)) {
            this._setJointInternal(name, internal);
        }
        this._applyBasePose();

        // 重放显示开关（visual/collision 由引擎自动应用于新 mesh，inertia/com/axes 等需重放）
        this._applyDisplay();

        this.sceneManager.redraw();
        return model;
    }

    // ==================== 关节控制 ====================

    /** 该关节是否为平移关节（prismatic，内部值单位为米而非弧度） */
    _isTranslational(name) {
        return this.model?.joints?.get(name)?.type === 'prismatic';
    }

    /** 外部显示值 -> 内部值（旋转：deg→rad；平移：deg 模式 mm→m） */
    _toInternal(name, value) {
        if (this._isTranslational(name)) {
            return this.angleUnit === 'deg' ? value / 1000 : value;
        }
        return this.angleUnit === 'deg' ? value * DEG2RAD : value;
    }

    /** 内部值 -> 外部显示值（旋转：rad→deg；平移：deg 模式 m→mm） */
    _toDisplay(name, internal) {
        if (this._isTranslational(name)) {
            return this.angleUnit === 'deg' ? internal * 1000 : internal;
        }
        return this.angleUnit === 'deg' ? internal * RAD2DEG : internal;
    }

    _setJointInternal(name, internal) {
        const applied = this.poseController.setJointValue(name, internal, { source: 'external' });
        if (applied != null) {
            this._jointInternal[name] = applied;
        }
        return applied;
    }

    /**
     * 设置单个关节值
     * @param {string} name - 关节名
     * @param {number} value - 数值（旋转关节：rad 或 deg；prismatic：m 或 mm，由 angleUnit 决定）
     * @returns {number|null} 实际生效值（含限位钳制），单位同输入
     */
    setJointValue(name, value) {
        const applied = this._setJointInternal(name, this._toInternal(name, value));
        return applied == null ? null : this._toDisplay(name, applied);
    }

    /**
     * 批量设置关节值
     * @param {Object} values - { 关节名: 数值 }
     */
    setJointValues(values) {
        if (!values) return;
        for (const [name, value] of Object.entries(values)) {
            if (Number.isFinite(Number(value))) {
                this._setJointInternal(name, this._toInternal(name, Number(value)));
            }
        }
    }

    /**
     * 读取当前关节值（单位由 angleUnit 决定）
     */
    getJointValue(name) {
        const internal = this._jointInternal[name];
        return internal == null ? null : this._toDisplay(name, internal);
    }

    /**
     * 读取全部非 fixed 关节当前值
     */
    getPose() {
        const pose = {};
        for (const [name, internal] of Object.entries(this._jointInternal)) {
            pose[name] = this._toDisplay(name, internal);
        }
        return pose;
    }

    /**
     * 获取关节列表（含类型 / 限位 / 当前值），供外部生成控制面板
     * limits 与 value 的单位由 angleUnit 决定（prismatic：m/mm）
     * @returns {Array<{name:string,type:string,child?:string,parent?:string,translational:boolean,limits:Object|null,value:number,unit:string}>}
     */
    getJointList() {
        if (!this.model?.joints) return [];
        const list = [];
        this.model.joints.forEach((joint, name) => {
            const translational = joint.type === 'prismatic';
            const unit = translational
                ? (this.angleUnit === 'deg' ? 'mm' : 'm')
                : (this.angleUnit === 'deg' ? '°' : 'rad');
            list.push({
                name,
                type: joint.type,
                child: joint.child,
                parent: joint.parent,
                translational,
                limits: joint.limits
                    ? {
                        lower: Number.isFinite(joint.limits.lower) ? this._toDisplay(name, joint.limits.lower) : null,
                        upper: Number.isFinite(joint.limits.upper) ? this._toDisplay(name, joint.limits.upper) : null,
                        effort: joint.limits.effort ?? null,
                        velocity: joint.limits.velocity ?? null
                    }
                    : null,
                value: this.getJointValue(name) ?? 0,
                unit
            });
        });
        return list;
    }

    /**
     * 所有关节复位到 0
     */
    resetJoints() {
        if (!this.model?.joints) return;
        this.model.joints.forEach((joint, name) => {
            if (joint.type !== 'fixed') {
                this._setJointInternal(name, 0);
            }
        });
    }

    // ==================== 腰部基准（模型根）位姿控制 ====================

    /**
     * 设置模型根（腰部基准关节）位姿
     * 平移单位为米；rx/ry/rz 按 URDF RPY（绕固定轴 X-Y-Z，先 rx 后 ry 后 rz）解释，
     * 角度单位由 angleUnit 决定。坐标系为 URDF 自身坐标系（通常 Z 朝上）。
     * @param {Object} pose - { x=0, y=0, z=0, rx=0, ry=0, rz=0 }（缺省项保持原值）
     */
    setBasePose(pose = {}) {
        const cur = this._basePose;
        const next = { ...cur };
        for (const key of ['x', 'y', 'z']) {
            if (Number.isFinite(Number(pose[key]))) {
                next[key] = Number(pose[key]);
            }
        }
        for (const key of ['rx', 'ry', 'rz']) {
            if (Number.isFinite(Number(pose[key]))) {
                next[key] = this.angleUnit === 'deg' ? Number(pose[key]) * DEG2RAD : Number(pose[key]);
            }
        }
        this._basePose = next;
        this._applyBasePose();
    }

    _applyBasePose() {
        const root = this.model?.threeObject;
        if (!root) return;

        const { x, y, z, rx, ry, rz } = this._basePose;

        // 平移（URDF 坐标系）
        root.position.set(x, y, z);

        // URDF rpy 语义：R = Rz(rz) · Ry(ry) · Rx(rx)
        const q = new THREE.Quaternion()
            .setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry))
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx));
        root.quaternion.copy(q);

        this.sceneManager.redraw();
    }

    /**
     * 读取当前根位姿（角度单位由 angleUnit 决定）
     */
    getBasePose() {
        const { x, y, z, rx, ry, rz } = this._basePose;
        const fromRad = (r) => (this.angleUnit === 'deg' ? r * RAD2DEG : r);
        return { x, y, z, rx: fromRad(rx), ry: fromRad(ry), rz: fromRad(rz) };
    }

    /**
     * 根位姿复位
     */
    resetBasePose() {
        this._basePose = { ...DEFAULT_BASE_POSE };
        this._applyBasePose();
    }

    // ==================== 显示开关（工具栏按钮的底层能力） ====================

    /**
     * 批量设置显示状态（只合并传入的键）
     * @param {Object} partial - 如 { collision: true, axes: false }
     */
    setDisplay(partial = {}) {
        for (const [key, value] of Object.entries(partial)) {
            if (key in this.display && typeof value === 'boolean') {
                this.display[key] = value;
            }
        }
        this._applyDisplay();
    }

    /** 读取当前显示状态副本 */
    getDisplay() {
        return { ...this.display };
    }

    setVisual(show) {
        this.display.visual = !!show;
        this.sceneManager.visualizationManager.toggleVisual(this.display.visual, this.sceneManager.currentModel);
        this.sceneManager.redraw();
    }

    setCollision(show) {
        this.display.collision = !!show;
        this.sceneManager.visualizationManager.toggleCollision(this.display.collision);
        this.sceneManager.redraw();
    }

    setInertia(show) {
        this.display.inertia = !!show;
        this.sceneManager.inertialVisualization.toggleInertia(this.display.inertia, this.sceneManager.currentModel);
        this.sceneManager.redraw();
    }

    setCOM(show) {
        this.display.com = !!show;
        this.sceneManager.inertialVisualization.toggleCenterOfMass(this.display.com, this.sceneManager.currentModel);
        this.sceneManager.updateVisualTransparency();
        this.sceneManager.redraw();
    }

    setAxes(show) {
        this.display.axes = !!show;
        if (this.display.axes) {
            this.sceneManager.axesManager.showAllAxes();
        } else {
            this.sceneManager.axesManager.hideAllAxes();
        }
        this.sceneManager.updateVisualTransparency();
        this.sceneManager.redraw();
    }

    setJointAxes(show) {
        this.display.jointAxes = !!show;
        if (this.display.jointAxes) {
            this.sceneManager.axesManager.showAllJointAxes();
        } else {
            this.sceneManager.axesManager.hideAllJointAxes();
        }
        this.sceneManager.updateVisualTransparency();
        this.sceneManager.redraw();
    }

    setShadow(show) {
        this.display.shadow = !!show;
        this.sceneManager.visualizationManager.toggleShadow(
            this.display.shadow,
            this.sceneManager.renderer,
            this.sceneManager.directionalLight
        );
        if (this.display.shadow) {
            this.sceneManager.axesManager.ensureAxesNoShadow();
            this.sceneManager.updateEnvironment(false);
        }
        this.sceneManager.redraw();
    }

    setLighting(show) {
        this.display.lighting = !!show;
        this.sceneManager.visualizationManager.toggleEnhancedLighting(this.display.lighting);
        this.sceneManager.redraw();
    }

    setGrid(show) {
        this.display.grid = !!show;
        this.sceneManager.setGridVisible(this.display.grid);
    }

    /**
     * 把 this.display 全量应用到引擎（初始化与模型重载后重放）
     */
    _applyDisplay() {
        const sm = this.sceneManager;
        sm.visualizationManager.toggleVisual(this.display.visual, sm.currentModel);
        sm.visualizationManager.toggleCollision(this.display.collision);
        sm.inertialVisualization.toggleInertia(this.display.inertia, sm.currentModel);
        sm.inertialVisualization.toggleCenterOfMass(this.display.com, sm.currentModel);
        if (this.display.axes) sm.axesManager.showAllAxes(); else sm.axesManager.hideAllAxes();
        if (this.display.jointAxes) sm.axesManager.showAllJointAxes(); else sm.axesManager.hideAllJointAxes();
        sm.visualizationManager.toggleShadow(this.display.shadow, sm.renderer, sm.directionalLight);
        if (this.display.shadow) sm.axesManager.ensureAxesNoShadow();
        sm.visualizationManager.toggleEnhancedLighting(this.display.lighting);
        sm.setGridVisible(this.display.grid);
        sm.updateVisualTransparency();
        sm.redraw();
    }

    // ==================== 主题与语言 ====================

    /**
     * 设置主题。会写入 document.documentElement 的 data-theme 属性与 localStorage，
     * SceneManager 通过 MutationObserver 自动联动画布背景与网格颜色；
     * 若配置了 darkCanvas/lightCanvas，会在观察者回调之后重新覆盖画布背景。
     * 注意：若宿主页面自身使用 data-theme，请避免冲突（本属性为 W3C 非推荐自定义属性）。
     * @param {'dark'|'light'} theme
     */
    setTheme(theme) {
        if (theme !== 'dark' && theme !== 'light') return;
        this.theme = theme;
        this._applyTheme();
    }

    getTheme() {
        return this.theme;
    }

    _applyTheme() {
        if (typeof document === 'undefined') return;
        document.documentElement.setAttribute('data-theme', this.theme);
        try { localStorage.setItem('theme', this.theme); } catch (e) { /* ignore */ }

        // 立即应用 + rAF 兜底：data-theme 变更会异步触发引擎 updateBackgroundColor
        //（dark→#505050），在观察者回调之后再覆盖一次，保证自定义背景生效
        this._applyCanvasBackground();
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => this._applyCanvasBackground());
        }
    }

    /**
     * 按主题应用画布背景（显式 background prop 优先，未配置的主题色则用引擎默认）
     */
    _applyCanvasBackground() {
        if (this.options.background != null || typeof document === 'undefined') return;
        const isDark = this.theme === 'dark';
        const raw = isDark ? this.darkCanvas : this.lightCanvas;
        if (raw == null) return;
        const color = normalizeCanvasColor(raw, isDark ? '#0b1120' : '#ffffff');
        try {
            this.sceneManager.scene.background = new THREE.Color(color);
            this.sceneManager.redraw();
        } catch (e) { /* ignore */ }
    }

    /**
     * 设置界面语言（i18n：zh-CN / en）
     * @param {'zh-CN'|'en'} lang
     */
    setLanguage(lang) {
        if (lang !== 'zh-CN' && lang !== 'en') return;
        this.lang = lang;
        i18n.setLanguage(lang);
    }

    getLanguage() {
        return this.lang;
    }

    // ==================== 视图控制 ====================

    /** 自适应相机（框住整个模型） */
    fitCamera() {
        this.sceneManager.updateEnvironment(true);
    }

    /** 设置相机位置（场景坐标，Y 朝上）与观察目标 */
    setCameraView(position = [2, 2, 2], target = [0, 0, 0]) {
        this.sceneManager.camera.position.set(position[0], position[1], position[2]);
        this.sceneManager.controls.target.set(target[0], target[1], target[2]);
        this.sceneManager.controls.update();
        this.sceneManager.redraw();
    }

    /** 地面显隐 */
    setGroundVisible(visible) {
        this.sceneManager.setGroundVisible(!!visible);
    }

    /** 地面网格显隐 */
    setGridVisible(visible) {
        this.display.grid = !!visible;
        this.sceneManager.setGridVisible(this.display.grid);
    }

    /** 设置背景色（0xRRGGBB 数字或 [r,g,b]） */
    setBackground(color) {
        const c = Array.isArray(color) ? new THREE.Color(color[0], color[1], color[2]) : new THREE.Color(color);
        this.sceneManager.scene.background = c;
        this.sceneManager.redraw();
    }

    /** 是否忽略关节限位 */
    setIgnoreLimits(ignore) {
        this.sceneManager.ignoreLimits = !!ignore;
    }

    // ==================== 销毁 ====================

    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        this._unsubscribeJoints?.();
        this.onJointEvent = null;

        try {
            if (this.sceneManager.currentModel) {
                this.sceneManager.removeModel(this.sceneManager.currentModel);
            }
        } catch (e) { /* ignore */ }

        this.poseController.setModel(null);

        try { this.sceneManager.controls?.dispose?.(); } catch (e) { /* ignore */ }
        try { this.sceneManager.resizeObserver?.disconnect?.(); } catch (e) { /* ignore */ }

        // 释放 GPU 资源
        try {
            this.sceneManager.scene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose?.();
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach((m) => {
                        for (const k in m) {
                            const v = m[k];
                            if (v && v.isTexture) v.dispose?.();
                        }
                        m.dispose?.();
                    });
                }
            });
        } catch (e) { /* ignore */ }

        try { this.sceneManager.renderer.dispose(); } catch (e) { /* ignore */ }

        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        this.model = null;
    }
}
