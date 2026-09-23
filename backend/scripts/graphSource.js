import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';

const SOURCE_DIRS = ['backend', 'frontend', 'execution', 'e2e', 'scripts', 'docs'];
const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const IGNORED_DIRS = new Set(['node_modules', 'data', 'dist', 'build', 'coverage', 'test-results']);

function groupFor(file) {
  if (file.startsWith('docs/') || file.endsWith('.md')) return 'docs';
  if (file.startsWith('e2e/') || file.includes('/tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return 'tests';
  if (file.startsWith('backend/agents/')) return 'agents';
  if (file.startsWith('backend/engine/')) return 'engine';
  if (file.startsWith('frontend/')) return 'frontend';
  return 'backend';
}

async function collectFiles(root, relativeDir, files) {
  const fullDir = path.join(root, relativeDir);
  let entries;
  try { entries = await fs.readdir(fullDir, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativeFile = path.posix.join(relativeDir.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
      await collectFiles(root, relativeFile, files);
    } else if (entry.isFile() && (SOURCE_EXTENSIONS.includes(path.extname(entry.name)) || entry.name.endsWith('.md'))) {
      files.add(relativeFile);
    }
  }
}

function visit(node, callback, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node, ancestors);
  const next = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach(child => visit(child, callback, next));
    else if (value && typeof value === 'object') visit(value, callback, next);
  }
}

function sourceLocation(file, node) {
  return { file, line: node.loc?.start.line || 1 };
}

function symbolDefinition(node, ancestors) {
  const parent = ancestors.at(-1);
  const classNode = [...ancestors].reverse().find(item => item.type === 'ClassDeclaration' || item.type === 'ClassExpression');
  const className = classNode?.id?.name || (classNode && ancestors.find(item => item.type === 'VariableDeclarator' && item.init === classNode)?.id?.name);
  if (node.type === 'ClassDeclaration' && node.id?.name) return { name: node.id.name, type: 'Class' };
  if (node.type === 'ClassExpression' && parent?.type === 'VariableDeclarator' && parent.id?.name) {
    return { name: parent.id.name, type: 'Class' };
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name) return { name: node.id.name, type: 'Function' };
  if ((node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') && node.key) {
    const name = node.key.name || node.key.value;
    return name ? { name: className ? `${className}.${name}` : String(name), type: 'Method' } : null;
  }
  if (node.type === 'ObjectMethod' && node.key) {
    const objectVariable = [...ancestors].reverse().find(item => item.type === 'VariableDeclarator');
    const name = node.key.name || node.key.value;
    return name ? { name: objectVariable?.id?.name ? `${objectVariable.id.name}.${name}` : String(name), type: 'Method' } : null;
  }
  if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && parent?.type === 'VariableDeclarator' && parent.id?.name) {
    return { name: parent.id.name, type: 'Function' };
  }
  if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') && parent?.type === 'ObjectProperty' && parent.key) {
    const objectVariable = [...ancestors].reverse().find(item => item.type === 'VariableDeclarator');
    const name = parent.key.name || parent.key.value;
    return name ? { name: objectVariable?.id?.name ? `${objectVariable.id.name}.${name}` : String(name), type: 'Method' } : null;
  }
  return null;
}

function resolveRelative(file, specifier, files) {
  if (!specifier.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  const candidates = [base, ...SOURCE_EXTENSIONS.map(ext => base + ext),
    ...SOURCE_EXTENSIONS.map(ext => path.posix.join(base, 'index' + ext))];
  return candidates.find(candidate => files.has(candidate)) || null;
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function calleeName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier' && node.property?.type === 'Identifier') {
    return `${node.object.name}.${node.property.name}`;
  }
  if (node?.type === 'MemberExpression' && !node.computed && node.object?.type === 'ThisExpression' && node.property?.type === 'Identifier') {
    return `this.${node.property.name}`;
  }
  return null;
}

function endpointPath(node) {
  if (node?.type === 'StringLiteral') return node.value.split('?')[0];
  if (node?.type !== 'TemplateLiteral') return null;
  let value = '';
  for (let index = 0; index < node.quasis.length; index++) {
    const quasi = node.quasis[index].value.cooked || '';
    const queryIndex = quasi.indexOf('?');
    value += queryIndex >= 0 ? quasi.slice(0, queryIndex) : quasi;
    if (queryIndex >= 0) return value;
    if (index < node.expressions.length) {
      const expression = node.expressions[index];
      const branchPrefix = branch => branch?.type === 'StringLiteral' ? branch.value
        : branch?.type === 'TemplateLiteral' ? branch.quasis[0]?.value?.cooked || '' : null;
      const beginsQuery = expression.type === 'ConditionalExpression'
        ? [expression.consequent, expression.alternate].some(branch => branchPrefix(branch)?.startsWith('?'))
        : branchPrefix(expression)?.startsWith('?');
      if (beginsQuery) return value;
      const parameter = expression.type === 'CallExpression' ? expression.arguments[0] : expression;
      const name = parameter?.type === 'Identifier' ? parameter.name
        : parameter?.type === 'MemberExpression' && !parameter.computed
          && parameter.property?.type === 'Identifier' ? parameter.property.name : 'value';
      value += `:${name}`;
    }
  }
  return value;
}

function memberPath(node) {
  if (node?.type !== 'MemberExpression' || node.computed
    || node.object?.type !== 'Identifier' || node.property?.type !== 'Identifier') return null;
  return `${node.object.name}.${node.property.name}`;
}

function literalComparison(node) {
  if (node?.type !== 'BinaryExpression' || !['===', '=='].includes(node.operator)) return null;
  const leftPath = memberPath(node.left);
  const rightPath = memberPath(node.right);
  if (leftPath && node.right?.type === 'StringLiteral') return { path: leftPath, value: node.right.value };
  if (rightPath && node.left?.type === 'StringLiteral') return { path: rightPath, value: node.left.value };
  return null;
}

function conjunctionTerms(node) {
  if (node?.type === 'LogicalExpression' && node.operator === '&&') {
    return [...conjunctionTerms(node.left), ...conjunctionTerms(node.right)];
  }
  return [node];
}

function rawHttpRouteCondition(node) {
  if (node?.type !== 'LogicalExpression' || node.operator !== '&&') return null;
  const comparisons = conjunctionTerms(node).map(literalComparison).filter(Boolean);
  const method = comparisons.find(item => item.path === 'req.method')?.value;
  const routePath = comparisons.find(item => item.path === 'url.pathname')?.value;
  if (!method || !routePath || !/^[A-Z]+$/.test(method) || !routePath.startsWith('/')) return null;
  return { method, path: routePath };
}

function jobPathMatchBinding(node) {
  if (node?.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
    || node.init?.type !== 'CallExpression' || node.init.callee?.type !== 'MemberExpression'
    || node.init.callee.computed || node.init.callee.property?.name !== 'match'
    || memberPath(node.init.callee.object) !== 'url.pathname'
    || node.init.arguments[0]?.type !== 'RegExpLiteral') return null;
  const pattern = node.init.arguments[0].pattern.replaceAll('\\/', '/');
  return pattern === '^/v1/jobs/([^/]+)$' ? node.id.name : null;
}

function requestMethod(node) {
  const options = node.arguments[1];
  if (options?.type !== 'ObjectExpression') return 'GET';
  const method = options.properties.find(property => (property.key?.name || property.key?.value) === 'method');
  return method?.value?.type === 'StringLiteral' ? method.value.value.toUpperCase() : 'GET';
}

export function assertCuratedNodesExist(curatedNodes, sourceNodes) {
  const sourceIds = new Set(sourceNodes.map(node => node.id));
  const missing = curatedNodes.filter(node => !sourceIds.has(node.id)).map(node => node.id);
  if (missing.length) throw new Error(`Graphify has missing curated files: ${missing.join(', ')}`);
}

export async function buildSourceGraph(root) {
  const files = new Set();
  for (const dir of SOURCE_DIRS) await collectFiles(root, dir, files);
  for (const file of ['README.md', 'kullanici-kilavuzu.md', 'playwright.config.js']) {
    try { await fs.access(path.join(root, file)); files.add(file); } catch {}
  }
  const sorted = [...files].sort();
  const nodes = sorted.map(id => ({
    id, label: path.posix.basename(id), type: id.endsWith('.md') ? 'Document' : 'SourceFile',
    group: groupFor(id), file: id, description: '', val: 1
  }));
  const links = [];
  const parsed = new Map();
  const symbolsByFile = new Map();
  const importsByFile = new Map();
  const routeNodes = [];
  const requestNodes = [];
  const linkKeys = new Set();
  function addLink(source, target, label, location = null) {
    const key = `${source}\0${target}\0${label}`;
    if (!source || !target || source === target || linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push({ source, target, label, provenance: label === 'requests_route' ? 'inferred' : 'ast', ...(location ? { location } : {}) });
  }
  for (const file of sorted) {
    if (!SOURCE_EXTENSIONS.includes(path.extname(file))) continue;
    const source = await fs.readFile(path.join(root, file), 'utf8');
    let ast;
    try {
      ast = parse(source, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'], errorRecovery: true });
    } catch (error) {
      throw new Error(`Graphify could not parse ${file}: ${error.message}`, { cause: error });
    }
    parsed.set(file, ast);
    const bindings = new Map();
    importsByFile.set(file, bindings);
    for (const statement of ast.program.body) {
      if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type) || !statement.source?.value) continue;
      const specifier = statement.source.value;
      const target = resolveRelative(file, specifier, files);
      if (target) addLink(file, target, 'imports', sourceLocation(file, statement));
      else if (!specifier.startsWith('.')) {
        const id = `package:${packageName(specifier)}`;
        if (!nodes.some(node => node.id === id)) nodes.push({ id, label: packageName(specifier), type: 'Package', group: 'packages', file: null, description: specifier, val: 1 });
        addLink(file, id, 'imports_package', sourceLocation(file, statement));
      }
      if (target && statement.type === 'ImportDeclaration') {
        for (const item of statement.specifiers) {
          const imported = item.type === 'ImportDefaultSpecifier' ? 'default' : item.type === 'ImportNamespaceSpecifier' ? '*' : item.imported?.name || item.imported?.value;
          bindings.set(item.local.name, { file: target, name: imported });
        }
      }
    }
    const symbols = [];
    visit(ast.program, (node, ancestors) => {
      const def = symbolDefinition(node, ancestors);
      if (!def) return;
      const line = node.loc?.start.line || 1;
      const id = `${file}#${def.type}:${def.name}@${line}`;
      const symbol = { id, label: def.name, type: def.type, group: groupFor(file), file, line, description: '', val: 1, start: node.start, end: node.end };
      symbols.push(symbol);
      nodes.push({ id, label: def.name, type: def.type, group: groupFor(file), file, line, description: '', val: 1 });
      addLink(file, id, 'contains', sourceLocation(file, node));
      if (def.type === 'Method') {
        const parentClass = symbols.find(symbol => symbol.type === 'Class'
          && symbol.label === def.name.split('.')[0] && symbol.start <= node.start && symbol.end >= node.end);
        if (parentClass) addLink(parentClass.id, id, 'contains', sourceLocation(file, node));
      }
    });
    symbolsByFile.set(file, symbols);
  }
  function resolveCall(file, name, context = null) {
    if (!name) return null;
    const symbols = symbolsByFile.get(file) || [];
    if (name.startsWith('this.') && context?.label.includes('.')) name = `${context.label.split('.')[0]}.${name.slice(5)}`;
    let matches = symbols.filter(symbol => symbol.label === name);
    if (matches.length === 1) return matches[0].id;
    const bindingName = name.split('.')[0];
    const binding = importsByFile.get(file)?.get(bindingName);
    if (!binding) return null;
    const targetName = binding.name === '*' ? name.slice(bindingName.length + 1) : binding.name;
    matches = (symbolsByFile.get(binding.file) || []).filter(symbol => symbol.label === targetName);
    return matches.length === 1 ? matches[0].id : null;
  }
  const routeKeys = new Set();
  function emitRoute(file, method, routePath, node, caller) {
    const line = node.loc?.start.line || 1;
    const key = `${file}\0${method}\0${routePath}\0${line}`;
    const id = `${file}#route:${method} ${routePath}@${line}`;
    if (!routeKeys.has(key)) {
      routeKeys.add(key);
      nodes.push({ id, label: `${method} ${routePath}`, type: 'HttpRoute', group: groupFor(file), file, line, description: '', val: 1 });
      routeNodes.push({ id, method, path: routePath, file });
    }
    addLink(caller, id, 'registers_route', sourceLocation(file, node));
    return id;
  }
  for (const [file, ast] of parsed) {
    const symbols = symbolsByFile.get(file) || [];
    const jobPathMatchBindings = new Set();
    visit(ast.program, node => {
      const binding = jobPathMatchBinding(node);
      if (binding) jobPathMatchBindings.add(binding);
    });
    visit(ast.program, (node, ancestors) => {
      const context = symbols.filter(symbol => symbol.start <= node.start && symbol.end >= node.end)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
      const caller = context?.id || file;
      const rawRoute = rawHttpRouteCondition(node);
      if (rawRoute) emitRoute(file, rawRoute.method, rawRoute.path, node, caller);
      if (node.type === 'IfStatement') {
        const methodComparison = literalComparison(node.test);
        const withinJobPathMatch = ancestors.some(ancestor => ancestor.type === 'IfStatement'
          && ancestor.test?.type === 'Identifier' && jobPathMatchBindings.has(ancestor.test.name));
        if (withinJobPathMatch && methodComparison?.path === 'req.method'
          && /^[A-Z]+$/.test(methodComparison.value)) {
          emitRoute(file, methodComparison.value, '/v1/jobs/:jobId', node, caller);
        }
      }
      const isEnvMember = ['MemberExpression', 'OptionalMemberExpression'].includes(node.type)
        && ['MemberExpression', 'OptionalMemberExpression'].includes(node.object?.type)
        && node.object.object?.type === 'Identifier' && node.object.object.name === 'process'
        && node.object.property?.name === 'env';
      if (isEnvMember) {
        const key = node.computed ? node.property?.value : node.property?.name;
        if (typeof key === 'string') {
          const id = `env:${key}`;
          if (!nodes.some(candidate => candidate.id === id)) {
            nodes.push({ id, label: key, type: 'EnvVar', group: 'config', file: null, description: 'Ortam değişkeni adı; değer grafiğe alınmaz.', val: 1 });
          }
          const context = symbols.filter(symbol => symbol.start <= node.start && symbol.end >= node.end)
            .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
          const parent = ancestors.at(-1);
          const label = parent?.type === 'AssignmentExpression' && parent.left === node ? 'writes_env' : 'reads_env';
          addLink(context?.id || file, id, label, sourceLocation(file, node));
        }
      }
      if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
      if (node.callee?.type === 'Import' && node.arguments[0]?.type === 'StringLiteral') {
        const specifier = node.arguments[0].value;
        const importedFile = resolveRelative(file, specifier, files);
        if (importedFile) addLink(caller, importedFile, 'dynamic_imports', sourceLocation(file, node));
      }
      const name = calleeName(node.callee);
      const target = resolveCall(file, name, context);
      if (target) addLink(caller, target, 'calls', sourceLocation(file, node));
      if (node.callee?.type === 'MemberExpression' && !node.callee.computed
        && ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'].includes(node.callee.property?.name)
        && ['app', 'router', 'server'].includes(node.callee.object?.name)
        && node.arguments[0]?.type === 'StringLiteral') {
        const method = node.callee.property.name.toUpperCase();
        const routePath = node.arguments[0].value;
        const id = emitRoute(file, method, routePath, node, caller);
        for (const argument of node.arguments.slice(1)) {
          const handler = resolveCall(file, calleeName(argument), context);
          if (handler) addLink(id, handler, 'handles', sourceLocation(file, argument));
        }
      }
      if (['request', 'fetch'].includes(name)) {
        const requestPath = endpointPath(node.arguments[0]);
        if (requestPath?.startsWith('/')) {
          const method = requestMethod(node);
          const line = node.loc?.start.line || 1;
          const id = `${file}#request:${method} ${requestPath}@${line}`;
          nodes.push({ id, label: `${method} ${requestPath}`, type: 'HttpRequest', group: groupFor(file), file, line, description: '', val: 1 });
          requestNodes.push({ id, method, path: requestPath, file });
          addLink(caller, id, 'sends_request', sourceLocation(file, node));
        }
      }
    });
  }
  const mountsByFile = new Map();
  for (const [file, ast] of parsed) {
    visit(ast.program, node => {
      if (node.type !== 'CallExpression' || calleeName(node.callee) !== 'app.use'
        || node.arguments[0]?.type !== 'StringLiteral') return;
      const routerCall = node.arguments[1];
      const binding = routerCall?.type === 'CallExpression'
        ? importsByFile.get(file)?.get(calleeName(routerCall.callee)) : null;
      if (!binding) return;
      if (!mountsByFile.has(binding.file)) mountsByFile.set(binding.file, new Set());
      mountsByFile.get(binding.file).add(node.arguments[0].value);
    });
  }
  const normalizePath = value => (value.replace(/\/+/g, '/').replace(/\/$/, '') || '/');
  const routeShape = value => normalizePath(value).replace(/:[^/]+/g, ':param');
  const serviceHint = file => path.posix.basename(file, path.posix.extname(file))
    .match(/^(.+)Client$/)?.[1]?.toLowerCase() || null;
  for (const request of requestNodes) {
    let matches = routeNodes.filter(route => {
      if (route.method !== request.method) return false;
      const mounts = mountsByFile.get(route.file);
      if (!mounts) return routeShape(route.path) === routeShape(request.path);
      return [...mounts].some(mount => {
        const prefix = mount.replace(/^\/api(?=\/|$)/, '').replace(/\/$/, '');
        return routeShape(prefix + route.path) === routeShape(request.path);
      });
    });
    if (matches.length > 1) {
      const hintedService = serviceHint(request.file);
      const serviceMatches = hintedService
        ? matches.filter(route => route.file.startsWith(`${hintedService}/`)) : [];
      if (serviceMatches.length === 1) matches = serviceMatches;
    }
    if (matches.length === 1) addLink(request.id, matches[0].id, 'requests_route');
  }
  return { nodes, links };
}
