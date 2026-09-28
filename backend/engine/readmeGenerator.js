/**
 * P7 Task 5: Stack-aware dynamic README generator.
 * Builds setup docs from the actual project manifest instead of a
 * hardcoded Next.js/Prisma template.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseEnvExampleKeys(content) {
  const keys = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.replace(/^export\s+/, '');
    const match = withoutExport.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match && !keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

export function sanitizeArchitectureNotes(talimatname) {
  let clean = String(talimatname || '').replace(/^#\s+[^\n]+\n/, '').trim();
  clean = clean
    .replace(/###\s*(?:📦\s*)?(?:\d+\.\s*)?Domain\s*(&|ve)\s*Ajan\s*Bölünmesi[\s\S]*?(?=(?:###|##|---|$))/gi, '')
    .replace(/^[^\n]*\b[\w-]+\.(director|teamleader)\b[^\n]*$/gim, '')
    .replace(/\*?\*?`?(?:backend|frontend|database)\.(director|teamleader)`?\*?:[^\n]*/gi, '')
    .replace(/Mimari planı ve şartnameyi hazırladım[\s\S]*$/gi, '')
    .replace(/\[PLAN_HAZIR\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean;
}

function detectPort({ pkg, manifest, detectedStack }) {
  const fromManifest = Number(manifest?.port);
  if (Number.isInteger(fromManifest) && fromManifest > 0) return fromManifest;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const devScript = String(pkg?.scripts?.dev || '');
  const stack = String(detectedStack || '').toLowerCase();
  if (stack.includes('vite') || deps.vite || /\bvite\b/.test(devScript)) return 5173;
  return 3000;
}

function detectRunCommand(pkg) {
  const scripts = pkg?.scripts || {};
  if (scripts.dev) return 'npm run dev';
  if (scripts.start) return 'npm start';
  return null;
}

export async function generateProjectReadme({
  projectTitle,
  summary,
  talimatname = '',
  projectDir,
  manifest = null,
  detectedStack = null,
  lockfileExpected = false,
  management = null,
} = {}) {
  const pkg = (projectDir ? await readJsonFile(path.join(projectDir, 'package.json')) : null) || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  let effectiveManifest = manifest;
  if (!effectiveManifest && projectDir) {
    effectiveManifest =
      (await readJsonFile(path.join(projectDir, 'service_manifest.json'))) ||
      (await readJsonFile(path.join(projectDir, 'service-manifest.json')));
  }

  const hasPrismaDep = Boolean(deps.prisma || deps['@prisma/client']);
  const hasPrismaSchema =
    projectDir &&
    ((await fileExists(path.join(projectDir, 'schema.prisma'))) ||
      (await fileExists(path.join(projectDir, 'prisma', 'schema.prisma'))));
  const hasPrisma = hasPrismaDep || Boolean(hasPrismaSchema);

  let envKeys = [];
  if (projectDir) {
    try {
      const envExample = await fs.readFile(path.join(projectDir, '.env.example'), 'utf8');
      envKeys = parseEnvExampleKeys(envExample);
    } catch {
      envKeys = [];
    }
  }

  const port = detectPort({ pkg, manifest: effectiveManifest, detectedStack });
  const runCommand = detectRunCommand(pkg);
  const notes = sanitizeArchitectureNotes(talimatname);

  const lines = [];
  lines.push(`# 🚀 ${projectTitle || pkg.name || 'Project'}`);
  lines.push('');
  lines.push(`> ${summary || pkg.description || 'Modern web ve API uygulaması.'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🛠️ Kurulum ve Çalıştırma Rehberi');
  lines.push('');
  lines.push('Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları sırasıyla uygulayın:');
  lines.push('');
  lines.push('### 1. Adım: Bağımlılıkları Yükleyin');
  lines.push('```bash');
  lines.push(lockfileExpected ? 'npm ci' : 'npm install');
  lines.push('```');
  lines.push('');

  let step = 2;
  if (envKeys.length > 0) {
    lines.push(`### ${step}. Adım: Ortam Değişkenlerini Yapılandırın`);
    lines.push('`.env.example` dosyasını `.env` olarak kopyalayın ve aşağıdaki değişkenleri doldurun:');
    lines.push('');
    for (const key of envKeys) lines.push(`- \`${key}\``);
    lines.push('');
    lines.push('```bash');
    lines.push('cp .env.example .env');
    lines.push('```');
    lines.push('');
    step += 1;
  }

  if (hasPrisma) {
    lines.push(`### ${step}. Adım: Veritabanı ve Şemayı Hazırlayın (Prisma / SQLite)`);
    lines.push('```bash');
    lines.push('npx prisma generate');
    lines.push('npx prisma db push');
    lines.push('```');
    lines.push('');
    step += 1;
  }

  if (management?.needed === true && pkg.scripts?.['prisma:seed']) {
    lines.push(`### ${step}. Adım: Rol Bazlı Demo Kullanıcıları Kurun`);
    lines.push('Demo hesapları yalnızca geliştirme ve test ortamında oluşturulur. `.env` içindeki her `XFACTOR_DEMO_PASSWORD_*` değişkenine ayrı bir güçlü parola verin. Üretim ortamında demo seed çalıştırmayın.');
    lines.push('```bash');
    lines.push('npm run prisma:seed');
    lines.push('```');
    lines.push('');
    step += 1;
  }

  if (runCommand) {
    lines.push(`### ${step}. Adım: Uygulamayı Başlatın`);
    lines.push('```bash');
    lines.push(runCommand);
    lines.push('```');
    lines.push(`Uygulamanız varsayılan olarak \`http://localhost:${port}\` adresinde çalışacaktır.`);
    lines.push('');
  }
  if (projectDir && await fileExists(path.join(projectDir, 'Dockerfile'))) {
    const imageName = String(pkg.name || 'xfactor-app').toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'xfactor-app';
    const dockerfile = await fs.readFile(path.join(projectDir, 'Dockerfile'), 'utf8');
    const containerPort = Number(dockerfile.match(/^EXPOSE\s+(\d+)/m)?.[1]) || port;
    lines.push('### Docker ile Çalıştırma');
    lines.push('```bash');
    lines.push(`docker build -t ${imageName} .`);
    if (hasPrisma) {
      lines.push(`docker run -d --name ${imageName} --mount type=volume,source=${imageName}-data,target=/data -p ${containerPort}:${containerPort} ${imageName}`);
      lines.push('```');
      lines.push('SQLite verisi `/data` volume içinde kalır; konteyneri yeniden başlattığınızda aynı volume adını kullanın. Gerekli üretim sırlarını çalışma ortamında ayrıca sağlayın.');
    } else {
      lines.push(`docker run -d --name ${imageName} -p ${containerPort}:${containerPort} ${imageName}`);
      lines.push('```');
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## 📋 Proje Özellikleri ve Mimari Yapı');
  lines.push('');
  lines.push(notes);
  lines.push('');
  return lines.join('\n');
}
