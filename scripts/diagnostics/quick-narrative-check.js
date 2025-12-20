// Standalone diagnostic - no dependencies beyond supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runDiagnostics() {
  console.log('\n========================================');
  console.log('NARRATIVE LOGS DIAGNOSTIC REPORT');
  console.log('========================================\n');

  // 1. Check narratives in projects table (current storage)
  console.log('1. CHECKING PROJECTS.NARRATIVE FIELD\n');

  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('id, name, narrative, tag')
    .order('name');

  if (projError) {
    console.log('   Error:', projError.message);
  } else {
    let narrativeCount = 0;
    let totalNarratives = 0;
    const projectsWithNarratives = [];

    projects.forEach(p => {
      const narratives = p.narrative || [];
      if (narratives.length > 0) {
        narrativeCount++;
        totalNarratives += narratives.length;

        // Get source breakdown
        const sources = {};
        narratives.forEach(n => {
          sources[n.source] = (sources[n.source] || 0) + 1;
        });

        // Get date range
        const dates = narratives.map(n => n.date).filter(Boolean).sort();
        const oldest = dates[0] || 'N/A';
        const newest = dates[dates.length - 1] || 'N/A';

        projectsWithNarratives.push({
          name: p.name,
          count: narratives.length,
          sources,
          dateRange: `${oldest} to ${newest}`
        });
      }
    });

    console.log(`   Projects with narratives: ${narrativeCount}/${projects.length}`);
    console.log(`   Total narrative entries: ${totalNarratives}\n`);

    if (projectsWithNarratives.length > 0) {
      console.log('   Projects breakdown:');
      projectsWithNarratives
        .sort((a, b) => b.count - a.count)
        .forEach(p => {
          console.log(`   - ${p.name}: ${p.count} entries`);
          console.log(`     Sources: ${JSON.stringify(p.sources)}`);
          console.log(`     Date range: ${p.dateRange}`);
        });
    } else {
      console.log('   WARNING: No narratives found in any projects!');
    }
  }

  // 2. Check project_narratives table (Phase 2)
  console.log('\n2. CHECKING PROJECT_NARRATIVES TABLE (Phase 2)\n');

  const { data: tableNarratives, error: tableError, count } = await supabase
    .from('project_narratives')
    .select('id, project_id, headline, source, date', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5);

  if (tableError) {
    console.log(`   Table status: ${tableError.message}`);
    if (tableError.message.includes('does not exist')) {
      console.log('   (Phase 2 table not yet created - this is expected)');
    }
  } else {
    console.log(`   Total entries in table: ${count || 0}`);
    if (tableNarratives && tableNarratives.length > 0) {
      console.log('   Latest 5 entries:');
      tableNarratives.forEach(n => {
        console.log(`   - [${n.date}] ${n.headline} (${n.source})`);
      });
    }
  }

  // 3. Check recent briefings for narrative inclusion
  console.log('\n3. CHECKING RECENT BRIEFINGS FOR NARRATIVE CONTEXT\n');

  const { data: briefs, error: briefError } = await supabase
    .from('daily_briefs')
    .select('date, calendar_events')
    .order('date', { ascending: false })
    .limit(3);

  if (briefError) {
    console.log('   Error:', briefError.message);
  } else if (briefs && briefs.length > 0) {
    briefs.forEach(brief => {
      const events = brief.calendar_events || [];
      const eventsWithBriefings = events.filter(e => e.ai_briefing);
      const eventsWithNarrativeContext = events.filter(e =>
        e.ai_briefing && (
          e.ai_briefing.includes('RECENT PROJECT ACTIVITY') ||
          e.ai_briefing.includes('Recent updates') ||
          e.ai_briefing.includes('narrative')
        )
      );

      console.log(`   ${brief.date}:`);
      console.log(`     Total events: ${events.length}`);
      console.log(`     Events with AI briefings: ${eventsWithBriefings.length}`);
      console.log(`     Briefings with narrative context: ${eventsWithNarrativeContext.length}`);
    });
  } else {
    console.log('   No recent briefings found');
  }

  // 4. Check Gmail scanner job status
  console.log('\n4. GMAIL SCANNER STATUS (Generates Email Narratives)\n');

  const { data: gmailLogs, error: gmailError } = await supabase
    .from('job_logs')
    .select('job_name, status, started_at, completed_at, result')
    .eq('job_name', 'gmail-scanner')
    .order('started_at', { ascending: false })
    .limit(5);

  if (gmailError) {
    console.log(`   Job logs table: ${gmailError.message}`);
  } else if (gmailLogs && gmailLogs.length > 0) {
    console.log('   Recent Gmail scanner runs:');
    gmailLogs.forEach(log => {
      const date = new Date(log.started_at).toLocaleString();
      console.log(`   - ${date}: ${log.status}`);
      if (log.result) {
        console.log(`     Result: ${JSON.stringify(log.result).substring(0, 100)}`);
      }
    });
  } else {
    console.log('   No Gmail scanner job logs found');
  }

  console.log('\n========================================');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('========================================\n');
}

runDiagnostics()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Diagnostic failed:', err);
    process.exit(1);
  });
