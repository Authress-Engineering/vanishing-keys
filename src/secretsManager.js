
const { DynamoDB } = require('aws-sdk');
const { DateTime, Duration } = require('luxon');

const logger = require('./logger');

const dynamoDbTable = 'OneTimeSecrets-secrets-prod';

const dynamoDbClient = new DynamoDB.DocumentClient();

class SecretsManager {
  async createSecret(secretId, encryptedSecret, ttlDuration) {
    const now = DateTime.utc();
    const params = {
      TableName: dynamoDbTable,
      Item: {
        secretId,
        encryptedSecret,
        createdTime: now.toISO(),
        lastUpdated: now.toISO(),
        TTL: Math.round(now.plus(Duration.fromISO(ttlDuration || 'PT7D')).toSeconds())
      },
      ConditionExpression: 'attribute_not_exists(secretId)'
    };

    try {
      await dynamoDbClient.put(params).promise();
    } catch (error) {
      if (error.code !== 'ConditionalCheckFailedException') {
        throw error;
      }
    }
  }

  async fetchAndDeleteSecret(secretId) {
    const now = DateTime.utc();
    const params = {
      TableName: dynamoDbTable,
      Key: { secretId },
      ConditionExpression: 'attribute_exists(secretId)',
      UpdateExpression: 'set #TTL = :TTL, readAtTime = :readAtTime',
      ExpressionAttributeNames: {
        '#TTL': 'TTL',
        '#readAtTime': 'readAtTime'
      },
      ExpressionAttributeValues: {
        ':TTL': Math.round(now.plus({ seconds: 60 }).toSeconds()),
        ':readAtTime': now.toISO()
      },
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await dynamoDbClient.update(params).promise();
      return result.Attributes;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  async deleteSecret(secretId) {
    const params = {
      TableName: dynamoDbTable,
      Key: {
        secretId
      }
    };

    try {
      await dynamoDbClient.delete(params).promise();
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        return;
      }
      logger.log({ title: 'deleteSecret error', level: 'ERROR', secretId, params, error });
      throw error;
    }
  }
}

module.exports = new SecretsManager();
