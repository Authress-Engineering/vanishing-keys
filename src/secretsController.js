const { Duration } = require('luxon');
const base64url = require('base64url');
const shortUuid = require('short-uuid');
const crypto = require('crypto');

const secretsManager = require('./secretsManager');
const logger = require('./logger');

class SecretsController {
  async createSecret(request) {
    logger.log({ title: 'Secret Created', level: 'TRACK' });
    const randomBytes = base64url.encode(crypto.randomBytes(64));
    const secretId = `${shortUuid('abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ346789').generate()}-${randomBytes}`;

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
    const validTtlDurations = {
      PT10M: 'PT10M',
      PT24H: 'PT24H',
      P7D: 'P7D'
    };
    if (request.body.duration && !validTtlDurations[request.body.duration]) {
      return {
        statusCode: 400,
        body: {
          title: 'Invalid Duration specified for secret lifetime'
        }
      };
    }
    const ttlDuration = Duration.fromISO(request.body.duration || 'PT7D');
    await secretsManager.createSecret(secretId, encryptedSecret, ttlDuration);

    return {
      statusCode: 201,
      body: {
        secretId
      }
    };
  }

  async getSecret(request) {
    logger.log({ title: 'Secret Fetched', level: 'TRACK' });
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
