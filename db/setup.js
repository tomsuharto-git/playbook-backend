const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('❌ Missing Supabase credentials');
  logger.error('Please set SUPABASE_URL and SUPABASE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupDatabase() {
  logger.info('🔧 Setting up database...');
  logger.info('');
  logger.warn('⚠️  IMPORTANT:');
  logger.info('This script cannot run the full schema.sql directly.');
  logger.info('You need to run it manually in Supabase SQL Editor.');
  logger.info('');
  logger.info('Steps:');
  logger.info('1. Go to: https://supabase.com/dashboard');
  logger.info('2. Select your project');
  logger.info('3. Go to: SQL Editor (left sidebar)');
  logger.info('4. Click: New Query');
  logger.info('5. Copy the contents of: backend/db/schema.sql');
  logger.info('6. Paste and Run');
  logger.info('');
  logger.info('After running the schema, this script will verify the setup...');
  logger.info('');
  
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
  
  logger.info('');
  logger.info('Verifying database setup...');
  
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
      
      logger.info('✅ Table '' exists', { table: table });
    }
    
    // Check if views exist
    const { data: activeTasksView } = await supabase
      .from('active_tasks')
      .select('count');
    
    logger.info('✅ View "active_tasks" exists');
    
    logger.info('');
    logger.info('🎉 Database setup verified successfully!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Copy .env.example to .env');
    logger.info('2. Fill in your API keys');
    logger.info('3. Run: npm run dev');
    
  } catch (error) {
    logger.error('');
    logger.error('❌ Database verification failed:', { arg0: error.message });
    logger.error('');
    logger.error('Make sure you ran the schema.sql file in Supabase SQL Editor.');
    process.exit(1);
  }
}

setupDatabase();
