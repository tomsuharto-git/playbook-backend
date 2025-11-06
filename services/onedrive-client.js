const axios = require('axios');
const logger = require('../utils/logger').service('onedrive-client');

class OneDriveClient {
  constructor() {
    // Using Microsoft Graph API with app-only access
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.accessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) return this.accessToken;

    const url = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });

    const response = await axios.post(url, params);
    this.accessToken = response.data.access_token;
    return this.accessToken;
  }

  async downloadFileByPath(filePath) {
    try {
      const token = await this.getAccessToken();
      const url = `https://graph.microsoft.com/v1.0/me/drive/root:${filePath}:/content`;
      
      logger.info('📥 Downloading:', { filePath: filePath });
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        responseType: 'json'
      });
      
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.info('File not found:', { filePath: filePath });
        return null;
      }
      logger.error('Failed to download :', { filePath: filePath });
      throw error;
    }
  }

  async downloadFile(shareLink) {
    // Keep this for webhook compatibility (if you add it back later)
    try {
      logger.info('📥 Downloading from share link');
      
      const response = await axios.get(shareLink, {
        responseType: 'json'
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to download:', { arg0: error.message });
      throw error;
    }
  }
}

module.exports = OneDriveClient;
