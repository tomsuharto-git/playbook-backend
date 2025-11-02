const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkTaskColors() {
  const { data, error } = await supabase
    .from('tasks')
    .select('project_name, project_color')
    .not('project_color', 'is', null)
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample task colors (from tasks table):\n');
  const uniqueProjects = {};
  data.forEach(t => {
    if (t.project_name && !uniqueProjects[t.project_name]) {
      uniqueProjects[t.project_name] = t.project_color;
      const padded = (t.project_name + ' '.repeat(25)).substring(0, 25);
      console.log(padded + ' | Color: ' + t.project_color);
    }
  });
}

checkTaskColors();
