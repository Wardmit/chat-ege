const fs = require('fs');
const path = require('path');

function refactorFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace fetch("/api...") with apiFetch("/api...")
  // We need to be careful not to replace anything else, but all fetches in AdminPanel and ChatWindow point to our API.
  content = content.replace(/fetch\((["'`]\/api\/)/g, 'apiFetch($1');
  // Also handle template literal fetch(`/api...`)
  content = content.replace(/fetch\((`\/api\/)/g, 'apiFetch($1');
  // Handle endpoint variable fetch(endpoint...)
  content = content.replace(/fetch\(endpoint/g, 'apiFetch(endpoint');

  // Add import if not present
  if (content.includes('apiFetch') && !content.includes("import { apiFetch }")) {
    // Add import right after the first line or other imports
    content = content.replace(/(import React.*?;\n)/, '$1import { apiFetch } from "../api";\n');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Refactored ${filePath}`);
}

refactorFile(path.join(__dirname, 'src/components/AdminPanel.tsx'));
refactorFile(path.join(__dirname, 'src/components/ChatWindow.tsx'));
