import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const LOCALES = ['en', 'pt-BR', 'es', 'fr', 'zh', 'hi'];
const NAMESPACES = [
  'common',
  'auth',
  'navigation',
  'orders',
  'sales',
  'products',
  'employees',
  'charts',
  'settings',
  'sync',
  'printer',
  'offline',
  'status',
  'errors',
  'catalog',
];

const checker = resolve(__dirname, '..', 'check-i18n.mjs');

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'tozzoburger-i18n-check-'));

  for (const locale of LOCALES) {
    const localeDirectory = join(root, locale);
    mkdirSync(localeDirectory, { recursive: true });
    for (const namespace of NAMESPACES) {
      writeFileSync(
        join(localeDirectory, `${namespace}.json`),
        JSON.stringify({ greeting: `${locale} greeting {{name}}` }, null, 2),
      );
    }
  }

  return root;
}

function runChecker(root: string): string {
  return execFileSync(process.execPath, [checker, '--root', root], {
    encoding: 'utf8',
  });
}

function runCheckerFailure(root: string): string {
  try {
    runChecker(root);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    return `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`;
  }
  throw new Error('Expected the i18n checker to fail');
}

describe('strict i18n checker', () => {
  let root: string;

  beforeEach(() => {
    root = createFixture();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('accepts seven complete bundles with matching leaf keys and placeholders', () => {
    expect(runChecker(root)).toContain('i18n check passed');
  });

  it('reports a missing leaf with locale, namespace, and key context', () => {
    const file = join(root, 'pt-BR', 'common.json');
    const bundle = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    delete bundle.greeting;
    writeFileSync(file, JSON.stringify(bundle));

    expect(runCheckerFailure(root)).toContain('pt-BR/common/greeting');
  });

  it('reports an extra leaf with locale, namespace, and key context', () => {
    const file = join(root, 'es', 'common.json');
    const bundle = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    bundle.extra = 'Extra value';
    writeFileSync(file, JSON.stringify(bundle));

    expect(runCheckerFailure(root)).toContain('es/common/extra');
  });

  it('rejects a different placeholder set instead of falling back to English', () => {
    const file = join(root, 'fr', 'common.json');
    writeFileSync(file, JSON.stringify({ greeting: 'Bonjour {{user}}' }));

    expect(runCheckerFailure(root)).toContain('fr/common/greeting');
    expect(runCheckerFailure(root)).toContain('placeholder');
  });

  it('rejects empty and obvious TODO values with key context', () => {
    const file = join(root, 'zh', 'common.json');
    writeFileSync(file, JSON.stringify({ greeting: 'TODO' }));

    const failure = runCheckerFailure(root);
    expect(failure).toContain('zh/common/greeting');
    expect(failure).toMatch(/empty|TODO/i);
  });

  it('rejects a locale directory outside the supported closed set', () => {
    mkdirSync(join(root, 'de'));

    expect(runCheckerFailure(root)).toMatch(/extra: de/);
  });

  it('rejects non-directory entries at the locale root', () => {
    writeFileSync(join(root, 'README.md'), 'not a locale directory');

    expect(runCheckerFailure(root)).toMatch(/Locale root.*directories.*extra: README\.md/);
  });

  it('rejects subdirectories inside a locale directory', () => {
    mkdirSync(join(root, 'en', 'nested'));

    expect(runCheckerFailure(root)).toMatch(/en: namespace entries must be files only.*nested/);
  });

  it('rejects a namespace file outside the shared namespace set', () => {
    writeFileSync(join(root, 'en', 'unexpected.json'), JSON.stringify({ greeting: 'Extra' }));

    expect(runCheckerFailure(root)).toMatch(/en: namespace files.*extra: unexpected\.json/);
  });

  it('rejects an empty string value with locale, namespace, and key context', () => {
    const file = join(root, 'zh', 'common.json');
    writeFileSync(file, JSON.stringify({ greeting: '' }));

    const failure = runCheckerFailure(root);
    expect(failure).toContain('zh/common/greeting');
    expect(failure).toMatch(/non-empty/i);
  });
});
