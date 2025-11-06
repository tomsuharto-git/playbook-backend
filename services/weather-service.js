const axios = require('axios');
const logger = require('../utils/logger').service('weather-service');

/**
 * Weather Service - OpenWeatherMap Integration
 * Free tier: 1000 calls/day, 60 calls/min
 *
 * Sign up: https://openweathermap.org/api
 * Get API key from dashboard
 */

class WeatherService {
  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY;
    this.baseUrl = 'https://api.openweathermap.org/data/2.5';

    // Default location: Montclair, NJ (based on your school email context)
    this.defaultLat = 40.8259;
    this.defaultLon = -74.2090;
  }

  /**
   * Get current weather
   * @param {number} lat - Latitude (optional, defaults to Montclair, NJ)
   * @param {number} lon - Longitude (optional)
   * @returns {Promise<Object>} Weather data
   */
  async getCurrentWeather(lat = this.defaultLat, lon = this.defaultLon) {
    try {
      // If no API key, return fallback data
      if (!this.apiKey) {
        logger.warn('⚠️  OPENWEATHER_API_KEY not set, using fallback weather');
        return this.getFallbackWeather();
      }

      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'imperial' // Fahrenheit
        }
      });

      const data = response.data;

      return {
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        description: this.capitalizeDescription(data.weather[0].description),
        icon: this.getWeatherIcon(data.weather[0].id),
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed),
        location: data.name,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('❌ Weather API error:', { arg0: error.message });
      return this.getFallbackWeather();
    }
  }

  /**
   * Get weather forecast for next 3 days
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} Forecast data
   */
  async getForecast(lat = this.defaultLat, lon = this.defaultLon) {
    try {
      if (!this.apiKey) {
        return { forecast: [] };
      }

      const response = await axios.get(`${this.baseUrl}/forecast`, {
        params: {
          lat,
          lon,
          appid: this.apiKey,
          units: 'imperial',
          cnt: 8 // Next 24 hours (3-hour intervals)
        }
      });

      const forecast = response.data.list.map(item => ({
        time: new Date(item.dt * 1000).toISOString(),
        temp: Math.round(item.main.temp),
        description: this.capitalizeDescription(item.weather[0].description),
        icon: this.getWeatherIcon(item.weather[0].id)
      }));

      return { forecast };
    } catch (error) {
      logger.error('❌ Forecast API error:', { arg0: error.message });
      return { forecast: [] };
    }
  }

  /**
   * Convert weather description to emoji icon
   * Based on OpenWeatherMap condition codes
   */
  getWeatherIcon(weatherId) {
    // Thunderstorm (200-232)
    if (weatherId >= 200 && weatherId < 300) return '⛈️';

    // Drizzle (300-321)
    if (weatherId >= 300 && weatherId < 400) return '🌧️';

    // Rain (500-531)
    if (weatherId >= 500 && weatherId < 600) {
      if (weatherId === 511) return '🌨️'; // Freezing rain
      return '🌧️';
    }

    // Snow (600-622)
    if (weatherId >= 600 && weatherId < 700) return '❄️';

    // Atmosphere (701-781) - fog, mist, haze, etc.
    if (weatherId >= 700 && weatherId < 800) return '🌫️';

    // Clear (800)
    if (weatherId === 800) return '☀️';

    // Clouds (801-804)
    if (weatherId === 801) return '🌤️'; // Few clouds
    if (weatherId === 802) return '⛅'; // Scattered clouds
    if (weatherId === 803 || weatherId === 804) return '☁️'; // Broken/overcast

    return '🌤️'; // Default
  }

  /**
   * Capitalize weather description
   */
  capitalizeDescription(desc) {
    return desc
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Fallback weather when API is unavailable
   */
  getFallbackWeather() {
    const currentHour = new Date().getHours();

    // Different defaults based on time of day
    let temp = 68;
    let description = 'Partly Cloudy';
    let icon = '⛅';

    if (currentHour >= 6 && currentHour < 12) {
      // Morning
      temp = 65;
      description = 'Clear';
      icon = '☀️';
    } else if (currentHour >= 12 && currentHour < 18) {
      // Afternoon
      temp = 72;
      description = 'Sunny';
      icon = '☀️';
    } else if (currentHour >= 18 && currentHour < 21) {
      // Evening
      temp = 68;
      description = 'Partly Cloudy';
      icon = '⛅';
    } else {
      // Night
      temp = 60;
      description = 'Clear';
      icon = '🌙';
    }

    return {
      temp,
      feelsLike: temp,
      description,
      icon,
      humidity: 60,
      windSpeed: 5,
      location: 'Montclair',
      timestamp: new Date().toISOString(),
      fallback: true
    };
  }
}

module.exports = new WeatherService();
