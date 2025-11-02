const express = require('express');
const router = express.Router();
const weatherService = require('../services/weather-service');

/**
 * GET /api/weather
 * Returns current weather conditions
 */
router.get('/', async (req, res) => {
  try {
    const weather = await weatherService.getCurrentWeather();
    res.json(weather);
  } catch (error) {
    console.error('Weather route error:', error);
    res.status(500).json({
      error: 'Failed to fetch weather',
      fallback: true,
      temp: 68,
      description: 'Partly Cloudy',
      icon: '⛅'
    });
  }
});

/**
 * GET /api/weather/forecast
 * Returns weather forecast for next 24 hours
 */
router.get('/forecast', async (req, res) => {
  try {
    const forecast = await weatherService.getForecast();
    res.json(forecast);
  } catch (error) {
    console.error('Forecast route error:', error);
    res.status(500).json({
      error: 'Failed to fetch forecast',
      forecast: []
    });
  }
});

module.exports = router;
