/**
 * Audio Concatenation Service
 *
 * Uses ffmpeg to concatenate multiple MP3 files into a single podcast file
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

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

    console.log(`   🎬 Concatenating ${totalSegments} audio segments${intro || outro ? ' (with music)' : ''}...`);

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

      console.log(`   ✅ Concatenation complete!`);
      console.log(`   📊 Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
      console.log(`   📦 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      return {
        outputPath,
        duration,
        fileSize: stats.size
      };

    } catch (error) {
      console.error(`   ❌ Concatenation error: ${error.message}`);
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
    console.log(`   🧹 Cleaning up ${files.length} temporary segments...`);

    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch (error) {
        console.error(`   ⚠️  Failed to delete ${file}: ${error.message}`);
      }
    }

    console.log(`   ✅ Cleanup complete`);
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
      console.error('   ❌ ffmpeg not found. Please install it:');
      console.error('   macOS: brew install ffmpeg');
      console.error('   Ubuntu: sudo apt-get install ffmpeg');
      return false;
    }
  }
}

module.exports = new AudioConcatenator();
