/**
 * npm 包入口 — React 封装层
 *
 * 用法（umi max / 任意 React 项目）：
 *   import { RobotViewer } from 'robot-viewer';
 */
import './ssrShim.js'; // 兜底：保证 Node/SSR 环境可安全 import（i18n 依赖 navigator/localStorage）

export { default as RobotViewer } from './RobotViewer.jsx';
export { RobotViewerCore } from './RobotViewerCore.js';
export { Toolbar } from './Toolbar.jsx';
export { JointPanel } from './JointPanel.jsx';
export { groupJoint, groupJoints, groupLabel } from './jointGroups.js';
export { loadUrdfFromUrl, normalizeUrl, extractAssetPaths, buildCandidateUrls } from './UrdfUrlLoader.js';
export { translations } from '../utils/i18n.js';
