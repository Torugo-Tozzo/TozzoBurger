import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es', 'fr', 'zh', 'hi'];
export const I18N_NAMESPACES = [
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

const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const RESERVED_VALUE_PATTERN = /\b(?:TODO|TBD)\b/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function flattenLeafKeys(value, prefix = '') {
  const leaves = new Map();

  if (!isRecord(value)) {
    if (prefix) leaves.set(prefix, value);
    return leaves;
  }

  for (const [key, child] of Object.entries(value)) {
    const leafKey = prefix ? `${prefix}.${key}` : key;
    if (isRecord(child)) {
      for (const [nestedKey, nestedValue] of flattenLeafKeys(child, leafKey)) {
        leaves.set(nestedKey, nestedValue);
      }
    } else {
      leaves.set(leafKey, child);
    }
  }

  return leaves;
}

export function extractPlaceholders(value) {
  const placeholders = new Set();
  if (typeof value !== 'string') return placeholders;

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1].trim());
  }

  return placeholders;
}

function formatSet(values) {
  return [...values].sort().join(', ') || '(none)';
}

function listDirectoryEntries(directory) {
  return readdirSync(directory, { withFileTypes: true });
}

function readBundle(localesRoot, locale, namespace) {
  const file = join(localesRoot, locale, `${namespace}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${locale}/${namespace}: unable to read JSON (${reason})`);
  }
}

function validateLeafValues(locale, namespace, leaves) {
  const errors = [];

  if (leaves.size === 0) {
    errors.push(`${locale}/${namespace}: bundle has no leaf keys`);
  }

  for (const [key, value] of leaves) {
    const context = `${locale}/${namespace}/${key}`;
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${context}: value must be a non-empty string`);
      continue;
    }
    if (RESERVED_VALUE_PATTERN.test(value)) {
      errors.push(`${context}: value contains TODO/TBD placeholder text`);
    }
  }

  return errors;
}

function compareBundles(referenceLocale, locale, namespace, reference, candidate) {
  const errors = [];
  const referenceKeys = new Set(reference.keys());
  const candidateKeys = new Set(candidate.keys());

  for (const key of referenceKeys) {
    if (!candidateKeys.has(key)) {
      errors.push(`${locale}/${namespace}/${key}: missing leaf key (reference ${referenceLocale})`);
    }
  }

  for (const key of candidateKeys) {
    if (!referenceKeys.has(key)) {
      errors.push(`${locale}/${namespace}/${key}: extra leaf key (not in ${referenceLocale})`);
    }
  }

  for (const key of referenceKeys) {
    if (!candidateKeys.has(key)) continue;
    const expected = extractPlaceholders(reference.get(key));
    const actual = extractPlaceholders(candidate.get(key));
    if (formatSet(expected) !== formatSet(actual)) {
      const expectedText = `{{${formatSet(expected)}}}`;
      const actualText = `{{${formatSet(actual)}}}`;
      errors.push(
        `${locale}/${namespace}/${key}: placeholder set differs; expected ${expectedText}, received ${actualText}`,
      );
    }
  }

  return errors;
}

function ensureExactDirectories(localesRoot) {
  if (!existsSync(localesRoot)) {
    throw new Error(`Locale root does not exist: ${localesRoot}`);
  }

  const entries = listDirectoryEntries(localesRoot);
  const nonDirectories = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
  if (nonDirectories.length > 0) {
    throw new Error(`Locale root must contain only locale directories (extra: ${nonDirectories.join(', ')})`);
  }

  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const expected = new Set(SUPPORTED_LOCALES);
  const actual = new Set(directories);
  const missing = SUPPORTED_LOCALES.filter((locale) => !actual.has(locale));
  const extra = directories.filter((locale) => !expected.has(locale));

  if (missing.length > 0 || extra.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`missing: ${missing.join(', ')}`);
    if (extra.length > 0) details.push(`extra: ${extra.join(', ')}`);
    throw new Error(`Locale directories must be exactly ${SUPPORTED_LOCALES.join(', ')} (${details.join('; ')})`);
  }
}

function ensureExactNamespaceFiles(localesRoot, locale) {
  const entries = listDirectoryEntries(join(localesRoot, locale));
  const nonFiles = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name);
  if (nonFiles.length > 0) {
    throw new Error(`${locale}: namespace entries must be files only (extra: ${nonFiles.join(', ')})`);
  }

  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const expected = new Set(I18N_NAMESPACES.map((namespace) => `${namespace}.json`));
  const actual = new Set(files);
  const missing = I18N_NAMESPACES.filter((namespace) => !actual.has(`${namespace}.json`));
  const extra = files.filter((file) => !expected.has(file));

  if (missing.length > 0 || extra.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`missing: ${missing.join(', ')}`);
    if (extra.length > 0) details.push(`extra: ${extra.join(', ')}`);
    throw new Error(`${locale}: namespace files must be exactly ${I18N_NAMESPACES.join(', ')} (${details.join('; ')})`);
  }
}

export function checkI18n(localesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')) {
  ensureExactDirectories(localesRoot);

  for (const locale of SUPPORTED_LOCALES) {
    ensureExactNamespaceFiles(localesRoot, locale);
  }

  const referenceBundles = new Map();
  const errors = [];
  for (const namespace of I18N_NAMESPACES) {
    const bundle = readBundle(localesRoot, 'en', namespace);
    const leaves = flattenLeafKeys(bundle);
    errors.push(...validateLeafValues('en', namespace, leaves));
    referenceBundles.set(namespace, leaves);
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === 'en') continue;
    for (const namespace of I18N_NAMESPACES) {
      const leaves = flattenLeafKeys(readBundle(localesRoot, locale, namespace));
      errors.push(...validateLeafValues(locale, namespace, leaves));
      errors.push(...compareBundles('en', locale, namespace, referenceBundles.get(namespace), leaves));
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    locales: SUPPORTED_LOCALES.length,
    namespaces: I18N_NAMESPACES.length,
  };
}

export function getLocalesRoot(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf('--root');
  if (rootIndex >= 0) {
    const root = argv[rootIndex + 1];
    if (!root) throw new Error('--root requires a directory path');
    return resolve(root);
  }

  const positionalRoot = argv.find((argument) => !argument.startsWith('-'));
  return positionalRoot
    ? resolve(positionalRoot)
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales');
}

export function main() {
  const result = checkI18n(getLocalesRoot());
  console.log(`i18n check passed: ${result.locales} locales, ${result.namespaces} namespaces`);
}

const invokedFile = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`i18n check failed:\n${message}`);
    process.exitCode = 1;
  }
}
