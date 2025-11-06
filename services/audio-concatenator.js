/**
 * Audio Concatenation Service
 *
 * Uses ffmpeg to concatenate multiple MP3 files into a single podcast file
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger').service('audio-concatenator');

const execAsync = promisify(exec);

class AudioConcatenator {
  /**
   * Concatenate multiple MP3 files into a single output file
   * @param {Array<string>} inputFiles - Array of MP3 file paths in order
   * @param {string} outputPath - Path for the final concatenated file
   * @param {Object} options - Optional intro/outro music
   * @param {string} options.intro - Path to intro music file
   * @param {string} options.outro - Path to outro music file
   * @returns {Promise<Object>} Result with file path and metadata
   */
  async concatenate(inputFiles, outputPath, options = {}) {
    if (!inputFiles || inputFiles.length === 0) {
      throw new Error('No input files provided for concatenation');
    }

    const { intro, outro } = options;
    const totalSegments = inputFiles.length + (intro ? 1 : 0) + (outro ? 1 : 0);

    logger.info('🎬 Concatenating  audio segments...', { totalSegments: totalSegments, intro || outro ? ' (with music)' : '': intro || outro ? ' (with music)' : '' });

    // Create a temporary file list for ffmpeg
    const fileListPath = path.join(path.dirname(outputPath), 'concat_list.txt');

    try {
      // Build file list with intro, content, and outro
      const filesToConcat = [];

      if (intro) {
        filesToConcat.push(intro);
      }

      filesToConcat.push(...inputFiles);

      if (outro) {
        filesToConcat.push(outro);
      }

      // Write file list in ffmpeg concat format
      // Use absolute paths to avoid path resolution issues
      const fileListContent = filesToConcat
        .map(file => `file '${file}'`)
        .join('\n');

      await fs.writeFile(fileListPath, fileListContent);

      // Run ffmpeg concat command
      // Using concat demuxer for MP3 files with absolute paths
      const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`;

      const { stdout, stderr } = await execAsync(ffmpegCommand, {
        timeout: 300000 // 5 minute timeout
      });

      // Get file stats
      const stats = await fs.stat(outputPath);

      // Get duration using ffprobe
      const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout: durationOutput } = await execAsync(durationCommand);
      const duration = Math.round(parseFloat(durationOutput.trim()));

      logger.info('✅ Concatenation complete!');
      logger.debug('📊 Duration: m s', { floor(duration / 60): Math.floor(duration / 60), duration % 60: duration % 60 });
      logger.info('📦 File size:  MB', { toFixed(2): (stats.size / 1024 / 1024).toFixed(2) });

      return {
        outputPath,
        duration,
        fileSize: stats.size
      };

    } catch (error) {
      logger.error('❌ Concatenation error:', { message: error.message });
      throw error;

    } finally {
      // Clean up temporary file list
      try {
        await fs.unlink(fileListPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Clean up temporary audio segment files
   * @param {Array<string>} files - Array of file paths to delete
   */
  async cleanupSegments(files) {
    logger.info('🧹 Cleaning up  temporary segments...', { length: files.length });

    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch (error) {
        logger.error('⚠️  Failed to delete :', { file: file, message: error.message });
      }
    }

    logger.info('✅ Cleanup complete');
  }

  /**
   * Check if ffmpeg is installed
   * @returns {Promise<boolean>}
   */
  async checkFFmpeg() {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      logger.error('   ❌ ffmpeg not found. Please install it:');
      logger.error('   macOS: brew install ffmpeg');
      logger.error('   Ubuntu: sudo apt-get install ffmpeg');
      return false;
    }
  }
}

module.exports = new AudioConcatenator();
