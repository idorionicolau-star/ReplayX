import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { detectLang, locale, trIn } from '@/i18n';
import { EN } from '@/i18n/en';
import { TRIAL_DAYS } from '@/core/plans';

const SRC = path.resolve(__dirname, '../src');

function files(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

/** Todos os textos fixos passados a tr(...) no código. */
function trKeys(): { key: string; where: string }[] {
  const out: { key: string; where: string }[] = [];
  for (const file of files(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('tr(')) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr' && n.arguments.length) {
        const a = n.arguments[0];
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          out.push({ key: a.text, where: `${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1}` });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const holes = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();

describe('idioma', () => {
  it('escolhe o idioma: o guardado ganha; sem nada, inglês só quando o navegador está em inglês', () => {
    expect(detectLang('en', ['pt-PT'])).toBe('en');
    expect(detectLang('pt', ['en-US'])).toBe('pt');
    expect(detectLang(null, ['en-US', 'pt-PT'])).toBe('en');
    expect(detectLang(null, ['en'])).toBe('en');
    expect(detectLang(null, ['pt-MZ'])).toBe('pt');
    expect(detectLang(null, ['fr-FR'])).toBe('pt');
    expect(detectLang('xx', [])).toBe('pt');
  });

  it('traduz e preenche os valores; sem tradução mostra o português', () => {
    expect(trIn('pt', 'Guardar')).toBe('Guardar');
    expect(trIn('en', 'Guardar')).toBe('Save');
    expect(trIn('en', 'Pro até {0}', '5 Oct')).toBe('Pro until 5 Oct');
    expect(trIn('pt', 'Pro até {0}', '5 out')).toBe('Pro até 5 out');
    expect(trIn('en', 'Texto sem tradução {0}', 7)).toBe('Texto sem tradução 7');
    expect(trIn('en', 'e ganhe {0} dias de Pro', TRIAL_DAYS)).toBe('and get 30 days of Pro');
    expect(locale('en')).toBe('en-US');
    expect(locale('pt')).toBe('pt-PT');
  });

  it('o servidor e os testes (sem navegador) ficam em português', () => {
    expect(trIn('pt', 'Comprar')).toBe('Comprar');
  });

  it('todos os textos fixos do código têm tradução inglesa', () => {
    const keys = trKeys();
    expect(keys.length).toBeGreaterThan(1500);
    const missing = keys.filter((k) => !(k.key in EN)).map((k) => `${k.where}: ${k.key}`);
    expect(missing).toEqual([]);
  });

  it('cada tradução tem os mesmos {n} que o português e não fica vazia', () => {
    const bad = Object.entries(EN)
      .filter(([pt, en]) => !en.trim() || holes(pt).join() !== holes(en).join())
      .map(([pt, en]) => `${pt} → ${en}`);
    // exceções conhecidas: "falta{0} {1} dia{2}" não usa o plural do português
    expect(bad.filter((b) => !b.startsWith('Teste do Pro: falta'))).toEqual([]);
  });
});
