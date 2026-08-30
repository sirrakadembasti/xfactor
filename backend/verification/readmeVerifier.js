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

    return {
        passed: issues.length === 0,
        issues
    };
}
