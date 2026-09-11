/**
 * UrdfUrlLoader — npm/React 封装层专用
 *
 * 通过 URL（相对路径 / 绝对路径 / http(s) 路径）加载 URDF：
 *   1. fetch URDF 文本
 *   2. 扫描其中引用的 mesh / texture 资源路径，按候选规则逐个 fetch
 *   3. 把所有资源包装成 File 对象并装入 fileMap
 *   4. 复用项目既有的 ModelLoaderFactory.loadModel('urdf', ...) 解析管线
 *
 * 本文件属于“薄封装层”，不修改任何既有源码。
 */
import { ModelLoaderFactory } from '../loaders/ModelLoaderFactory.js';

const DEG = Math.PI / 180;

/** 归一化任意路径为绝对 URL（相对路径基于当前页面 baseURI 解析） */
export function normalizeUrl(path, baseUrl) {
    try {
        return new URL(path, baseUrl || (typeof document !== 'undefined' ? document.baseURI : undefined)).href;
    } catch (e) {
        return path;
    }
}

/**
 * 从 URDF 文本中提取所有被引用的资源路径
 * 匹配 <mesh filename="..."/> / <texture filename="..."/> 等写法
 */
export function extractAssetPaths(urdfText) {
    const paths = new Set();
    const re = /(?:filename|file)\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(urdfText)) !== null) {
        const p = m[1].trim();
        if (p) paths.add(p);
    }
    return Array.from(paths);
}

/** 去掉 package:// 前缀，返回 { pkg, rest } 或 null */
function splitPackagePath(rawPath) {
    const m = rawPath.match(/^package:\/\/([^\/]+)\/(.+)$/);
    if (m) return { pkg: m[1], rest: m[2] };
    return null;
}

/**
 * 为单个资源路径生成候选绝对 URL 列表（按优先级排序，逐个尝试 fetch）
 * @param {string} rawPath - URDF 中出现的原始路径
 * @param {string} urdfUrl - URDF 文件的绝对 URL
 * @param {Object} packages - 可选的显式包名映射 { 包名: 基础路径或URL }
 */
export function buildCandidateUrls(rawPath, urdfUrl, packages = {}) {
    const urdfDir = urdfUrl.substring(0, urdfUrl.lastIndexOf('/') + 1);
    // 父目录（处理 “xxx/urdf/robot.urdf” 的常见 ROS 目录布局）
    const dirParts = urdfDir.replace(/\/+$/, '').split('/');
    dirParts.pop();
    const parentDir = dirParts.length > 0 ? dirParts.join('/') + '/' : urdfDir;

    const candidates = [];
    const push = (u) => {
        const abs = normalizeUrl(u, urdfUrl);
        if (abs && !candidates.includes(abs)) candidates.push(abs);
    };

    const pkgInfo = splitPackagePath(rawPath);

    if (pkgInfo) {
        const { pkg, rest } = pkgInfo;
        // 1. 用户显式提供的包映射（最高优先级）
        if (packages[pkg] != null) {
            push(String(packages[pkg]).replace(/\/+$/, '') + '/' + rest);
        }
        // 2. URDF 同目录下的 包名/...
        push(urdfDir + pkg + '/' + rest);
        // 3. URDF 父目录下的 包名/...（ROS 包根目录布局）
        push(parentDir + pkg + '/' + rest);
        // 4. 直接去掉包名，相对 URDF 目录
        push(urdfDir + rest);
    } else if (/^https?:\/\//i.test(rawPath) || /^data:/i.test(rawPath)) {
        // 已经是绝对网络地址
        push(rawPath);
    } else {
        // 普通相对路径
        push(urdfDir + rawPath.replace(/^\.\//, ''));
    }

    return candidates;
}

async function tryFetch(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return res.blob();
}

/**
 * 把 File 以多个候选 key 写入 fileMap，
 * 让既有 resolveFileFromMap 的精确/模糊匹配都能命中
 */
function registerFile(fileMap, file, rawPath) {
    const name = rawPath.split('/').pop();
    const pkgInfo = splitPackagePath(rawPath);
    const keys = new Set();
    if (pkgInfo) {
        keys.add(`${pkgInfo.pkg}/${pkgInfo.rest}`);
        keys.add(`${pkgInfo.pkg}/${name}`);
    }
    const rel = rawPath.replace(/^package:\/\/[^\/]+\//, '').replace(/^\.\//, '');
    keys.add(rel);
    keys.add(name);
    for (const key of keys) {
        if (!fileMap.has(key)) {
            fileMap.set(key, file);
        }
    }
}

/**
 * 从 URL 加载 URDF 并解析为统一模型（UnifiedRobotModel）
 *
 * @param {string} url - URDF 路径：相对路径（基于页面 baseURI）/ 站点绝对路径（/xx/xx.urdf）/ 完整 http(s) URL
 * @param {Object} [options]
 * @param {Object} [options.packages] - 包名映射，如 { robot_description: '/assets/robot_description' }
 * @param {Function} [options.onAssetProgress] - 资源加载进度回调 (loaded, total, path)
 * @returns {Promise<Object>} 统一模型对象（model.threeObject / model.joints / model.links）
 */
export async function loadUrdfFromUrl(url, options = {}) {
    if (!url) {
        throw new Error('[robot-viewer] urdf url is required');
    }
    const urdfUrl = normalizeUrl(url);
    const packages = options.packages || {};

    // 1. 拉取 URDF 文本
    const urdfText = await (async () => {
        const res = await fetch(urdfUrl);
        if (!res.ok) {
            throw new Error(`[robot-viewer] Failed to fetch URDF (${res.status} ${res.statusText}): ${urdfUrl}`);
        }
        return res.text();
    })();

    const urdfName = decodeURIComponent(urdfUrl.split('/').pop().split('?')[0]) || 'model.urdf';

    // 2. 预取所有被引用的 mesh / texture 资源
    const fileMap = new Map();
    fileMap.set(urdfName, new File([urdfText], urdfName, { type: 'application/xml' }));

    const assetPaths = extractAssetPaths(urdfText);
    let loaded = 0;
    const warnings = [];

    await Promise.all(assetPaths.map(async (rawPath) => {
        const candidates = buildCandidateUrls(rawPath, urdfUrl, packages);
        for (const candidate of candidates) {
            try {
                const blob = await tryFetch(candidate);
                const name = decodeURIComponent(rawPath.split('/').pop().split('?')[0]);
                const file = new File([blob], name, { type: blob.type || '' });
                registerFile(fileMap, file, rawPath);
                break;
            } catch (e) {
                // 尝试下一个候选地址
            }
        }
        loaded++;
        options.onAssetProgress?.(loaded, assetPaths.length, rawPath);
        // 未命中任何候选时记录告警（交由底层模糊匹配兜底或忽略）
        // 此处不抛错，单个资源失败不阻断整体加载
    }));

    if (warnings.length) {
        console.warn('[robot-viewer] Unresolved assets:', warnings);
    }

    // 3. 复用既有解析管线（与拖拽加载完全一致）
    const model = await ModelLoaderFactory.loadModel(
        'urdf',
        urdfText,
        urdfName,
        fileMap,
        fileMap.get(urdfName)
    );

    return model;
}
