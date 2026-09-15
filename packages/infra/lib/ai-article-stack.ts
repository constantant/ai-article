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

    // --- Secrets ---
    const adminApiKey = new Secret(this, 'AdminApiKey', {
      secretName: 'ai-article/admin-api-key',
      generateSecretString: { excludePunctuation: true, passwordLength: 32 },
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
        // .secretValue (not .unsafeUnwrap()) resolves to a CloudFormation
        // dynamic reference — the plaintext value never appears in the
        // template or this stack's synth output.
        ADMIN_API_KEY: adminApiKey.secretValue.toString(),
      },
    });
    appsTable.grantReadWriteData(restApiFunction);
    articlesTable.grantReadWriteData(restApiFunction);

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

    new CfnOutput(this, 'RestApiUrl', { value: restApiUrl.url });
    new CfnOutput(this, 'WebappUrl', { value: webappUrl.url });

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
