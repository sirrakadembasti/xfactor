export const COMMAND_PHASES = new Set(['dependency_lockfile', 'dependency_install', 'prisma_validate',
    'prisma_generate', 'database_push', 'database_seed', 'typecheck', 'framework_build', 'test_setup',
    'test_execution', 'service_start', 'service_preview', 'browser_journey', 'inventory', 'http_request',
    'node_command', 'npm_command', 'npx_command']);
const executables = new Set(['node', 'npm', 'npx']);

// Public advisory projection: never expose arguments, source, output or environment.
export function projectCommandProgress(commands) {
    return (Array.isArray(commands) ? commands : []).slice(-64).flatMap(command => {
        if (!Number.isSafeInteger(command?.commandId) || command.commandId < 1
            || !COMMAND_PHASES.has(command.phase) || !executables.has(command.executable)
            || !Number.isFinite(command.startedAt)) return [];
        const endedAt = Number.isFinite(command.endedAt) && command.endedAt >= command.startedAt ? command.endedAt : null;
        return [{ commandId: command.commandId, phase: command.phase, executable: command.executable,
            startedAt: command.startedAt, endedAt, exitCode: endedAt !== null && Number.isInteger(command.exitCode) ? command.exitCode : null,
            timedOut: command.timedOut === true }];
    });
}
