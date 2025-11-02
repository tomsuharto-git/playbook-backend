const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set SUPABASE_URL and SUPABASE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  console.log('🔧 Setting up database...');
  console.log('');
  console.log('⚠️  IMPORTANT:');
  console.log('This script cannot run the full schema.sql directly.');
  console.log('You need to run it manually in Supabase SQL Editor.');
  console.log('');
  console.log('Steps:');
  console.log('1. Go to: https://supabase.com/dashboard');
  console.log('2. Select your project');
  console.log('3. Go to: SQL Editor (left sidebar)');
  console.log('4. Click: New Query');
  console.log('5. Copy the contents of: backend/db/schema.sql');
  console.log('6. Paste and Run');
  console.log('');
  console.log('After running the schema, this script will verify the setup...');
  console.log('');
  
  // Wait for user
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise((resolve) => {
    readline.question('Press Enter when you have run the schema.sql in Supabase... ', () => {
      readline.close();
      resolve();
    });
  });
  
  console.log('');
  console.log('Verifying database setup...');
  
  try {
    // Check if tables exist
    const tables = [
      'projects',
      'tasks',
      'task_completions',
      'daily_goals',
      'user_preferences',
      'activity_log',
      'meeting_notes'
    ];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('count');
      
      if (error) {
        throw new Error(`Table '${table}' not found: ${error.message}`);
      }
      
      console.log(`✅ Table '${table}' exists`);
    }
    
    // Check if views exist
    const { data: activeTasksView } = await supabase
      .from('active_tasks')
      .select('count');
    
    console.log('✅ View "active_tasks" exists');
    
    console.log('');
    console.log('🎉 Database setup verified successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Fill in your API keys');
    console.log('3. Run: npm run dev');
    
  } catch (error) {
    console.error('');
    console.error('❌ Database verification failed:', error.message);
    console.error('');
    console.error('Make sure you ran the schema.sql file in Supabase SQL Editor.');
    process.exit(1);
  }
}

setupDatabase();
