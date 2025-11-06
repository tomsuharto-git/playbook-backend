const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger').job('move-email-notes');
const { supabase } = require('../db/supabase-client');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Move important email notes from staging to project folders
 * Runs 3x daily at 7am, 1pm, 7pm (1 hour after Gmail scans)
 */
async function moveEmailNotesToProjects() {
  logger.info('📧 Moving email notes to project folders...');
  
  const vaultPath = process.env.VAULT_PATH;
  const emailNotesPath = path.join(vaultPath, 'Notion/LIFE/Email Notes');
  
  // Get all projects with vault folders
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .not('vault_folders', 'is', null)
    .eq('status', 'active');
  
  if (!projects || projects.length === 0) {
    logger.info('No projects with vault folders found');
    return;
  }
  
  // Get all email notes
  const emailFiles = await fs.readdir(emailNotesPath);
  const mdFiles = emailFiles.filter(f => f.endsWith('.md'));
  
  logger.info('Found  email notes to process', { length: mdFiles.length });
  
  let movedCount = 0;
  
  for (const filename of mdFiles) {
    const filePath = path.join(emailNotesPath, filename);
    const content = await fs.readFile(filePath, 'utf8');
    
    // Extract project from frontmatter
    const projectMatch = content.match(/\*\*Project:\*\* (.+)/);
    if (!projectMatch) continue;
    
    const projectName = projectMatch[1].trim();
    const project = projects.find(p => 
      p.name.toLowerCase() === projectName.toLowerCase()
    );
    
    if (!project || !project.vault_folders || project.vault_folders.length === 0) {
      continue;
    }
    
    // Check if note should be moved (HIGH priority OR has action items)
    const hasActionItems = content.includes('## Action Items') && content.includes('- [ ]');
    const isHighPriority = content.includes('*Priority: HIGH*');
    
    if (!hasActionItems && !isHighPriority) {
      // Skip routine emails
      continue;
    }
    
    // Get better filename from AI
    const newFilename = await generateFilename(content, projectName);
    
    // Get target folder (first vault folder for project)
    const targetFolder = project.vault_folders[0];
    const targetPath = path.join(targetFolder, newFilename);
    
    // Check if file already exists at target
    try {
      await fs.access(targetPath);
      logger.info('⏭️  Skipped - already exists:', { newFilename: newFilename });
      continue;
    } catch (error) {
      // File doesn't exist, proceed with move
    }
    
    // Move the file (rename in Node.js parlance)
    await fs.rename(filePath, targetPath);
    logger.info('✅ Moved:  → /', { filename: filename, name: project.name, newFilename: newFilename });
    movedCount++;
  }
  
  logger.info('✅ Email notes processed:  moved,  skipped', { movedCount: movedCount, length - movedCount: mdFiles.length - movedCount });
}

/**
 * Generate better filename using AI based on content
 */
async function generateFilename(content, projectName) {
  // Extract key info
  const subjectMatch = content.match(/^# (.+)$/m);
  const dateMatch = content.match(/\*\*Date:\*\* (.+)$/m);
  
  const subject = subjectMatch ? subjectMatch[1] : 'Email';
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
  
  const prompt = `Generate a concise filename for this email note.

Project: ${projectName}
Subject: ${subject}
Date: ${date}

Rules:
- Format: YYYY-MM-DD-descriptive-name.md
- Max 50 characters total
- Use kebab-case (lowercase with hyphens)
- Be specific and descriptive
- No special characters except hyphens and date

Examples:
- 2025-10-08-school-budget-crisis.md
- 2025-10-08-client-meeting-followup.md
- 2025-10-08-project-deadline-update.md

Return ONLY the filename, nothing else.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }]
  });

  const filename = response.content[0].text.trim();
  
  // Ensure it ends with .md
  return filename.endsWith('.md') ? filename : `${filename}.md`;
}

module.exports = { moveEmailNotesToProjects };

// Run if called directly
if (require.main === module) {
  moveEmailNotesToProjects()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Error:', { arg0: error });
      process.exit(1);
    });
}
