const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.join(__dirname, '..');
const page = path.join(root, 'inward-agi-remembrance-engine-v11.html');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aru-styles-'));
try {
  const output = path.join(dir, 'tailwind.css');
  const result = spawnSync(process.env.TAILWIND_CLI || 'tailwindcss', [
    '-c', path.join(__dirname, 'tailwind.config.cjs'),
    '-i', path.join(__dirname, 'tailwind.input.css'),
    '-o', output, '--minify'
  ], {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'Tailwind build failed');
  const css = fs.readFileSync(output, 'utf8').trim();
  let html = fs.readFileSync(page, 'utf8');
  const block = `  <style id="tailwind-generated">\n${css}\n  </style>`;
  if (/<style id="tailwind-generated">[\s\S]*?<\/style>/.test(html)) {
    html = html.replace(/  <style id="tailwind-generated">[\s\S]*?<\/style>/, block);
  } else {
    html = html.replace('  <script src="https://cdn.tailwindcss.com"></script>', block);
  }
  if (!html.includes(block)) throw new Error('Could not find the Tailwind style position');
  fs.writeFileSync(page, html);
} finally {
  fs.rmSync(dir, {recursive: true, force: true});
}
