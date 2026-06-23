import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {execFileSync} from 'child_process';

const root = process.cwd();
const outDir = path.join(root, '.understand-anything');
const intermediateDir = path.join(outDir, 'intermediate');
const tmpDir = path.join(outDir, 'tmp');
fs.mkdirSync(intermediateDir, {recursive: true});
fs.mkdirSync(tmpDir, {recursive: true});

const toPosix = p => p.split(path.sep).join('/');
const rel = p => toPosix(path.relative(root, p));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const lineCount = text => text.length ? text.split(/\r?\n/).length : 0;
const nonEmptyLineCount = text => text.split(/\r?\n/).filter(line => line.trim()).length;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const abs = path.join(dir, entry.name);
    const relative = rel(abs);
    if (entry.isDirectory()) {
      if (shouldSkipDir(relative)) continue;
      walk(abs, acc);
    } else if (!shouldSkipFile(relative)) {
      acc.push(relative);
    }
  }
  return acc;
}

function shouldSkipDir(relative) {
  const parts = relative.split('/');
  return parts.some(part => [
    '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next',
    '.cache', '.turbo', 'target', 'obj', 'vendor', 'venv', '.venv',
    '__pycache__', 'intermediate', 'tmp',
  ].includes(part));
}

function shouldSkipFile(file) {
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (file === 'package-lock.json' || file.endsWith('.lock')) return true;
  if (base === 'LICENSE' || base === '.gitignore' || base === '.editorconfig') return true;
  if (base.startsWith('.prettierrc') || base.startsWith('.eslintrc')) return true;
  if (file.includes('/.idea/') || file.includes('/.vscode/')) return true;
  if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|mp3|mp4|pdf|zip|tar|gz|map)$/i.test(file)) return true;
  if (file.endsWith('.min.js') || file.endsWith('.min.css') || file.includes('.generated.')) return true;
  if (file.startsWith('.understand-anything/') && file !== '.understand-anything/.understandignore') return true;
  return false;
}

function languageFor(file) {
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (base === 'Dockerfile') return 'dockerfile';
  if (base === 'Makefile') return 'makefile';
  const map = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.md': 'markdown', '.rst': 'markdown', '.json': 'json', '.jsonc': 'jsonc',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
    '.sh': 'shell', '.bash': 'shell', '.env': 'config',
  };
  return map[ext] || (ext ? ext.slice(1) : 'unknown');
}

function categoryFor(file) {
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();
  if (/\.(md|rst|txt)$/i.test(file) && base !== 'LICENSE') return 'docs';
  if (base === 'Dockerfile' || base.startsWith('docker-compose') || file.startsWith('.github/workflows/') || ext === '.tf' || ext === '.tfvars') return 'infra';
  if (/\.(sql|graphql|gql|proto|prisma|csv)$/i.test(file) || file.endsWith('.schema.json')) return 'data';
  if (/\.(sh|bash|ps1|bat)$/i.test(file)) return 'script';
  if (/\.(html|htm|css|scss|sass|less)$/i.test(file)) return 'markup';
  if (/\.(yaml|yml|json|jsonc|toml|xml|cfg|ini|env)$/i.test(file) || ['tsconfig.json', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].includes(base)) return 'config';
  return 'code';
}

function fileNodeType(category) {
  if (category === 'docs') return 'document';
  if (category === 'config') return 'config';
  return 'file';
}

function nodeIdForFile(file, category) {
  return `${fileNodeType(category)}:${file}`;
}

function resolveImport(fromFile, spec, fileSet) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/')
    ? path.join(root, spec.slice(2))
    : path.resolve(root, path.dirname(fromFile), spec);
  const relBase = rel(base);
  const probes = path.extname(relBase)
    ? [relBase]
    : [
        `${relBase}.ts`, `${relBase}.tsx`, `${relBase}.js`, `${relBase}.jsx`,
        `${relBase}.css`, `${relBase}/index.ts`, `${relBase}/index.tsx`,
        `${relBase}/index.js`, `${relBase}/index.jsx`,
      ];
  return probes.find(probe => fileSet.has(probe)) || null;
}

function extractImports(file, text, fileSet) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const resolved = resolveImport(file, match[1], fileSet);
      if (resolved) imports.add(resolved);
    }
  }
  return [...imports].sort();
}

function summarizeFile(file, category) {
  const summaries = {
    'README.md': 'Getting-started documentation for running the AI Studio app locally, including dependency installation, Gemini API key setup, and dev server startup.',
    'package.json': 'NPM manifest defining the React, Vite, Tailwind, Motion, Express, and Google GenAI dependencies plus scripts for development, type-checking, and production builds.',
    'metadata.json': 'AI Studio metadata describing the app name and runtime-facing project description.',
    'index.html': 'Vite HTML shell that provides the root mount element and loads the React entry module.',
    'tsconfig.json': 'TypeScript compiler configuration for the React application, including JSX settings, path aliasing, and modern module resolution.',
    'vite.config.ts': 'Vite configuration wiring React and Tailwind CSS plugins, local alias resolution, and development server HMR behavior.',
    'src/main.tsx': 'React browser entry point that mounts the application into the HTML root under StrictMode and loads global styles.',
    'src/App.tsx': 'Top-level application shell that owns authentication state, lesson selection, user progress, toast display, guarded navigation, and page routing.',
    'src/types.ts': 'Shared TypeScript domain model definitions for app state, CEFR levels, lessons, vocabulary, quizzes, modules, and user progress.',
    'src/data/mockData.ts': 'Static German-learning curriculum data, testimonials, FAQs, lesson vocabulary, grammar explanations, and quiz questions used by the UI.',
    'src/lib/toast.ts': 'Small browser event helper for dispatching typed app toast notifications.',
    'src/index.css': 'Tailwind CSS entry stylesheet defining design tokens, theme colors, animations, responsive utilities, and base styling.',
    'src/components/DesignSystem.tsx': 'Reusable UI primitives such as buttons, inputs, level badges, and progress bars shared across pages.',
    'src/components/Navigation.tsx': 'Global navigation and sidebar components that expose route controls, progress indicators, authentication actions, and responsive menus.',
    'src/components/VideoPlayer.tsx': 'Interactive lesson video player simulation with playback controls, volume, progress, transcript, and completion toast behavior.',
    'src/pages/LandingPage.tsx': 'Public marketing and discovery page for DeutschPath with hero content, feature highlights, testimonials, FAQ, and login call-to-action.',
    'src/pages/LoginPage.tsx': 'Login/signup form flow that validates required fields, collects user identity, fires toasts, and hands successful authentication to the app shell.',
    'src/pages/DashboardPage.tsx': 'Authenticated dashboard summarizing XP, streak, learning progress, recent modules, recommended lessons, and quick navigation actions.',
    'src/pages/RoadmapPage.tsx': 'Learning roadmap view that groups modules and lessons by level, showing completion state and lesson selection actions.',
    'src/pages/LessonDetailPage.tsx': 'Lesson learning view that combines video, vocabulary, grammar explanations, completion actions, quiz entry, and next-lesson progression.',
    'src/pages/QuizPage.tsx': 'Quiz flow for multiple-choice, fill-blank, matching, and listening questions with scoring, feedback, progress, and completion handling.',
  };
  return summaries[file] || `${category} file used by the React/Vite learning application.`;
}

function tagsFor(file, category) {
  if (file === 'README.md') return ['documentation', 'getting-started', 'local-development'];
  if (file === 'package.json') return ['configuration', 'dependencies', 'scripts', 'build-system'];
  if (file === 'tsconfig.json') return ['configuration', 'typescript', 'compiler'];
  if (file === 'vite.config.ts') return ['configuration', 'vite', 'tailwind', 'build-system'];
  if (file === 'metadata.json') return ['configuration', 'metadata', 'ai-studio'];
  if (file === 'index.html') return ['entry-point', 'html-shell', 'vite'];
  if (file === 'src/main.tsx') return ['entry-point', 'react', 'bootstrap'];
  if (file === 'src/App.tsx') return ['app-shell', 'state-management', 'routing', 'authentication'];
  if (file.includes('/components/')) return ['component', 'design-system', 'ui'];
  if (file.includes('/pages/')) return ['page', 'workflow', 'ui'];
  if (file.includes('/data/')) return ['content-data', 'curriculum', 'mock-data'];
  if (file === 'src/types.ts') return ['type-definition', 'domain-model', 'typescript'];
  if (file === 'src/lib/toast.ts') return ['utility', 'event-handler', 'notification'];
  if (file === 'src/index.css') return ['styling', 'tailwind', 'design-tokens'];
  if (category === 'config') return ['configuration', 'project-settings'];
  if (category === 'docs') return ['documentation'];
  return ['source', category];
}

function exportedSymbols(file, text) {
  const symbols = [];
  const patterns = [
    /export\s+default\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+function\s+([A-Za-z0-9_]+)/g,
    /export\s+const\s+([A-Za-z0-9_]+)/g,
    /export\s+interface\s+([A-Za-z0-9_]+)/g,
    /export\s+type\s+([A-Za-z0-9_]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) symbols.push(match[1]);
  }
  return [...new Set(symbols)];
}

function functionSummary(file, name) {
  const map = {
    App: 'Coordinates global React state, guarded navigation, progress persistence, page rendering, and toast presentation for the learning app.',
    showToast: 'Dispatches a typed browser custom event consumed by the app-level toast renderer.',
    DashboardPage: 'Renders authenticated learning progress, statistics, recommended lessons, and module shortcuts.',
    LandingPage: 'Renders the public product experience and routes users toward authentication.',
    LessonDetailPage: 'Renders a single lesson with video, vocabulary, grammar, completion, quiz, and next-lesson actions.',
    LoginPage: 'Handles login/signup form state, validation, toast feedback, and successful auth handoff.',
    QuizPage: 'Manages quiz state, answer validation, scoring, feedback, and completion callbacks.',
    RoadmapPage: 'Renders level/module progress and lesson navigation for the learning roadmap.',
    Button: 'Provides a reusable styled button with variants and loading/disabled behavior.',
    Input: 'Provides a reusable labeled input with icon and validation presentation.',
    LevelBadge: 'Displays CEFR level labels with consistent color treatment.',
    ProgressBar: 'Displays bounded progress with optional labels and percentage text.',
    Navbar: 'Renders top navigation, responsive mobile menu controls, progress indicators, and auth actions.',
    Sidebar: 'Renders desktop portal navigation and streak status for authenticated views.',
    VideoPlayer: 'Simulates a lesson media player with playback, progress, volume, fullscreen, transcript, and completion feedback.',
  };
  return map[name] || `Exported symbol ${name} from ${file}.`;
}

function complexity(nonEmpty, symbolCount) {
  if (nonEmpty > 220 || symbolCount > 8) return 'complex';
  if (nonEmpty > 60 || symbolCount > 3) return 'moderate';
  return 'simple';
}

function addEdge(edges, source, target, type, weight, description) {
  if (!source || !target || source === target) return;
  edges.push({source, target, type, weight, direction: 'forward', description});
}

let files;
try {
  const tracked = execFileSync('git', ['ls-files'], {cwd: root, encoding: 'utf8'})
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(file => fs.existsSync(path.join(root, file)) && !shouldSkipFile(file));
  files = tracked.length ? tracked : walk(root);
} catch {
  files = walk(root);
}

const sourcePreferred = [
  'README.md', 'package.json', 'metadata.json', 'index.html', 'tsconfig.json', 'vite.config.ts',
  'src/main.tsx', 'src/App.tsx', 'src/types.ts', 'src/lib/toast.ts', 'src/data/mockData.ts',
  'src/components/DesignSystem.tsx', 'src/components/Navigation.tsx', 'src/components/VideoPlayer.tsx',
  'src/pages/LandingPage.tsx', 'src/pages/LoginPage.tsx', 'src/pages/DashboardPage.tsx',
  'src/pages/RoadmapPage.tsx', 'src/pages/LessonDetailPage.tsx', 'src/pages/QuizPage.tsx',
  'src/index.css',
];
files = sourcePreferred.filter(exists);
const fileSet = new Set(files);

const fileList = files.map(file => {
  const text = read(file);
  return {
    path: file,
    language: languageFor(file),
    sizeLines: lineCount(text),
    fileCategory: categoryFor(file),
  };
});

const importMap = Object.fromEntries(files.map(file => {
  const category = categoryFor(file);
  return [file, category === 'code' || category === 'markup' ? extractImports(file, read(file), fileSet) : []];
}));

const pkg = JSON.parse(read('package.json'));
const deps = {...(pkg.dependencies || {}), ...(pkg.devDependencies || {})};
const frameworks = [];
for (const [dep, name] of [
  ['react', 'React'],
  ['vite', 'Vite'],
  ['@vitejs/plugin-react', 'Vite React Plugin'],
  ['@tailwindcss/vite', 'Tailwind CSS'],
  ['tailwindcss', 'Tailwind CSS'],
  ['motion', 'Motion'],
  ['lucide-react', 'Lucide React'],
  ['@google/genai', 'Google GenAI'],
  ['express', 'Express'],
]) {
  if (deps[dep] && !frameworks.includes(name)) frameworks.push(name);
}

const languages = [...new Set(fileList.map(file => file.language))].sort();
const projectName = pkg.name || path.basename(root);
const projectDescription = 'A Vite-powered React learning app for DeutschPath, combining Vietnamese-language German lessons, progress tracking, quizzes, and reusable UI components.';

const nodes = [];
const edges = [];
for (const info of fileList) {
  const text = read(info.path);
  const fileId = nodeIdForFile(info.path, info.fileCategory);
  const symbols = exportedSymbols(info.path, text);
  nodes.push({
    id: fileId,
    type: fileNodeType(info.fileCategory),
    name: path.basename(info.path),
    filePath: info.path,
    summary: summarizeFile(info.path, info.fileCategory),
    complexity: complexity(nonEmptyLineCount(text), symbols.length),
    tags: tagsFor(info.path, info.fileCategory),
    language: info.language,
    languageNotes: info.language === 'typescript' ? 'Uses React component exports, typed props, and shared domain interfaces.' : undefined,
  });
  for (const target of importMap[info.path] || []) {
    addEdge(edges, fileId, nodeIdForFile(target, categoryFor(target)), 'imports', 0.7, `${info.path} imports ${target}.`);
  }
  for (const symbol of symbols) {
    const isType = /^(AppState|Level|Lesson|Module|UserStats|QuizQuestion|VocabularyItem|GrammarPoint|QuizType)$/.test(symbol);
    const nodeType = isType ? 'class' : 'function';
    const symbolId = `${nodeType}:${info.path}:${symbol}`;
    const isSignificant = info.path === 'src/types.ts' || info.path.includes('/pages/') || info.path.includes('/components/') || ['App', 'showToast'].includes(symbol);
    if (!isSignificant) continue;
    nodes.push({
      id: symbolId,
      type: nodeType,
      name: symbol,
      filePath: info.path,
      summary: isType ? `Shared TypeScript domain type ${symbol} used to keep app state and learning content strongly typed.` : functionSummary(info.path, symbol),
      complexity: info.path === 'src/App.tsx' || info.path.includes('QuizPage') || info.path.includes('LandingPage') || info.path.includes('VideoPlayer') ? 'complex' : 'moderate',
      tags: isType ? ['type-definition', 'domain-model', 'typescript'] : ['component', 'exported', 'react'],
      language: info.language,
    });
    addEdge(edges, fileId, symbolId, 'contains', 1.0, `${path.basename(info.path)} contains exported symbol ${symbol}.`);
    addEdge(edges, fileId, symbolId, 'exports', 0.8, `${path.basename(info.path)} exports ${symbol}.`);
  }
}

const id = file => nodeIdForFile(file, categoryFor(file));
addEdge(edges, id('README.md'), id('src/main.tsx'), 'documents', 0.5, 'The README explains how to run the app entry point locally.');
addEdge(edges, id('README.md'), id('src/App.tsx'), 'documents', 0.5, 'The README describes the application run flow that boots the app shell.');
addEdge(edges, id('package.json'), id('vite.config.ts'), 'configures', 0.6, 'NPM scripts and dependencies configure the Vite build.');
addEdge(edges, id('package.json'), id('src/main.tsx'), 'configures', 0.6, 'The package manifest supplies runtime and build dependencies for the React entry point.');
addEdge(edges, id('tsconfig.json'), id('src/types.ts'), 'configures', 0.6, 'TypeScript compiler settings govern the shared type definitions.');
addEdge(edges, id('tsconfig.json'), id('src/App.tsx'), 'configures', 0.6, 'TypeScript compiler settings apply to the app shell.');
addEdge(edges, id('vite.config.ts'), id('src/main.tsx'), 'configures', 0.6, 'Vite config controls bundling and plugin behavior for the browser entry point.');
addEdge(edges, id('index.html'), id('src/main.tsx'), 'serves', 0.5, 'The HTML shell loads the React entry module.');
addEdge(edges, id('src/index.css'), id('src/main.tsx'), 'configures', 0.6, 'The global stylesheet is imported by the React entry point.');
addEdge(edges, id('metadata.json'), id('README.md'), 'related', 0.5, 'AI Studio metadata complements the project documentation.');
addEdge(edges, id('src/data/mockData.ts'), id('src/types.ts'), 'depends_on', 0.6, 'Curriculum fixtures are typed with the shared lesson and module models.');
addEdge(edges, id('src/App.tsx'), 'function:src/App.tsx:App', 'calls', 0.8, 'The React renderer invokes the top-level App component.');

const layers = [
  {
    id: 'layer:documentation-and-metadata',
    name: 'Documentation and Metadata',
    description: 'Human-facing setup notes and AI Studio metadata that explain the project and its runtime context.',
    nodeIds: ['document:README.md', 'config:metadata.json'],
  },
  {
    id: 'layer:build-and-runtime-config',
    name: 'Build and Runtime Config',
    description: 'Configuration files that define dependencies, TypeScript behavior, Vite bundling, and the HTML mount shell.',
    nodeIds: ['config:package.json', 'config:tsconfig.json', 'file:vite.config.ts', 'file:index.html'],
  },
  {
    id: 'layer:application-shell',
    name: 'Application Shell',
    description: 'Bootstrap and orchestration code responsible for mounting React, maintaining app state, routing between views, and rendering global feedback.',
    nodeIds: ['file:src/main.tsx', 'file:src/App.tsx'],
  },
  {
    id: 'layer:shared-ui-and-utilities',
    name: 'Shared UI and Utilities',
    description: 'Reusable components, navigation widgets, media controls, toast helpers, and global styling shared by multiple pages.',
    nodeIds: [
      'file:src/components/DesignSystem.tsx',
      'file:src/components/Navigation.tsx',
      'file:src/components/VideoPlayer.tsx',
      'file:src/lib/toast.ts',
      'file:src/index.css',
    ],
  },
  {
    id: 'layer:learning-experience-pages',
    name: 'Learning Experience Pages',
    description: 'Route-level React screens that implement discovery, login, dashboard, roadmap, lesson study, and quiz workflows.',
    nodeIds: [
      'file:src/pages/LandingPage.tsx',
      'file:src/pages/LoginPage.tsx',
      'file:src/pages/DashboardPage.tsx',
      'file:src/pages/RoadmapPage.tsx',
      'file:src/pages/LessonDetailPage.tsx',
      'file:src/pages/QuizPage.tsx',
    ],
  },
  {
    id: 'layer:domain-model-and-content',
    name: 'Domain Model and Content',
    description: 'Typed learning domain models and static curriculum data that drive lesson, quiz, progress, testimonial, and FAQ experiences.',
    nodeIds: ['file:src/types.ts', 'file:src/data/mockData.ts'],
  },
];

const tour = [
  {
    order: 1,
    title: 'Project Setup',
    description: 'Start with the project documentation and manifest to understand how the Vite React app is installed, configured, and run locally.',
    nodeIds: ['document:README.md', 'config:package.json', 'file:vite.config.ts'],
  },
  {
    order: 2,
    title: 'Application Boot',
    description: 'Follow the browser boot path from the HTML shell into the React entry point and top-level app shell.',
    nodeIds: ['file:index.html', 'file:src/main.tsx', 'file:src/App.tsx'],
  },
  {
    order: 3,
    title: 'State, Navigation, and Progress',
    description: 'Inspect how App coordinates authentication, progress persistence, current route selection, lesson selection, and toast feedback.',
    nodeIds: ['file:src/App.tsx', 'file:src/components/Navigation.tsx', 'file:src/lib/toast.ts'],
  },
  {
    order: 4,
    title: 'Shared Interface System',
    description: 'Review the reusable buttons, inputs, badges, progress bars, media player, and global Tailwind styles used across the learning flow.',
    nodeIds: ['file:src/components/DesignSystem.tsx', 'file:src/components/VideoPlayer.tsx', 'file:src/index.css'],
  },
  {
    order: 5,
    title: 'Learning Workflows',
    description: 'Walk through the route-level pages that implement landing, login, dashboard, roadmap, lesson study, and quiz interactions.',
    nodeIds: [
      'file:src/pages/LandingPage.tsx',
      'file:src/pages/LoginPage.tsx',
      'file:src/pages/DashboardPage.tsx',
      'file:src/pages/RoadmapPage.tsx',
      'file:src/pages/LessonDetailPage.tsx',
      'file:src/pages/QuizPage.tsx',
    ],
  },
  {
    order: 6,
    title: 'Learning Domain Data',
    description: 'Finish with the typed lesson model and static German curriculum data that feed the roadmap, lesson detail, dashboard, and quiz pages.',
    nodeIds: ['file:src/types.ts', 'file:src/data/mockData.ts'],
  },
];

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const graph = {
  version: '1.0.0',
  project: {
    name: projectName,
    languages,
    frameworks,
    description: projectDescription,
    analyzedAt: new Date().toISOString(),
    gitCommitHash: commit,
  },
  nodes: nodes.map(node => Object.fromEntries(Object.entries(node).filter(([, value]) => value !== undefined))),
  edges,
  layers,
  tour,
};

function validate(g) {
  const issues = [];
  const warnings = [];
  const nodeIds = new Set();
  for (const [index, node] of g.nodes.entries()) {
    if (!node.id) issues.push(`Node[${index}] missing id`);
    if (!node.type) issues.push(`Node[${index}] '${node.id}' missing type`);
    if (!node.name) issues.push(`Node[${index}] '${node.id}' missing name`);
    if (!node.summary) issues.push(`Node[${index}] '${node.id}' missing summary`);
    if (!node.tags?.length) issues.push(`Node[${index}] '${node.id}' missing tags`);
    if (nodeIds.has(node.id)) issues.push(`Duplicate node ID '${node.id}'`);
    nodeIds.add(node.id);
  }
  const edgeSeen = new Set();
  g.edges = g.edges.filter(edge => {
    const key = `${edge.source}|${edge.target}|${edge.type}`;
    if (edgeSeen.has(key)) return false;
    edgeSeen.add(key);
    if (!nodeIds.has(edge.source)) {
      issues.push(`Edge source '${edge.source}' not found`);
      return false;
    }
    if (!nodeIds.has(edge.target)) {
      issues.push(`Edge target '${edge.target}' not found`);
      return false;
    }
    return true;
  });
  const assigned = new Set();
  const fileLevelTypes = new Set(['file', 'config', 'document', 'service', 'pipeline', 'table', 'schema', 'resource', 'endpoint']);
  for (const layer of g.layers) {
    layer.nodeIds = layer.nodeIds.filter(nodeId => {
      if (!nodeIds.has(nodeId)) {
        issues.push(`Layer '${layer.id}' refs missing node '${nodeId}'`);
        return false;
      }
      if (assigned.has(nodeId)) issues.push(`Node '${nodeId}' appears in multiple layers`);
      assigned.add(nodeId);
      return true;
    });
  }
  for (const node of g.nodes.filter(node => fileLevelTypes.has(node.type))) {
    if (!assigned.has(node.id)) issues.push(`File node '${node.id}' not in any layer`);
  }
  for (const step of g.tour) {
    step.nodeIds = step.nodeIds.filter(nodeId => {
      if (!nodeIds.has(nodeId)) {
        issues.push(`Tour '${step.title}' refs missing node '${nodeId}'`);
        return false;
      }
      return true;
    });
  }
  const linked = new Set(g.edges.flatMap(edge => [edge.source, edge.target]));
  for (const node of g.nodes) {
    if (!linked.has(node.id)) warnings.push(`Node '${node.id}' has no edges (orphan)`);
  }
  const countBy = (items, key) => items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
  return {
    issues,
    warnings,
    stats: {
      totalNodes: g.nodes.length,
      totalEdges: g.edges.length,
      totalLayers: g.layers.length,
      tourSteps: g.tour.length,
      nodeTypes: countBy(g.nodes, 'type'),
      edgeTypes: countBy(g.edges, 'type'),
      fileCategories: fileList.reduce((acc, file) => {
        acc[file.fileCategory] = (acc[file.fileCategory] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

const scanResult = {
  projectName,
  projectDescription,
  languages,
  frameworks,
  complexity: files.length <= 30 ? 'small' : 'moderate',
  files: fileList,
  importMap,
  filteredByIgnore: 0,
};
const review = validate(graph);

const fingerprintStore = Object.fromEntries(files.map(file => {
  const buffer = fs.readFileSync(path.join(root, file));
  return [file, {
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    sizeLines: fileList.find(item => item.path === file)?.sizeLines ?? 0,
    generatedAt: graph.project.analyzedAt,
  }];
}));

fs.writeFileSync(path.join(intermediateDir, 'scan-result.json'), JSON.stringify(scanResult, null, 2));
fs.writeFileSync(path.join(intermediateDir, 'assembled-graph.json'), JSON.stringify(graph, null, 2));
fs.writeFileSync(path.join(intermediateDir, 'review.json'), JSON.stringify(review, null, 2));
fs.writeFileSync(path.join(outDir, 'knowledge-graph.json'), JSON.stringify(graph, null, 2));
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
  lastAnalyzedAt: graph.project.analyzedAt,
  gitCommitHash: commit,
  version: '1.0.0',
  analyzedFiles: files.length,
}, null, 2));
fs.writeFileSync(path.join(outDir, 'fingerprints.json'), JSON.stringify(fingerprintStore, null, 2));

console.log(JSON.stringify({
  output: path.join(outDir, 'knowledge-graph.json'),
  filesAnalyzed: files.length,
  review,
}, null, 2));
