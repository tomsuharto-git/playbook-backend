/**
 * ElevenLabs Text-to-Speech Generator
 *
 * Generates audio for individual dialogue lines using ElevenLabs TTS API
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ElevenLabsTTS {
  constructor() {
    this.apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech';
  }

  get apiKey() {
    return process.env.ELEVENLABS_API_KEY;
  }

  /**
   * Generate audio for a single line of dialogue
   * @param {string} text - The text to speak
   * @param {string} voiceId - ElevenLabs voice ID
   * @param {string} outputPath - Where to save the audio file
   * @returns {Promise<string>} Path to generated audio file
   */
  async generateAudio(text, voiceId, outputPath) {
    if (!this.apiKey) {
      throw new Error('ELEVENLABS_API_KEY not set');
    }

    const url = `${this.apiUrl}/${voiceId}`;

    try {
      const response = await axios.post(url, {
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true
        }
      }, {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      });

      // Save audio to file
      await fs.writeFile(outputPath, response.data);
      return outputPath;

    } catch (error) {
      console.error(`   ❌ TTS Error for text: "${text.substring(0, 50)}..."`);
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.data?.toString() || error.message}`);
      throw error;
    }
  }

  /**
   * Generate audio for all dialogue lines
   * @param {Array} dialogue - Array of {host, text} objects
   * @param {string} outputDir - Directory to save audio files
   * @returns {Promise<Array>} Array of file paths
   */
  async generateDialogueAudio(dialogue, outputDir) {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const voice1 = process.env.PODCAST_VOICE_1;
    const voice2 = process.env.PODCAST_VOICE_2;

    if (!voice1 || !voice2) {
      throw new Error('PODCAST_VOICE_1 and PODCAST_VOICE_2 must be set in .env');
    }

    console.log(`   🎤 Generating ${dialogue.length} audio segments...`);

    const audioPaths = [];

    for (let i = 0; i < dialogue.length; i++) {
      const line = dialogue[i];
      const voiceId = line.host === 1 ? voice1 : voice2;
      const outputPath = path.join(outputDir, `segment_${String(i).padStart(3, '0')}.mp3`);

      console.log(`   ${i + 1}/${dialogue.length} - Host ${line.host}: "${line.text.substring(0, 40)}..."`);

      await this.generateAudio(line.text, voiceId, outputPath);
      audioPaths.push(outputPath);

      // Small delay to avoid rate limiting
      if (i < dialogue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`   ✅ Generated ${audioPaths.length} audio segments`);
    return audioPaths;
  }
}

module.exports = new ElevenLabsTTS();
