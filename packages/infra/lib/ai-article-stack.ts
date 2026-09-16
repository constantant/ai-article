import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Fn,
} from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  DockerImageCode,
  DockerImageFunction,
  FunctionUrlAuthType,
} from 'aws-cdk-lib/aws-lambda';
import {
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyDocument,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

/**
 * This account's GitHub OIDC tokens embed numeric GitHub user/repo IDs in the
 * `sub` claim — NOT the plain `repo:owner/name` format GitHub's own docs
 * show as the default. Confirmed via CloudTrail on a real (denied)
 * AssumeRoleWithWebIdentity call: the actual claim was
 * `repo:constantant@5537730/ai-article@1371326609:ref:refs/heads/main`.
 * `5537730` = constantant's GitHub user ID, `1371326609` = this repo's ID —
 * both stable, but not derivable at synth time without a GitHub API call, so
 * hardcoded here rather than composed from separate owner/name constants.
 */
const GITHUB_OIDC_SUB =
  'repo:constantant@5537730/ai-article@1371326609:ref:refs/heads/main';
/** Already provisioned in this account by a prior project — reused, not recreated. */
const GITHUB_OIDC_PROVIDER_ARN = (account: string) =>
  `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;

/**
 * The Docker image asset's source directory is the repo root, which also
 * contains this app's own `cdk.out` (packages/infra/cdk.out) — without
 * excluding it, CDK's asset-staging copy recurses into its own output
 * directory infinitely. node_modules/.git/dist are excluded too: the
 * Dockerfiles run their own `npm ci` and build from source, so staging
 * these in first is pure waste, not a correctness requirement.
 */
const IMAGE_ASSET_EXCLUDES = [
  '**/cdk.out',
  '**/node_modules',
  '**/.git',
  '**/dist',
];

export class AiArticleStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- Storage ---
    // Demo/test system: DESTROY so `cdk destroy` leaves nothing orphaned
    // (accepted data-loss tradeoff — see README).
    const appsTable = new Table(this, 'AppsTable', {
      tableName: 'ai-article-apps',
      partitionKey: { name: 'appId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const articlesTable = new Table(this, 'ArticlesTable', {
      tableName: 'ai-article-articles',
      partitionKey: { name: 'appId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // User accounts + their linked per-app API keys (see
    // DynamoUserRepository) — single table, PK userId, SK distinguishes a
    // profile item, an APPKEY# item, or (for global email-uniqueness) an
    // EMAIL#<email> pointer item, same single-table-multi-item-shape pattern
    // as ArticlesTable.
    const usersTable = new Table(this, 'UsersTable', {
      tableName: 'ai-article-users',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Registered OAuth clients (Dynamic Client Registration — mobile Claude
    // self-registers on first connect) for the mcp-server's own OAuth
    // authorization server. Unlike auth codes/tokens (stateless JWTs, see
    // AiArticleOAuthProvider), these need indefinite persistence.
    const oauthClientsTable = new Table(this, 'OAuthClientsTable', {
      tableName: 'ai-article-mcp-oauth-clients',
      partitionKey: { name: 'clientId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Single-use replay protection for authorization-code JWTs — the one
    // piece of real state the stateless-JWT OAuth design still needs (see
    // UsedCodeGuard). TTL'd on `expiresAt` so entries expire on their own
    // shortly after the code itself would have.
    const oauthUsedCodesTable = new Table(this, 'OAuthUsedCodesTable', {
      tableName: 'ai-article-mcp-oauth-used-codes',
      partitionKey: { name: 'jti', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    // --- Secrets ---
    const adminApiKey = new Secret(this, 'AdminApiKey', {
      secretName: 'ai-article/admin-api-key',
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
    });

    // Shared between rest-api and mcp-server: gates the service-to-service
    // per-user endpoints (verify-credentials, per-user app-keys) that only
    // mcp-server's own OAuth login flow should ever call.
    const mcpServiceKey = new Secret(this, 'McpServiceKey', {
      secretName: 'ai-article/mcp-service-key',
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
    });

    // Symmetric signing key for mcp-server's stateless auth-code/access/
    // refresh JWTs (see JwtIssuer).
    const mcpJwtSigningKey = new Secret(this, 'McpJwtSigningKey', {
      secretName: 'ai-article/mcp-jwt-signing-key',
      generateSecretString: { excludePunctuation: true, passwordLength: 48 },
    });

    // --- rest-api ---
    const restApiFunction = new DockerImageFunction(this, 'RestApiFunction', {
      functionName: 'ai-article-rest-api',
      code: DockerImageCode.fromImageAsset('../..', {
        file: 'packages/rest-api/Dockerfile',
        exclude: IMAGE_ASSET_EXCLUDES,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        STORAGE_DRIVER: 'dynamodb',
        DYNAMODB_APPS_TABLE: appsTable.tableName,
        DYNAMODB_ARTICLES_TABLE: articlesTable.tableName,
        DYNAMODB_USERS_TABLE: usersTable.tableName,
        // .secretValue (not .unsafeUnwrap()) resolves to a CloudFormation
        // dynamic reference — the plaintext value never appears in the
        // template or this stack's synth output.
        ADMIN_API_KEY: adminApiKey.secretValue.toString(),
        MCP_SERVICE_KEY: mcpServiceKey.secretValue.toString(),
      },
    });
    appsTable.grantReadWriteData(restApiFunction);
    articlesTable.grantReadWriteData(restApiFunction);
    usersTable.grantReadWriteData(restApiFunction);

    // App-layer auth (ApiKeyGuard/AdminGuard) already gates writes — same
    // trust boundary as running it locally.
    const restApiUrl = restApiFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    // --- webapp ---
    const webappFunction = new DockerImageFunction(this, 'WebappFunction', {
      functionName: 'ai-article-webapp',
      code: DockerImageCode.fromImageAsset('../..', {
        file: 'packages/webapp/Dockerfile',
        exclude: IMAGE_ASSET_EXCLUDES,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        API_BASE_URL: Fn.join('', [restApiUrl.url, 'api']),
      },
    });
    const webappUrl = webappFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });
    // Referencing webappUrl.url here (to extract the real hostname) would
    // create a genuine CloudFormation circular dependency: the function's
    // own environment would depend on its FunctionUrl, which depends back on
    // the function. Lambda Function URL hostnames are always
    // `<url-id>.lambda-url.<region>.on.aws`, so a wildcard on that fixed
    // domain (a pattern the SSR engine's host check explicitly supports)
    // gets the same restriction without the self-reference.
    webappFunction.addEnvironment(
      'ALLOWED_HOSTS',
      `*.lambda-url.${this.region}.on.aws`,
    );

    // --- mcp-server (remote MCP connector, HTTP + OAuth) ---
    const mcpServerFunction = new DockerImageFunction(this, 'McpServerFunction', {
      functionName: 'ai-article-mcp-server',
      code: DockerImageCode.fromImageAsset('../..', {
        file: 'packages/mcp-server/Dockerfile',
        exclude: IMAGE_ASSET_EXCLUDES,
      }),
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        REST_API_BASE_URL: Fn.join('', [restApiUrl.url, 'api']),
        MCP_SERVICE_KEY: mcpServiceKey.secretValue.toString(),
        MCP_JWT_SIGNING_KEY: mcpJwtSigningKey.secretValue.toString(),
        STORAGE_DRIVER: 'dynamodb',
        DYNAMODB_OAUTH_CLIENTS_TABLE: oauthClientsTable.tableName,
        DYNAMODB_OAUTH_USED_CODES_TABLE: oauthUsedCodesTable.tableName,
        // Deliberately no issuer-URL env var — this server's own Function
        // URL isn't knowable here without a circular dependency (this
        // function's environment would depend on its own FunctionUrl
        // resource, which depends back on the function — the same shape of
        // cycle webappFunction's ALLOWED_HOSTS wildcard works around below,
        // except a wildcard can't stand in for an OAuth issuer, which must
        // be one exact origin). mcp-server derives it per-request from the
        // Host header instead (see http-main.ts).
      },
    });
    oauthClientsTable.grantReadWriteData(mcpServerFunction);
    oauthUsedCodesTable.grantReadWriteData(mcpServerFunction);

    // OAuth (Dynamic Client Registration + bearer-token verification) does
    // the real gating here — same trust boundary as the other two functions'
    // app-layer auth.
    const mcpServerUrl = mcpServerFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    });

    new CfnOutput(this, 'RestApiUrl', { value: restApiUrl.url });
    new CfnOutput(this, 'WebappUrl', { value: webappUrl.url });
    new CfnOutput(this, 'McpServerUrl', { value: mcpServerUrl.url });

    // --- GitHub Actions deploy role (OIDC, no long-lived keys) ---
    // Reuses the OIDC provider already registered in this account (from the
    // indian-game project) — does not create a new one.
    const githubOidcProvider =
      OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'GithubOidcProvider',
        GITHUB_OIDC_PROVIDER_ARN(this.account),
      );

    new Role(this, 'GithubCdkDeployRole', {
      roleName: 'ai-article-github-cdk-deploy',
      assumedBy: new OpenIdConnectPrincipal(githubOidcProvider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': GITHUB_OIDC_SUB,
        },
      }),
      // `cdk deploy` (including its Docker asset build/push) only ever needs
      // to assume the account's existing CDK bootstrap roles — it never
      // calls AWS APIs directly with this role's own permissions.
      inlinePolicies: {
        'assume-cdk-bootstrap-roles': new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: [
                `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
                `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
                `arn:aws:iam::${this.account}:role/cdk-hnb659fds-image-publishing-role-${this.account}-${this.region}`,
                `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
              ],
            }),
          ],
        }),
      },
    });
  }
}
