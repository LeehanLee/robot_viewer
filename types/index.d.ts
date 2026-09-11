/**
 * robot-viewer React 封装层类型声明（手写，供 umi max / TS 项目使用）
 */
import type * as React from 'react';

/** 角度单位：弧度（默认）或角度 */
export type AngleUnit = 'rad' | 'deg';

/** 界面语言 */
export type ViewerLang = 'zh-CN' | 'en';

/** 主题 */
export type ViewerTheme = 'dark' | 'light';

/**
 * 工具栏白名单：仅列出值为 true 的按钮会被渲染。
 * 不传 / 传 true = 显示全部按钮；传 false / null = 不显示工具栏。
 */
export interface ToolbarConfig {
    /** 视觉网格显隐 */
    visual?: boolean;
    /** 碰撞体显隐 */
    collision?: boolean;
    /** 惯量张量显隐 */
    inertia?: boolean;
    /** 质心显隐 */
    com?: boolean;
    /** 坐标轴显隐 */
    axes?: boolean;
    /** 关节轴显隐 */
    jointAxes?: boolean;
    /** 阴影显隐 */
    shadow?: boolean;
    /** 增强光照开关 */
    lighting?: boolean;
    /** 地面网格显隐 */
    grid?: boolean;
    /** 关节控制面板开关按钮 */
    joints?: boolean;
    /** 语言切换按钮 */
    language?: boolean;
    /** 主题切换按钮 */
    theme?: boolean;
}

/** 显示开关状态（对应工具栏的显示类按钮） */
export interface DisplayState {
    visual: boolean;
    collision: boolean;
    inertia: boolean;
    com: boolean;
    axes: boolean;
    jointAxes: boolean;
    shadow: boolean;
    lighting: boolean;
    grid: boolean;
}

/** 腰部基准（模型根）位姿；平移单位米，rx/ry/rz 为 URDF RPY 语义（固定轴 X-Y-Z） */
export interface BasePose {
    x?: number;
    y?: number;
    z?: number;
    rx?: number;
    ry?: number;
    rz?: number;
}

/** 关节信息（limits/value 的角度单位由 angleUnit 决定；prismatic 为 m/mm） */
export interface JointInfo {
    name: string;
    type: string;
    child?: string;
    parent?: string;
    /** 是否为平移关节（prismatic） */
    translational: boolean;
    limits: {
        lower: number | null;
        upper: number | null;
        effort: number | null;
        velocity: number | null;
    } | null;
    value: number;
    /** 当前单位显示名（rad / ° / m / mm） */
    unit: string;
}

/** PoseController 关节事件 */
export interface JointEvent {
    type: 'jointChanged' | 'modelChanged';
    model?: any;
    joint?: any;
    jointName?: string;
    value?: number;
    source?: string;
    commit?: boolean;
}

export interface RobotViewerProps {
    /** URDF 路径：相对路径 / 站点绝对路径 / http(s) 完整 URL */
    urdfUrl?: string;
    /** 受控关节角度 { 关节名: 角度值 }，模型加载完成后与变更时自动应用 */
    joints?: Record<string, number>;
    /** 腰部基准（模型根）位姿，受控 */
    basePose?: BasePose;
    /** 角度单位，默认 'rad'（对 joints / basePose 及 ref API 同时生效；关节面板内可切换） */
    angleUnit?: AngleUnit;
    /** URDF 包名映射：{ robot_description: '/assets/robot_description' }（可为绝对路径或完整 URL） */
    packages?: Record<string, string>;
    /**
     * 顶部工具栏：true / 不传 = 显示全部按钮；false / null = 不显示；
     * 对象 = 白名单（仅值为 true 的按钮渲染），如 { visual: true, grid: true, joints: true, theme: true }
     */
    toolbar?: boolean | null | ToolbarConfig;
    /** 显示开关受控状态（不传则由组件内部管理，切换时经 onDisplayChange 通知） */
    display?: Partial<DisplayState>;
    /** 主题，默认 'dark'（不传则内部管理；会写入 document 的 data-theme 以联动画布背景） */
    theme?: ViewerTheme;
    /** 界面语言，默认 'zh-CN' */
    lang?: ViewerLang;
    /** 是否显示地面，默认 true */
    showGround?: boolean;
    /** 工具栏距容器顶部的偏移（像素，默认 0）；关节面板会自动跟随 */
    toolbarOffset?: number;
    /**
     * 关节面板自定义分组规则（最先匹配，优先级最高），未命中的关节走内置启发式（腰/头/臂/手/腿/其他）：
     * [{ label: '云台', patterns: [/gimbal/i, /^ptz/] }]
     */
    jointGroups?: Array<{ label: string; patterns: Array<string | RegExp> }>;
    /** 深色主题工具栏/面板表面色（CSS 颜色，默认 rgba(30,41,59,0.9) 即 #1e293b，比 #0f172a 略浅） */
    darkSurface?: string;
    /** 深色主题 3D 画布背景色（默认 #0b1120，比 #0f172a 略深，便于区分边界） */
    darkCanvas?: string | number;
    /** 浅色主题 3D 画布背景色（缺省用引擎默认白） */
    lightCanvas?: string | number;
    /** 画布背景色（0xRRGGBB 或 [r,g,b]），默认跟随页面 data-theme */
    background?: number | [number, number, number];
    /** 初始相机位置（场景坐标，Y 朝上），默认加载后自适应 */
    cameraPosition?: [number, number, number];
    /** 相机观察目标点 */
    cameraTarget?: [number, number, number];
    style?: React.CSSProperties;
    className?: string;
    /** 开始加载时触发 */
    onLoading?: (urdfUrl: string) => void;
    /** 加载完成时触发（返回关节列表，可据此渲染控制面板） */
    onLoad?: (joints: JointInfo[], model: any) => void;
    /** 加载失败时触发 */
    onError?: (error: Error) => void;
    /** 关节值变化（含视口拖拽、外部设置） */
    onJointEvent?: (event: JointEvent) => void;
    /** 显示开关切换（含初始受控同步），next 为全量状态 */
    onDisplayChange?: (display: DisplayState, changedKey: string) => void;
    /** 主题切换 */
    onThemeChange?: (theme: ViewerTheme) => void;
    /** 语言切换 */
    onLanguageChange?: (lang: ViewerLang) => void;
    /** 关节面板内切换单位（rad/deg）时触发 */
    onAngleUnitChange?: (unit: AngleUnit) => void;
}

/** 组件 ref：完整的核心 API */
export interface RobotViewerHandle {
    /** 从 URL 加载 URDF（相对/绝对/http 路径） */
    loadUrdf(url: string, options?: { packages?: Record<string, string> }): Promise<any | null>;
    /** 设置单个关节值，返回限位后的生效值（旋转 rad/°，prismatic m/mm，由 angleUnit 决定） */
    setJointValue(name: string, value: number): number | null;
    /** 批量设置关节值 */
    setJointValues(values: Record<string, number>): void;
    /** 读取关节值 */
    getJointValue(name: string): number | null;
    /** 读取全部关节值 */
    getPose(): Record<string, number>;
    /** 关节列表（名称/类型/限位/当前值/单位） */
    getJointList(): JointInfo[];
    /** 所有关节复位到 0 */
    resetJoints(): void;
    /** 设置腰部基准（模型根）位姿 xyz + rx ry rz */
    setBasePose(pose: BasePose): void;
    /** 读取当前根位姿 */
    getBasePose(): Required<BasePose>;
    /** 根位姿复位 */
    resetBasePose(): void;
    /** 自适应相机 */
    fitCamera(): void;
    /** 设置相机位置与目标 */
    setCameraView(position?: [number, number, number], target?: [number, number, number]): void;
    /** 地面显隐 */
    setGroundVisible(visible: boolean): void;
    /** 地面网格显隐 */
    setGridVisible(visible: boolean): void;
    /** 设置背景色 */
    setBackground(color: number | [number, number, number]): void;
    /** 忽略关节限位开关 */
    setIgnoreLimits(ignore: boolean): void;
    /** 批量设置显示开关（如 { collision: true, axes: false }） */
    setDisplay(partial: Partial<DisplayState>): void;
    /** 读取当前显示开关状态 */
    getDisplay(): DisplayState;
    /** 单项显示开关：视觉 */
    setVisual(show: boolean): void;
    /** 单项显示开关：碰撞体 */
    setCollision(show: boolean): void;
    /** 单项显示开关：惯量张量 */
    setInertia(show: boolean): void;
    /** 单项显示开关：质心 */
    setCOM(show: boolean): void;
    /** 单项显示开关：坐标轴 */
    setAxes(show: boolean): void;
    /** 单项显示开关：关节轴 */
    setJointAxes(show: boolean): void;
    /** 单项显示开关：阴影 */
    setShadow(show: boolean): void;
    /** 单项显示开关：增强光照 */
    setLighting(show: boolean): void;
    /** 单项显示开关：地面网格 */
    setGrid(show: boolean): void;
    /** 主题（写入 document data-theme 联动画布背景） */
    setTheme(theme: ViewerTheme): void;
    getTheme(): ViewerTheme;
    /** 界面语言 */
    setLanguage(lang: ViewerLang): void;
    getLanguage(): ViewerLang;    /** 底层场景管理器（高级用法） */
    readonly sceneManager: any;
    /** 底层位姿控制器（高级用法） */
    readonly poseController: any;
    /** 当前模型 */
    readonly model: any;
    /** 销毁 */
    dispose(): void;
}

export declare const RobotViewer: React.ForwardRefExoticComponent<
    RobotViewerProps & React.RefAttributes<RobotViewerHandle>
>;

/** 无头核心类（非 React 场景可直接使用） */
export declare class RobotViewerCore implements RobotViewerHandle {
    constructor(container: HTMLElement, options?: {
        angleUnit?: AngleUnit;
        showGround?: boolean;
        packages?: Record<string, string>;
        background?: number | [number, number, number];
        display?: Partial<DisplayState>;
        theme?: ViewerTheme;
        lang?: ViewerLang;
        /** 深色主题画布背景（默认 #0b1120） */
        darkCanvas?: string | number;
        /** 浅色主题画布背景（缺省用引擎默认白） */
        lightCanvas?: string | number;
    });
    angleUnit: AngleUnit;
    /** 当前显示开关状态 */
    display: DisplayState;
    /** 深色主题画布背景 */
    darkCanvas: string | number;
    /** 浅色主题画布背景 */
    lightCanvas: string | number | null;
    loadUrdf(url: string, options?: { packages?: Record<string, string> }): Promise<any | null>;
    setJointValue(name: string, value: number): number | null;
    setJointValues(values: Record<string, number>): void;
    getJointValue(name: string): number | null;
    getPose(): Record<string, number>;
    getJointList(): JointInfo[];
    resetJoints(): void;
    setBasePose(pose: BasePose): void;
    getBasePose(): Required<BasePose>;
    resetBasePose(): void;
    fitCamera(): void;
    setCameraView(position?: [number, number, number], target?: [number, number, number]): void;
    setGroundVisible(visible: boolean): void;
    setGridVisible(visible: boolean): void;
    setBackground(color: number | [number, number, number]): void;
    setIgnoreLimits(ignore: boolean): void;
    setDisplay(partial: Partial<DisplayState>): void;
    getDisplay(): DisplayState;
    setVisual(show: boolean): void;
    setCollision(show: boolean): void;
    setInertia(show: boolean): void;
    setCOM(show: boolean): void;
    setAxes(show: boolean): void;
    setJointAxes(show: boolean): void;
    setShadow(show: boolean): void;
    setLighting(show: boolean): void;
    setGrid(show: boolean): void;
    setTheme(theme: ViewerTheme): void;
    getTheme(): ViewerTheme;
    setLanguage(lang: ViewerLang): void;
    getLanguage(): ViewerLang;
    readonly sceneManager: any;
    readonly poseController: any;
    readonly model: any;
    dispose(): void;
}

/** 顶部工具栏（受控组件，高级用法可单独使用） */
export declare const Toolbar: React.FC<{
    config?: ToolbarConfig;
    /** 距容器顶部偏移（像素，默认 0） */
    offset?: number;
    display?: Partial<DisplayState>;
    onToggleDisplay?: (key: keyof DisplayState) => void;
    jointsOpen?: boolean;
    onToggleJoints?: () => void;
    lang?: ViewerLang;
    onToggleLanguage?: () => void;
    theme?: ViewerTheme;
    onToggleTheme?: () => void;
}>;

/** 关节控制面板（受控组件，高级用法可单独使用） */
export declare const JointPanel: React.FC<{
    core: RobotViewerCore | null;
    angleUnit?: AngleUnit;
    onUnitChange?: (unit: AngleUnit) => void;
    lang?: ViewerLang;
    /** 面板距容器顶部偏移（默认 44，跟随工具栏下缘） */
    topOffset?: number;
    /** 自定义分组规则（优先于内置启发式） */
    jointGroups?: Array<{ label: string; patterns: Array<string | RegExp> }>;
    onClose?: () => void;
    ref?: React.Ref<{ handleJointEvent: (event: JointEvent) => void; refresh: () => void }>;
}>;

/** 关节身体部位自动分组（腰/头/臂/手/腿/其他，命名启发式） */
export declare function groupJoints(
    joints: JointInfo[],
    customRules?: Array<{ label: string; patterns: Array<string | RegExp> }>,
    lang?: ViewerLang
): Array<{ key: string; label: any; joints: JointInfo[] }>;
export declare function groupJoint(
    jointName: string,
    customRules?: Array<{ label: string; patterns: Array<string | RegExp> }>
): { key: string; label: any };
export declare function groupLabel(group: { key: string; label: any }, lang?: ViewerLang): string;

/** 从 URL 加载 URDF 为统一模型（不渲染，便于自定义渲染层） */
export declare function loadUrdfFromUrl(
    url: string,
    options?: {
        packages?: Record<string, string>;
        onAssetProgress?: (loaded: number, total: number, path: string) => void;
    }
): Promise<any>;

export declare function normalizeUrl(path: string, baseUrl?: string): string;
