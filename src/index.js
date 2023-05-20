require('error-object-polyfill');
const { cloneDeepWith } = require('lodash');

const logger = require('./logger');

process.env.AWS_NODEJS_CONNECTION_REUSE_ENABLED = 1;
require('http').globalAgent.keepAlive = true;
require('https').globalAgent.keepAlive = true;

try {
  const Api = require('openapi-factory');
  const aws = require('aws-sdk');
  // Override aws defaults, don't wait forever to connect when it isn't working.
  aws.config.update({ maxRetries: 5, httpOptions: { connectTimeout: 1000, timeout: 10000 } });

  const api = new Api({
    requestMiddleware(request, context) {
      context.callbackWaitsForEmptyEventLoop = true;
      const capturedInvocationId = logger.startInvocation({ version: context.functionVersion });

      setTimeout(() => {
        if (logger.invocationId === capturedInvocationId) {
          logger.log({ title: 'Logging the full request in case lambda decides to timeout, we can see what the request was about', level: 'INFO', request });
        }
      }, 55000);
      return request;
    },
    responseMiddleware(request, response) {
      const origin = request.headers.origin || request.headers.Origin || request.headers.Referer && new URL(request.headers.Referer).origin
        || request.headers.referer && new URL(request.headers.referer).origin || '*';

      response.headers = Object.assign({
        'Access-Control-Allow-Origin': origin,
        'x-request-id': logger.invocationId,
        'strict-transport-security': 'max-age=31556926; includeSubDomains;',
        'vary': 'Origin, Host, Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site',
        'Cache-Control': 'no-store'
      }, response.headers || {});

      const loggedResponse = response.statusCode >= 400 ? response : { statusCode: response.statusCode };
      logger.log({ title: 'RequestLogger', level: 'INFO', request, loggedResponse });
      const applyHostReWrite = value => {
        if (!value || typeof value !== 'string') {
          return undefined;
        }
        return value.replace(/SERVICE_HOST_REWRITE/ig, request.headers.host);
      };

      return response ? cloneDeepWith(response, applyHostReWrite) : null;
    },
    errorMiddleware(request, error) {
      const origin = request.headers.origin || request.headers.Origin || request.headers.Referer && new URL(request.headers.Referer).origin
        || request.headers.referer && new URL(request.headers.referer).origin || '*';

      if (error.code === 'InvalidInputRequest') {
        const response = {
          statusCode: 400,
          headers: { 'x-request-id': logger.invocationId },
          body: { errorCode: 'InvalidRequest', errorId: request.requestContext.requestId, title: error.message.title }
        };
        logger.log({ title: 'RequestLogger', level: 'INFO', source: 'InvalidInputRequest', request, response });
        return response;
      }

      logger.log({ title: 'RequestLogger', level: 'ERROR', request, error });
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'x-request-id': logger.invocationId,
          'strict-transport-security': 'max-age=31556926; includeSubDomains;'
        },
        body: { title: 'Unexpected error', errorId: request.requestContext.requestId }
      };
    }
  });
  module.exports = api;

  const secretsController = require('./secretsController');
  api.post('/secrets', request => secretsController.createSecret(request));
  api.get('/secrets/{secretId}', request => secretsController.getSecret(request));
  api.delete('/secrets/{Id}', request => secretsController.deleteSecret(request));

  api.options('/{proxy+}', () => {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Powered-By,If-Unmodified-Since,Origin,Referer,Accept,Accept-Language,Accept-Encoding,User-Agent,Content-Length,Cache-Control,Pragma,Sec-Fetch-Dest,Sec-Fetch-Mode,Sec-Fetch-Site,sec-gpc',
        'Access-Control-Allow-Methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
        'Cache-Control': 'public, max-age=3600'
      }
    };
  });

  api.any('/{proxy+}', request => {
    logger.log({ title: '404 Path Not Found', level: 'WARN', request: request });
    return { statusCode: 404 };
  });
} catch (error) {
  logger.log({ title: 'LoaderLogger - failed to load service', level: 'CRITICAL', error });
  throw error;
}
