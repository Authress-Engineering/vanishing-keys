const shortUuid = require('short-uuid');
const secretsManager = require('./secretsManager');

class SecretsController {
  async createSecret(request) {
    const secretId = shortUuid('abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ346789').generate();

    const encryptedSecret = request.body?.encryptedSecret;
    if (!encryptedSecret || typeof encryptedSecret !== 'string') {
      return {
        statusCode: 400,
        body: {
          title: 'Encrypted Secret was not specified. Please specify the encrypted secret to save'
        }
      };
    }
    if (encryptedSecret.length > 10240) {
      return {
        statusCode: 400,
        body: {
          title: `Encrypted Secret is too long, it must be less than 10KB, actual length was ${encryptedSecret.length}.`
        }
      };
    }
    await secretsManager.createSecret(secretId, encryptedSecret);

    return {
      statusCode: 201,
      body: {
        secretId
      }
    };
  }

  async getSecret(request) {
    const secretData = await secretsManager.fetchAndDeleteSecret(request.pathParameters.secretId);
    if (!secretData) {
      return {
        statusCode: 404
      };
    }

    return {
      statusCode: 200,
      body: {
        encryptedSecret: secretData.encryptedSecret
      }
    };
  }

  async deleteSecret(request) {
    try {
      await secretsManager.deleteSecret(request.pathParameters.secretId);
      return {
        statusCode: 204
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: {
          title: 'Unexpected error occurred deleting the secret.'
        }
      };
    }
  }
}

module.exports = new SecretsController();
