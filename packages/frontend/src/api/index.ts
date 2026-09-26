import type { WorkspaceApi } from '@blog-writer/shared';
import { NodeApi } from './node.js';

/**
 * The single backend adapter used by the UI. Swapping this binding is all that
 * is needed to retarget to Tauri/Electron-native IPC.
 */
export const api: WorkspaceApi = new NodeApi();
export { NodeApi } from './node.js';
