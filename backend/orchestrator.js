/**
 * XFactor Orchestrator Facade
 * Delegated to modern DAG Workflow Engine in ./engine/workflow.js
 */

export {
    getProjectDir,
    readProjectState,
    writeProjectState,
    logEvent,
    checkPause,
    executeProjectTasks
} from './engine/workflow.js';

import { getProjectDir } from './engine/workflow.js';
import path from 'path';

export const getStatePath = (projectId) => path.join(getProjectDir(projectId), 'state.json');
