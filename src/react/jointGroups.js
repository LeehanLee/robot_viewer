/**
 * 关节身体部位自动分组（启发式，适用于任意 URDF）
 *
 * 原理：URDF 无身体部位语义，按关节名的常见命名习惯做正则匹配。
 * 匹配优先级（避免歧义命中，如 arm_hand 应归"手"）：
 *   腰 > 头 > 手 > 腿 > 臂 > 其他
 *
 * 命中不到的关节进入"其他"分组，保证任意 URDF 不丢关节；
 * 调用方可通过 RobotViewer 的 jointGroups prop 传自定义规则（最先匹配，优先级最高）。
 */

/** 分组正则定义（顺序即优先级） */
const GROUP_DEFS = [
    // 腰：躯干/腰部基准
    { key: 'waist', patterns: [/waist/i, /torso/i, /trunk/i] },
    // 头
    { key: 'head', patterns: [/head/i, /neck/i] },
    // 手：末端执行器（优先于臂，使 arm_hand 类命名归入手）
    { key: 'hand', patterns: [/gripper/i, /grip/i, /finger/i, /claw/i, /hand/i] },
    // 腿（含四足：hip/thigh/calf 归腿）
    {
        key: 'leg',
        patterns: [/leg/i, /hip/i, /thigh/i, /knee/i, /calf/i, /shank/i, /ankle/i, /foot/i, /heel/i, /sole/i, /toe/i]
    },
    // 臂（wrist 归臂）
    { key: 'arm', patterns: [/arm/i, /shoulder/i, /shou/i, /elbow/i, /wrist/i, /forearm/i] }
];

/** 分组展示顺序与中英文标签 */
const GROUP_ORDER = ['waist', 'head', 'arm', 'hand', 'leg', 'other'];

const GROUP_LABELS = {
    waist: { 'zh-CN': '腰', en: 'Waist' },
    head: { 'zh-CN': '头', en: 'Head' },
    arm: { 'zh-CN': '臂', en: 'Arm' },
    hand: { 'zh-CN': '手', en: 'Hand' },
    leg: { 'zh-CN': '腿', en: 'Leg' },
    other: { 'zh-CN': '其他', en: 'Others' }
};

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将关节名归入分组
 * @param {string} jointName - 关节名
 * @param {Array<{label:string, patterns:Array<string|RegExp>}>} [customRules]
 *        调用方自定义规则（最先匹配，优先级最高），如：
 *        [{ label: '云台', patterns: [/gimbal/i, /^ptz/] }]
 * @returns {{ key: string, label: string }} 分组键与展示标签
 */
export function groupJoint(jointName, customRules = null) {
    const name = String(jointName || '');

    if (Array.isArray(customRules) && customRules.length > 0) {
        for (const rule of customRules) {
            if (!rule || !rule.label) continue;
            for (const p of rule.patterns || []) {
                try {
                    const re = p instanceof RegExp ? p : new RegExp(escapeRegex(p), 'i');
                    if (re.test(name)) {
                        return { key: `custom:${rule.label}`, label: rule.label };
                    }
                } catch (e) { /* 非法正则忽略 */ }
            }
        }
    }

    for (const g of GROUP_DEFS) {
        for (const p of g.patterns) {
            if (p.test(name)) {
                return { key: g.key, label: GROUP_LABELS[g.key] };
            }
        }
    }
    return { key: 'other', label: GROUP_LABELS.other };
}

/**
 * 将关节列表分组并按展示顺序排序
 * @param {Array} joints - core.getJointList() 的结果
 * @param {Array} [customRules] - 调用方自定义规则
 * @param {'zh-CN'|'en'} [lang]
 * @returns {Array<{key:string,label:string,joints:Array}>}
 */
export function groupJoints(joints, customRules = null, lang = 'zh-CN') {
    const map = new Map();
    for (const joint of joints || []) {
        const { key, label } = groupJoint(joint.name, customRules);
        if (!map.has(key)) {
            map.set(key, { key, label, joints: [] });
        }
        map.get(key).joints.push(joint);
    }

    // 展示顺序：内置组按 GROUP_ORDER，自定义组排在其后
    const orderOf = (key) => {
        const idx = GROUP_ORDER.indexOf(key);
        return idx >= 0 ? idx : GROUP_ORDER.length + (key.startsWith('custom:') ? 0 : 100);
    };

    return Array.from(map.values()).sort((a, b) => orderOf(a.key) - orderOf(b.key));
}

/** 分组标签本地化 */
export function groupLabel(group, lang = 'zh-CN') {
    if (typeof group.label === 'string') return group.label; // 自定义规则直接给中文名
    const entry = group.label;
    if (entry && typeof entry === 'object') {
        return entry[lang] || entry.en || entry['zh-CN'] || group.key;
    }
    return group.key;
}
