const express = require('express');
const router = express.Router();
const greetingGenerator = require('../ai/greeting-generator');
const { supabase } = require('../db/supabase-client');

/**
 * GET /api/greeting
 * Returns personalized AI-generated greeting based on:
 * - Time of day
 * - Pending/active tasks
 * - Urgency distribution
 * - Active projects
 *
 * Caching: Regenerates every 3 hours to stay current throughout the day
 */
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    // Check if we have a recent greeting (within 3 hours)
    const { data: existingGreeting } = await supabase
      .from('daily_greetings')
      .select('greeting, generated_at')
      .eq('date', today)
      .single();

    // If we have a greeting from less than 3 hours ago, return it (cached)
    if (existingGreeting) {
      const generatedAt = new Date(existingGreeting.generated_at);
      const ageInHours = (now - generatedAt) / (1000 * 60 * 60);

      if (generatedAt > threeHoursAgo) {
        console.log(`📝 Using cached greeting (${ageInHours.toFixed(1)}h old)`);
        return res.json({
          greeting: existingGreeting.greeting,
          cached: true,
          age_hours: ageInHours
        });
      }

      console.log(`🔄 Greeting is stale (${ageInHours.toFixed(1)}h old), regenerating...`);
    }

    // Generate a new greeting
    console.log('🔄 Generating fresh greeting');
    const greeting = await greetingGenerator.generate();
    res.json({
      greeting,
      cached: false
    });
  } catch (error) {
    console.error('Greeting route error:', error);
    res.status(500).json({
      error: 'Failed to generate greeting',
      greeting: 'Hey Tom, ready to roll 🔥'
    });
  }
});

module.exports = router;
