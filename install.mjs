#!/usr/bin/env node
/**
 * Cài template vào một dự án ĐÃ CÓ SẴN.
 *
 *   node /duong/dan/ai-project-template/install.mjs [thu-muc-dich] [--dry-run] [--force]
 *
 * Mặc định thư mục đích = thư mục hiện tại.
 *   --dry-run  chỉ in ra sẽ làm gì, không ghi file nào
 *   --force    cho phép ghi đè policy.json / stack.json đã có
 *
 * Không đè file sẵn có (trừ --force). Không đụng .gitignore ngoài 1 dòng cần thiết.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const TEMPLATE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const TARGET = resolve(argv.find((a) => !a.startsWith('--')) ?? process.cwd());

const log = [];
const warn = [];
const todo = [];
const note = (m) => log.push(m);

if (TARGET === TEMPLATE) {
  console.error('Thư mục đích trùng với template. Chạy lệnh này TỪ TRONG dự án cũ.');
  process.exit(1);
}
if (!existsSync(TARGET)) {
  console.error(`Không thấy thư mục: ${TARGET}`);
  process.exit(1);
}

const has = (p) => existsSync(join(TARGET, p));
const read = (p) => readFileSync(join(TARGET, p), 'utf8');
const write = (p, content) => {
  if (DRY) return;
  mkdirSync(dirname(join(TARGET, p)), { recursive: true });
  writeFileSync(join(TARGET, p), content);
};

// ── 1. Copy file, không đè ───────────────────────────────────────────
function copyTree(relDir) {
  for (const entry of readdirSync(join(TEMPLATE, relDir))) {
    const rel = join(relDir, entry);
    if (statSync(join(TEMPLATE, rel)).isDirectory()) {
      copyTree(rel);
      continue;
    }
    const norm = rel.replace(/\\/g, '/');
    if (has(rel)) {
      note(`giữ nguyên (đã có)  ${norm}`);
      continue;
    }
    write(rel, readFileSync(join(TEMPLATE, rel), 'utf8'));
    note(`tạo mới             ${norm}`);
  }
}

copyTree('.claude/agents');
copyTree('.claude/hooks');
for (const f of ['.claude/settings.json', 'CLAUDE.md']) {
  if (has(f)) {
    note(`giữ nguyên (đã có)  ${f}`);
    todo.push(`Gộp tay: dự án đã có "${f}" — so với bản ở ${TEMPLATE} rồi hợp nhất.`);
  } else {
    write(f, readFileSync(join(TEMPLATE, f), 'utf8'));
    note(`tạo mới             ${f}`);
  }
}

// .gitattributes: KHÔNG thả vào repo đã có lịch sử.
// `* text=auto eol=lf` sẽ renormalize line ending toàn bộ repo -> diff khổng lồ.
if (has('.gitattributes')) {
  note('giữ nguyên (đã có)  .gitattributes');
} else if (has('.git')) {
  note('BỎ QUA             .gitattributes  (repo đã có lịch sử git)');
  todo.push(
    'Không thêm .gitattributes vì repo đã có lịch sử — `* text=auto eol=lf` sẽ ' +
      'renormalize line ending toàn bộ và tạo diff khổng lồ. Muốn thêm thì làm ở commit riêng.',
  );
} else {
  write('.gitattributes', readFileSync(join(TEMPLATE, '.gitattributes'), 'utf8'));
  note('tạo mới             .gitattributes');
}

// ── 2. .gitignore: kiểm tra bẫy ignore .claude ───────────────────────
if (has('.gitignore')) {
  const gi = read('.gitignore');
  const bad = gi
    .split(/\r?\n/)
    .map((l, i) => [i + 1, l.trim()])
    .filter(([, l]) => /^!?\.claude\/?$/.test(l) || /^!?\.claude\/\*+$/.test(l))
    .filter(([, l]) => !l.startsWith('!'));
  if (bad.length) {
    warn.push(
      `.gitignore đang ignore .claude/ (dòng ${bad.map(([n]) => n).join(', ')}) — ` +
        `XOÁ dòng đó, nếu không toàn bộ hook/agent/policy sẽ không được commit.`,
    );
  }
  if (!/\.claude\/settings\.local\.json/.test(gi)) {
    write('.gitignore', gi.replace(/\s*$/, '\n') + '\n# Claude Code — override cá nhân\n.claude/settings.local.json\n');
    note('thêm 1 dòng         .gitignore');
  }
} else {
  write('.gitignore', readFileSync(join(TEMPLATE, '.gitignore'), 'utf8'));
  note('tạo mới             .gitignore');
}

// ── 3. Nhận diện stack → commands ────────────────────────────────────
const cmds = { install: '', dev: '', build: '', test: '', testOne: '', lint: '', format: '', typecheck: '' };
const stacks = [];

const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') ? 'bun' : 'npm';
const runner = pm === 'npm' ? 'npm run' : pm;

// Node và PHP dò song song — dự án lai (PHP backend + JS build) rất phổ biến,
// bắt được cái này trước rồi else-if cái kia là mất nguyên một toolchain.
const node = {};
if (has('package.json')) {
  stacks.push(`Node.js (${pm})`);
  let scripts = {};
  try {
    scripts = JSON.parse(read('package.json')).scripts ?? {};
  } catch {
    warn.push('package.json không parse được — bỏ qua phần dò lệnh Node.');
  }
  const pick = (...names) => names.find((n) => scripts[n]);
  node.install = `${pm} install`;
  const m = { dev: pick('dev', 'start', 'serve', 'watch'), build: pick('build'), test: pick('test'), lint: pick('lint'), format: pick('format', 'fmt', 'prettier'), typecheck: pick('typecheck', 'type-check', 'tsc') };
  for (const [k, v] of Object.entries(m)) if (v) node[k] = `${runner} ${v}`;
}

const php = {};
if (has('composer.json')) {
  stacks.push('PHP (composer)');
  let cs = {};
  try {
    cs = JSON.parse(read('composer.json')).scripts ?? {};
  } catch {
    warn.push('composer.json không parse được — bỏ qua phần dò lệnh PHP.');
  }
  php.install = 'composer install';
  if (cs.lint) php.lint = 'composer lint';
  if (['phpunit.xml', 'phpunit.xml.dist', 'tests/phpunit.xml'].some(has)) {
    php.test = 'vendor/bin/phpunit';
    php.testOne = 'vendor/bin/phpunit --filter ';
  }
  if (['.php-cs-fixer.dist.php', '.php-cs-fixer.php'].some(has)) php.format = 'vendor/bin/php-cs-fixer fix';
  if (['phpstan.neon', 'phpstan.neon.dist', 'phpstan.dist.neon'].some(has)) php.typecheck = 'vendor/bin/phpstan analyse';
}

const other = {};
if (!stacks.length) {
  if (has('pyproject.toml')) {
    stacks.push('Python (pyproject)');
    const py = read('pyproject.toml');
    const uv = has('uv.lock');
    other.install = uv ? 'uv sync' : has('poetry.lock') ? 'poetry install' : 'pip install -e .';
    const pre = uv ? 'uv run ' : has('poetry.lock') ? 'poetry run ' : '';
    other.test = `${pre}pytest`;
    other.testOne = `${pre}pytest -k `;
    if (/ruff/.test(py)) { other.lint = `${pre}ruff check .`; other.format = `${pre}ruff format .`; }
    else if (/black/.test(py)) other.format = `${pre}black .`;
    if (/mypy/.test(py)) other.typecheck = `${pre}mypy .`;
  } else if (has('requirements.txt')) {
    stacks.push('Python (requirements.txt)');
    Object.assign(other, { install: 'pip install -r requirements.txt', test: 'pytest' });
  } else if (has('go.mod')) {
    stacks.push('Go');
    Object.assign(other, { install: 'go mod download', build: 'go build ./...', test: 'go test ./...', testOne: 'go test -run ', format: 'go fmt ./...', lint: 'go vet ./...' });
  } else if (has('Cargo.toml')) {
    stacks.push('Rust');
    Object.assign(other, { install: 'cargo fetch', build: 'cargo build', test: 'cargo test', testOne: 'cargo test ', format: 'cargo fmt', lint: 'cargo clippy' });
  } else if (readdirSync(TARGET).some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))) {
    stacks.push('.NET');
    Object.assign(other, { install: 'dotnet restore', build: 'dotnet build', test: 'dotnet test', format: 'dotnet format' });
  } else if (has('pom.xml')) {
    stacks.push('Java (Maven)');
    Object.assign(other, { install: 'mvn install -DskipTests', build: 'mvn package', test: 'mvn test' });
  } else if (has('build.gradle') || has('build.gradle.kts')) {
    stacks.push('Java (Gradle)');
    Object.assign(other, { install: './gradlew dependencies', build: './gradlew build', test: './gradlew test' });
  }
}

// Gộp: backend (PHP) ưu tiên cho install/test/lint, frontend (Node) cho build/dev/format/typecheck
const take = (key, ...srcs) => {
  const hit = srcs.find((s) => s && s[key]);
  if (hit) cmds[key] = hit[key];
};
Object.assign(cmds, other);
take('install', php, node);
take('dev', node, php);
take('build', node, php);
take('test', php, node);
take('testOne', php, node);
take('lint', php, node);
take('format', php, node);
take('typecheck', php, node);
if (php.install && node.install) cmds.install = `composer install && ${pm} install`;

const stackName = stacks.join(' + ') || 'không nhận diện được';

const stackPath = '.claude/stack.json';
if (has(stackPath) && !FORCE) {
  note(`giữ nguyên (đã có)  ${stackPath}`);
} else {
  write(stackPath, JSON.stringify({
    _readme: 'Cấu hình TIỆN ÍCH. AI ĐƯỢC sửa file này. Chính sách bảo mật ở .claude/policy.json.',
    _detected: stackName,
    commands: cmds,
    notes: { _readme: 'Ghi chú dự án mà AI cần biết nhưng không đáng nhét vào CLAUDE.md.', items: [] },
  }, null, 2) + '\n');
  note(`tạo mới             ${stackPath}   [${stackName}]`);
}
if (!Object.values(cmds).some(Boolean)) todo.push('Không dò được lệnh nào — điền tay .claude/stack.json → commands.');

// ── 4. Đề xuất protectedPaths (chỉ lấy cái CÓ THẬT) ──────────────────
const CANDIDATES = [
  'db/migrations/', 'migrations/', 'prisma/migrations/', 'alembic/versions/', 'src/main/resources/db/migration/',
  'openapi.yaml', 'openapi.json', 'swagger.yaml', 'api/openapi.yaml', 'schema.graphql', 'proto/',
  'infra/', 'terraform/', 'helm/', 'k8s/', 'deploy/', '.github/workflows/',
  'docs/ba/', 'docs/governance/', 'docs/adr/', 'LICENSE',
];
const found = CANDIDATES.filter((p) => has(p.replace(/\/$/, '')));

// Danh sách cứng luôn bỏ sót (GLPI để migration ở install/migrations, Laravel ở
// database/migrations...). Quét nông độ sâu 1-2 để bắt nốt.
const SKIP_SCAN = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'out', 'target',
  'obj', 'bin', '.next', '.nuxt', 'coverage', 'files', 'cache', 'tmp', 'locales', 'css', 'js', 'pics']);
try {
  for (const e of readdirSync(TARGET, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_SCAN.has(e.name) || e.name.startsWith('.')) continue;
    if (/^migrations?$/i.test(e.name)) { found.push(`${e.name}/`); continue; }
    try {
      for (const c of readdirSync(join(TARGET, e.name), { withFileTypes: true })) {
        if (c.isDirectory() && /^migrations?$/i.test(c.name)) found.push(`${e.name}/${c.name}/`);
      }
    } catch { /* thư mục không đọc được -> bỏ qua */ }
  }
} catch { /* không liệt kê được thư mục gốc -> dùng danh sách cứng */ }
const SELF = ['.claude/policy.json', '.claude/settings.json', '.claude/hooks/'];

const policyPath = '.claude/policy.json';
if (has(policyPath) && !FORCE) {
  note(`giữ nguyên (đã có)  ${policyPath}`);
} else {
  write(policyPath, JSON.stringify({
    _readme: 'CHÍNH SÁCH BẢO MẬT — chỉ người sửa, AI không sửa được (file này tự nằm trong protectedPaths).',
    protectedPaths: {
      _readme: 'Đường dẫn AI KHÔNG được ghi/sửa/xoá. Hook chặn cứng ở PreToolUse, kể cả lách qua Bash.',
      paths: [...new Set([...found, ...SELF])],
      reason: 'Vùng chỉ người được đổi: spec/contract đã chốt, migration đã chạy, hạ tầng, và chính cơ chế cưỡng chế.',
    },
    secretScan: {
      _readme: 'Chặn ghi secret hardcode. Bỏ qua các đường dẫn hợp lệ chứa secret hoặc giá trị ví dụ.',
      enabled: true,
      skipPaths: ['.env', '.env.*', '**/*.example', '**/*.sample', '**/*.lock', '.claude/hooks/',
        ...(has('tests/fixtures') ? ['tests/fixtures/'] : []),
        ...(has('test/fixtures') ? ['test/fixtures/'] : [])],
    },
  }, null, 2) + '\n');
  note(`tạo mới             ${policyPath}   [${found.length} vùng dò được]`);
  if (!found.length) todo.push('Không dò được vùng nào đáng khoá — mở .claude/policy.json điền tay, nếu không hook chạy mà chẳng chặn gì.');
}

// ── 5. permissions.deny theo thư mục build có thật ───────────────────
// 'bin'/'obj' CHỈ là build output ở .NET/Java. Ở PHP/Node/Python thì bin/ là mã nguồn
// thật (bin/console, bin/rails...) — khoá đọc nhầm là chặn Claude đọc code.
const dotnetOrJava = stacks.some((s) => /^(\.NET|Java)/.test(s));
const BUILD = ['node_modules', 'vendor', '.venv', 'venv', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', 'coverage', '_output', 'gen', 'generated', 'storybook-static', '.git',
  ...(dotnetOrJava ? ['bin', 'obj'] : [])];
let denyList = [];
try {
  const sp = has('.claude/settings.json')
    ? join(TARGET, '.claude/settings.json')
    : join(TEMPLATE, '.claude/settings.json');
  denyList = JSON.parse(readFileSync(sp, 'utf8'))?.permissions?.deny ?? [];
} catch {
  warn.push('.claude/settings.json không parse được — bỏ qua phần rà permissions.deny.');
}
// chỉ nhắc thư mục CÓ THẬT mà deny-list CHƯA phủ
const missingDeny = BUILD.filter((d) => has(d) && !denyList.some((r) => r.includes(`./${d}/`)));
if (missingDeny.length) {
  todo.push(
    `Thư mục build chưa bị khoá đọc — thêm vào .claude/settings.json → permissions.deny: ` +
      missingDeny.map((d) => `Read(./${d}/**)`).join(', '),
  );
}

// ── 6. Báo cáo ───────────────────────────────────────────────────────
const line = '─'.repeat(64);
console.log(`\n${line}\n  CÀI TEMPLATE${DRY ? '  [DRY-RUN — chưa ghi gì]' : ''}\n  đích:  ${TARGET}\n  stack: ${stackName}\n${line}\n`);
for (const l of log) console.log('  ' + l);
if (warn.length) {
  console.log(`\n  ⚠  CẢNH BÁO`);
  for (const w of warn) console.log('     - ' + w);
}
console.log(`\n  VIỆC CÒN LẠI`);
todo.push('Mở Claude Code trong dự án rồi bảo: "Đọc repo, điền mục Dự án + Stack trong CLAUDE.md, bổ sung lệnh còn thiếu trong .claude/stack.json. Giữ CLAUDE.md ngắn."');
todo.push('Rà lại .claude/policy.json → protectedPaths có đúng thứ cần khoá không.');
todo.push(`Test hook:  echo '{"tool_name":"Write","tool_input":{"file_path":"<file trong vùng cấm>","content":"x"}}' | node .claude/hooks/guard.mjs`);
todo.forEach((t, i) => console.log(`     ${i + 1}. ${t}`));
console.log(`\n${line}\n`);
