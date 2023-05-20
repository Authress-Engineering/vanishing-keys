module.exports = {
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Authress Vanish',
  Parameters: {
    serviceName: {
      Type: 'String',
      Default: 'VanishingKeys',
      Description: 'The name of the microservice'
    },
    serviceDescription: {
      Type: 'String',
      Default: 'The Vanish service',
      Description: 'Service description used for AWS resources'
    },
    dnsName: {
      Type: 'String',
      Default: '',
      Description: 'The service DNS name.'
    },
    hostedName: {
      Type: 'String',
      Description: 'The top level domain name.'
    },
    hostedZoneId: {
      Type: 'AWS::Route53::HostedZone::Id',
      Description: 'The already deployed hosted zone where to register this DNS'
    }
  },
  
  Resources: {
    LambdaFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: { Ref: 'serviceName' },
        Description: { Ref: 'serviceDescription' },
        Handler: 'index.handler',
        Runtime: 'nodejs16.x',
        TracingConfig: {
          Mode: 'PassThrough'
        },
        Code: {
          ZipFile: 'exports.handler = async() => Promise.resolve()'
        },
        MemorySize: 128,
        Timeout: 10,
        // ReservedConcurrentExecutions: 5,
        Role: { 'Fn::GetAtt': ['LambdaRole', 'Arn'] },
        Tags: [{ Key: 'Service', Value: { Ref: 'serviceName' } }]
      }
    },

    CloudWatchLambdaLogGroup: {
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: { 'Fn::Sub': '/aws/lambda/${serviceName}' },
        RetentionInDays: 365
      }
    },

    LambdaFunctionVersion: {
      Type: 'AWS::Lambda::Version',
      Properties: {
        FunctionName: { Ref: 'LambdaFunction' },
        Description: 'Initial Production Deployed Version'
      }
    },
    ProductionAlias: {
      Type: 'AWS::Lambda::Alias',
      Properties: {
        Description: 'The production alias',
        FunctionName: { 'Fn::GetAtt': ['LambdaFunction', 'Arn'] },
        FunctionVersion: { 'Fn::GetAtt': ['LambdaFunctionVersion', 'Version'] },
        Name: 'production'
      }
    },

    LambdaRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        RoleName: { 'Fn::Sub': '${serviceName}LambdaRole-${AWS::Region}' },
        Path: '/',
        MaxSessionDuration: 43200,
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: ['lambda.amazonaws.com']
              },
              Action: ['sts:AssumeRole']
            }
          ]
        },
        ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          'arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess'
        ],
        Policies: [
          {
            PolicyName: 'MicroservicePolicy',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'DynamoDbWrite',
                  Effect: 'Allow',
                  Action: 'dynamodb:*',
                  Resource: { 'Fn::Sub': 'arn:aws:dynamodb:*:*:table/${serviceName}-*' }
                },
                {
                  Sid: 'DynamoDbWritePreventDelete',
                  Effect: 'Deny',
                  Action: [
                    'dynamodb:DeleteBackup',
                    'dynamodb:DeleteTable'
                  ],
                  Resource: '*'
                }
              ]
            }
          }
        ]
      }
    },

    ApiGatewayV2: {
      Type: 'AWS::ApiGatewayV2::Api',
      Properties: {
        FailOnWarnings: false,
        Body: {
          'openapi': '3.0.1',
          'info': {
            version: '1.0.0',
            title: { Ref: 'serviceName' },
            description: { Ref: 'serviceDescription' }
          },
          'servers': [{
            'url': '/',
            'x-amazon-apigateway-endpoint-configuration': { disableExecuteApiEndpoint: true }
          }],
          'paths': {
            '/{proxy+}': {
              options: {
                'responses': {
                  default: {
                    description: 'Default response for OPTIONS /{proxy+}'
                  }
                },
                'parameters': [{
                  name: 'proxy',
                  in: 'path',
                  required: true,
                  type: 'string'
                }],
                'x-amazon-apigateway-integration': {
                  payloadFormatVersion: '1.0',
                  type: 'aws_proxy',
                  httpMethod: 'POST',
                  uri: { 'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${LambdaFunction.Arn}:${!stageVariables.lambdaVersion}/invocations' },
                  connectionType: 'INTERNET'
                }
              }
            },
            '/$default': {
              'x-amazon-apigateway-any-method': {
                'isDefaultRoute': true,
                // 'security': [{ self: [] }],
                'x-amazon-apigateway-integration': {
                  payloadFormatVersion: '1.0',
                  type: 'aws_proxy',
                  httpMethod: 'POST',
                  uri: { 'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${LambdaFunction.Arn}:${!stageVariables.lambdaVersion}/invocations' },
                  passthroughBehavior: 'when_no_match'
                }
              }
            }
          },
          // 'components': {
          //   securitySchemes: {
          //     self: {
          //       'type': 'apiKey',
          //       'name': 'Unused',
          //       'in': 'header',
          //       'x-amazon-apigateway-authorizer': {
          //         identitySource: '$request.header.Authorization,$context.domainPrefix',
          //         authorizerUri: { 'Fn::Sub': 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ProductionAlias}/invocations' },
          //         authorizerPayloadFormatVersion: '2.0',
          //         authorizerResultTtlInSeconds: 3600,
          //         type: 'request',
          //         enableSimpleResponses: false
          //       }
          //     }
          //   }
          // },
          'x-amazon-apigateway-cors': {
            allowMethods: ['*'],
            allowHeaders: ['content-type', 'content-length', 'cache-control', 'x-amz-date', 'authorization', 'x-api-key', 'x-powered-by', 'if-unmodified-since', 'origin', 'referer', 'accept', 'accept-language', 'accept-encoding', 'user-agent', 'pragma', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-gpc'],
            maxAge: 3600,
            allowCredentials: false,
            allowOrigins: ['*']
          }
        }
      }
    },

    LambdaInvokePermission: {
      Type: 'AWS::Lambda::Permission',
      Properties: {
        FunctionName: { Ref: 'ProductionAlias' },
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: { 'Fn::Sub': 'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ApiGatewayV2}/*' }
      }
    },

    ApiGatewayInitialDeployment: {
      Type: 'AWS::ApiGatewayV2::Deployment',
      Properties: {
        Description: 'Initial Setup Deployment (WARNING: This resource must stay constant, do not update in CF ever)',
        ApiId: { Ref: 'ApiGatewayV2' }
      }
    },
    ApiGatewayStage: {
      Type: 'AWS::ApiGatewayV2::Stage',
      Properties: {
        ApiId: { Ref: 'ApiGatewayV2' },
        AutoDeploy: true,
        StageName: 'production',
        DeploymentId: { Ref: 'ApiGatewayInitialDeployment' },
        StageVariables: {
          lambdaVersion: 'production'
        }
      }
    },
    AcmCertificate: {
      Type: 'AWS::CertificateManager::Certificate',
      Properties: {
        DomainName: { 'Fn::Sub': '${dnsName}.${hostedName}' },
        ValidationMethod: 'DNS',
        DomainValidationOptions: [{
          DomainName: { 'Fn::Sub': '${dnsName}.${hostedName}' },
          HostedZoneId: { Ref: 'hostedZoneId' }
        }]
      }
    },

    ServiceDomainName: {
      Type: 'AWS::ApiGatewayV2::DomainName',
      Properties: {
        DomainName: { 'Fn::Sub': '${dnsName}.${hostedName}' },
        DomainNameConfigurations: [{
          CertificateArn: { Ref: 'AcmCertificate' },
          EndpointType: 'REGIONAL',
          SecurityPolicy: 'TLS_1_2'
        }]
      }
    },
    BasePathMapping: {
      Type: 'AWS::ApiGatewayV2::ApiMapping',
      Properties: {
        DomainName: { Ref: 'ServiceDomainName' },
        ApiId: { Ref: 'ApiGatewayV2' },
        Stage: { Ref: 'ApiGatewayStage' }
      }
    },

    Route53MapToCustomDomain: {
      Type: 'AWS::Route53::RecordSet',
      Properties: {
        AliasTarget: {
          DNSName: { 'Fn::GetAtt': ['ServiceDomainName', 'RegionalDomainName'] },
          HostedZoneId: { 'Fn::GetAtt': ['ServiceDomainName', 'RegionalHostedZoneId'] }
        },
        HostedZoneId: { Ref: 'hostedZoneId' },
        Comment: { 'Fn::Sub': 'Created for service ${serviceName}' },
        Name: { 'Fn::Sub': '${dnsName}.${hostedName}.' },
        Type: 'A'
      }
    },

    DynamoDBSecretsTable: {
      Type: 'AWS::DynamoDB::GlobalTable',
      Properties: {
        TableName: { 'Fn::Sub': '${serviceName}-secrets-prod' },
        AttributeDefinitions: [
          {
            AttributeName: 'secretsId',
            AttributeType: 'S'
          }
        ],
        KeySchema: [
          {
            AttributeName: 'secretsId',
            KeyType: 'HASH'
          }
        ],
        BillingMode: 'PROVISIONED',
        WriteProvisionedThroughputSettings: {
          WriteCapacityAutoScalingSettings: {
            MaxCapacity: 1,
            MinCapacity: 1,
            SeedCapacity: 1,
            TargetTrackingScalingPolicyConfiguration: {
              TargetValue: 1
            }
          }
        },
        SSESpecification: {
          SSEEnabled: false
        },
        StreamSpecification: {
          StreamViewType: 'NEW_AND_OLD_IMAGES'
        },
        TimeToLiveSpecification: {
          AttributeName: 'TTL',
          Enabled: true
        },
        Replicas: [{
          Region: { Ref: 'AWS::Region' },
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true
          },
          ReadProvisionedThroughputSettings: {
            ReadCapacityUnits: 1
          },
          Tags: [
            { Key: 'Service', Value: { Ref: 'serviceName' } }
          ]
        }]
        // [{
        //   Region: { 'Fn::FindInMap': ['regionKeyMap', { Ref: 'AWS::Region' }, 'mirrorRegion'] },
        //   Tags: [
        //     { Key: 'Service', Value: { Ref: 'serviceName' } }
        //   ]
        // }]
      }
    }
  }
};
      
