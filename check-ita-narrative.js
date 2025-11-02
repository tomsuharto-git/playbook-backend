require('dotenv').config();
const { supabase } = require('./db/supabase-client');

(async () => {
  console.log('Checking ITA Airlines project narrative logs...\n');

  // Find ITA project
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, status, narrative, created_at')
    .ilike('name', '%ITA%')
    .order('created_at', { ascending: false });

  if (projError) {
    console.error('Error:', projError);
    return;
  }

  if (!projects || projects.length === 0) {
    console.log('❌ No ITA Airlines project found in database');
    return;
  }

  const project = projects[0];
  console.log('=== ITA AIRLINES PROJECT ===');
  console.log('ID:', project.id);
  console.log('Name:', project.name);
  console.log('Status:', project.status || 'Unknown');
  console.log('Created:', project.created_at);
  console.log();

  if (project.narrative && Array.isArray(project.narrative)) {
    console.log('=== NARRATIVE LOGS IN DATABASE ===');
    console.log(`Total entries: ${project.narrative.length}`);
    console.log();

    const last5 = project.narrative.slice(0, 5);
    last5.forEach((entry, idx) => {
      console.log(`--- Narrative Log ${idx + 1} ---`);
      console.log(`Date: ${entry.date || 'No date'}`);
      console.log(`Source: ${entry.source || 'unknown'}`);
      console.log(`Headline: ${entry.headline || 'No headline'}`);
      if (entry.bullets && entry.bullets.length > 0) {
        console.log('Bullets:');
        entry.bullets.forEach(bullet => console.log(`  • ${bullet}`));
      }
      console.log();
    });

    console.log('These are the exact narrative logs that would be included in your briefing context.');
  } else {
    console.log('⚠️  NO NARRATIVE LOGS IN DATABASE');
    console.log('The narrative field is empty or null.');
    console.log('This means NO narrative context was provided to the AI when generating your briefing.');
  }
})();
