import { parse } from '@babel/parser';
import { executeInSandbox } from './sandboxRunner.js';

function findFile(files, name) {
    const lowerName = name.toLowerCase();
    return files.find(file => {
        const normalized = String(file.path || '').replace(/\\/g, '/').toLowerCase();
        return normalized === lowerName || normalized.endsWith(`/${lowerName}`);
    });
}

function extractDocumentedNpmScripts(readme) {
    const scripts = new Set();
    const fencedBlockPattern = /```[^\r\n]*\r?\n([\s\S]*?)```/g;
    let blockMatch;

    while ((blockMatch = fencedBlockPattern.exec(readme)) !== null) {
        const commandPattern = /^\s*npm\s+run\s+(\S+)/gim;
        let commandMatch;
        while ((commandMatch = commandPattern.exec(blockMatch[1])) !== null) {
            scripts.add(commandMatch[1]);
        }
    }

    return [...scripts];
}

function extractDocumentedPorts(readme) {
    const ports = new Set();
    const portPattern = /localhost\s*:\s*(\d{1,5})(?!\d)|\bport\s+(?:is\s+)?(\d{1,5})(?!\d)/gi;
    let match;
    while ((match = portPattern.exec(readme)) !== null) {
        const port = Number(match[1] || match[2]);
        if (port >= 1 && port <= 65535) ports.add(port);
    }
    return [...ports];
}
function extractConfiguredPorts(files) {
    const ports = new Set();
    const scriptFiles = files.filter(file => /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(String(file.path || '')));

    function isProcessEnvPort(node) {
        return (
            node?.type === 'MemberExpression' &&
            /^([A-Z0-9_]*PORT)$/i.test(node.property?.name || node.property?.value || '') &&
            node.object?.type === 'MemberExpression' &&
            node.object.object?.type === 'Identifier' &&
            node.object.object.name === 'process' &&
            (node.object.property?.name || node.object.property?.value) === 'env'
        );
    }

    function addPort(node) {
        const value = node?.value;
        if (Number.isInteger(value) && value >= 1 && value <= 65535) ports.add(value);
    }

    function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'LogicalExpression' && node.operator === '||' && isProcessEnvPort(node.left)) {
            addPort(node.right);
        }
        if (
            node.type === 'ObjectProperty' &&
            (node.key?.name || node.key?.value) === 'port'
        ) {
            addPort(node.value);
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    }

    for (const file of scriptFiles) {
        try {
            walk(parse(String(file.content || ''), {
                sourceType: 'module',
                plugins: ['jsx', 'typescript']
            }));
        } catch {
            continue;
        }
    }

    return [...ports];
}

export async function verifyReadmeCommands(contract = {}, files = [], sandbox = null) {
    const issues = [];
    const readmeFile = findFile(files, 'README.md');
    const packageFile = findFile(files, 'package.json');
    const documentedScripts = extractDocumentedNpmScripts(String(readmeFile?.content || ''));

    let packageScripts = {};
    if (packageFile?.content) {
        try {
            packageScripts = JSON.parse(packageFile.content).scripts || {};
        } catch {
            issues.push(`package.json is invalid JSON: ${packageFile.path}`);
        }
    }

    for (const script of documentedScripts) {
        if (!Object.prototype.hasOwnProperty.call(packageScripts, script)) {
            issues.push(`Documented command 'npm run ${script}' is missing from package.json`);
        }
    }

    const documentedPorts = extractDocumentedPorts(String(readmeFile?.content || ''));
    const configuredPorts = extractConfiguredPorts(files);
    if (configuredPorts.length > 0) {
        for (const documentedPort of documentedPorts) {
            if (!configuredPorts.includes(documentedPort)) {
                issues.push(`Documented port ${documentedPort} does not match application port ${configuredPorts[0]}`);
            }
        }
    }

    const sandboxAdapter = sandbox?.adapter || sandbox;
    const sandboxWorkspace = sandbox?.workspace || process.cwd();

    const checks = [];
    if (documentedScripts.includes('build') && !Object.prototype.hasOwnProperty.call(packageScripts, 'build')) {
        checks.push({ name: 'readme_build', gateName: 'framework_build', applicability: 'MANDATORY', status: 'blocked', passed: false, reason: 'Missing build script or sandbox capability; mandatory framework build evidence was not produced.' });
    } else if (documentedScripts.includes('build') && !sandboxAdapter) {
        checks.push({ name: 'readme_build', gateName: 'framework_build', applicability: 'MANDATORY', status: 'blocked', passed: false, reason: 'Missing build script or sandbox capability; mandatory framework build evidence was not produced.' });
    } else if (sandboxAdapter && documentedScripts.includes('build')) {
        const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        try {
            const result = await executeInSandbox(npmCommand, ['run', 'build'], { adapter: sandboxAdapter, workspace: sandboxWorkspace, timeoutMs: sandbox?.timeoutMs ?? 120000 });
            const passed = result.passed === true && result.exitCode === 0 && !result.timedOut;
            checks.push({ name: 'readme_build', gateName: 'framework_build', applicability: 'MANDATORY', status: passed ? 'passed' : 'failed', passed, reason: passed ? 'Documented build command completed successfully.' : 'Documented build command failed to execute' });
            if (!passed) issues.push('Documented build command failed to execute');
        } catch {
            checks.push({ name: 'readme_build', gateName: 'framework_build', applicability: 'MANDATORY', status: 'blocked', passed: false, reason: 'Missing build script or sandbox capability; mandatory framework build evidence was not produced.' });
            issues.push('Documented build command failed to execute');
        }
    }
    return {
        passed: issues.length === 0 && !checks.some(check => check.status === 'blocked' || check.status === 'failed'),
        issues,
        checks
    };
}
