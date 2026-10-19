const fs = require('node:fs');
const path = require('node:path');

// Exclude the generated CSS from the scanner so rebuilding is stable.
const html = fs.readFileSync(path.join(__dirname, '..', 'inward-agi-remembrance-engine-v11.html'), 'utf8')
  .replace(/<style id="tailwind-generated">[\s\S]*?<\/style>/, '');

module.exports = {
  content: [{raw: html, extension: 'html'}],
  theme: {extend: {}},
  plugins: []
};
