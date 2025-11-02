const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function generateJourneyForCAVA() {
  console.log('\n🎯 Generating journey for CAVA...\n');

  // Fetch CAVA project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('name', 'CAVA')
    .single();

  if (projectError) {
    console.error('Error fetching project:', projectError);
    return;
  }

  // Calculate days until deadline
  const deadline = new Date(project.deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day
  const daysUntil = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

  // Calculate milestone dates between today and deadline
  // Milestones should be steps BEFORE the deadline, not the deadline itself
  // Use 85% of the time span so the last milestone is a few days before deadline
  const timeSpan = deadline - today;
  const usableTimeSpan = timeSpan * 0.85;
  const milestone1Date = new Date(today.getTime() + (usableTimeSpan / 3));
  const milestone2Date = new Date(today.getTime() + (2 * usableTimeSpan / 3));
  const milestone3Date = new Date(today.getTime() + usableTimeSpan);

  // Helper to avoid weekends - shift to next Monday if weekend
  const avoidWeekend = (date) => {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (day === 0) { // Sunday -> add 1 day to get Monday
      date.setDate(date.getDate() + 1);
    } else if (day === 6) { // Saturday -> add 2 days to get Monday
      date.setDate(date.getDate() + 2);
    }
    return date;
  };

  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  // Generate 3 key milestones for CAVA Round 1 Presentation
  // Milestones are preparatory steps leading UP TO the deadline (not the deadline itself)
  const aiInsights = {
    status: daysUntil < 7 ? 'at_risk' : 'on_track',
    status_summary: `Round 1 presentation scheduled for November 10th. ${daysUntil} days remaining. Developing strategic positioning and creative concepts.`,
    milestones: [
      {
        description: 'Complete Strategic Framework & Insights',
        status: 'in_progress',
        target_date: formatDate(avoidWeekend(milestone1Date)),
        dependencies: []
      },
      {
        description: 'Finalize Creative Concepts & Visual Direction',
        status: 'upcoming',
        target_date: formatDate(avoidWeekend(milestone2Date)),
        dependencies: ['Complete Strategic Framework & Insights']
      },
      {
        description: 'Rehearse Presentation & Final Refinements',
        status: 'upcoming',
        target_date: formatDate(avoidWeekend(milestone3Date)),
        dependencies: ['Finalize Creative Concepts & Visual Direction']
      }
    ]
  };

  // Update project with AI insights
  const { data: updated, error: updateError} = await supabase
    .from('projects')
    .update({
      ai_insights: aiInsights,
      journey_generated_at: new Date().toISOString()
    })
    .eq('id', project.id)
    .select();

  if (updateError) {
    console.error('❌ Error updating project:', updateError);
  } else {
    console.log('✅ Successfully generated journey for CAVA\n');
    console.log('📊 Generated Insights:');
    console.log('Status:', aiInsights.status);
    console.log('Summary:', aiInsights.status_summary);
    console.log('\nMilestones:');
    aiInsights.milestones.forEach((m, i) => {
      const statusEmoji = {
        completed: '✅',
        in_progress: '🔄',
        upcoming: '⏳',
        at_risk: '⚠️'
      }[m.status] || '○';
      console.log(`  ${statusEmoji} ${m.description} - ${m.target_date}`);
    });
  }
}

generateJourneyForCAVA();
