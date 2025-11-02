// Project name to vault folder mappings
// Use this when project names don't match vault folder names exactly

const mappings = {
  // Code projects
  'Grid Kings': 'F1',
  'Trivia': 'Synthetic Panels',
  
  // Personal projects - map to closest folder or leave unmapped if no good match
  'Insurance': 'Health Insurance',
  'Healthcare': 'Health Insurance',
  
  // Note: School, Fitness, Finance, Misc don't have dedicated folders
  // They use individual files or mixed locations
  // Leave unmapped - they'll show as "No vault files found"
  
  // Add more mappings as needed
  // 'Project Name in DB': 'Folder Name in Vault'
};

// Project-specific context notes
// Add current campaign names, important context that AI should prioritize
const projectNotes = {
  'Baileys': {
    currentCampaign: 'Name Your Pleasure',
    note: 'Current active campaign is "Name Your Pleasure". All other files are historical context.'
  },
  'Therabody': {
    currentCampaign: 'Brand Campaign', 
    note: 'Latest project is "Brand Campaign". Prioritize most recent files.'
  }
  // Add more as needed
};

// Projects with multiple folders (special handling)
const multiFolder = {
  'Claude Code': [
    'Obsidian',
    'Eleven Labs', 
    'Figma MCP',
    'Granola',
    'Presentations',
    'Image Creator'
  ]
};

module.exports = mappings;
module.exports.projectNotes = projectNotes;
module.exports.multiFolder = multiFolder;
