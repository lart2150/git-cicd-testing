import {join} from 'node:path';
import type {StackProps} from 'aws-cdk-lib';
import {Stack} from 'aws-cdk-lib';
import {S3Trigger} from 'aws-cdk-lib/aws-codepipeline-actions';
import {NotificationRule} from 'aws-cdk-lib/aws-codestarnotifications';
import {Runtime} from 'aws-cdk-lib/aws-lambda';
import {NodejsFunction, OutputFormat} from 'aws-cdk-lib/aws-lambda-nodejs';
import {Bucket} from 'aws-cdk-lib/aws-s3';
import {Topic} from 'aws-cdk-lib/aws-sns';
import {LambdaSubscription} from 'aws-cdk-lib/aws-sns-subscriptions';
import {CodePipeline, CodePipelineSource, ManualApprovalStep, ShellStep,} from 'aws-cdk-lib/pipelines';
import type {Construct} from 'constructs';
import {AppStage} from './app-stage.js';

export class CiCdStack extends Stack {
    public constructor(scope : Construct, id : string, props ?: StackProps) {
        super(scope, id, props);

        /**
         * @todo Install `bitbucket-code-pipeline-integration` and fill in the placeholder values here.
         * @see https://github.com/DASPRiD/bitbucket-code-pipeline-integration
         */
        const sourceBucket = Bucket.fromBucketName(
            this,
            'SourceBucket',
            '{{ source-bucket-name }}',
        );
        /**
         * @todo Fill in your repository values. By default, branch should be "main".
         */
        const sourceObjectKey = '{{ project-key }}/{{ repository-name }}/{{ branch }}.zip';

        const pipeline = new CodePipeline(this, 'Pipeline', {
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.s3(sourceBucket, sourceObjectKey, {trigger: S3Trigger.EVENTS}),
                commands: [
                    'npm ci',
                    'cd cdk',
                    'npm ci',
                    'npm run build',
                    'npx cdk synth',
                ],
                primaryOutputDirectory: 'cdk/cdk.out',
            }),
            dockerEnabledForSynth: true,
        });

        /**
         * @todo Create certificates for both UAT and prod in the region you want to deploy in.
         */
        pipeline.addStage(new AppStage(this, 'git-cicd-testing-uat', {
            env: {account: '{{ account-id }}', region: '{{ region }}'},
            certificateArn: '{{ uat-acm-certificate-arn }}',
            domainName: '{{ uat-domain-name }}',
            buildEnv: {
                VITE_APP_MY_VARIABLE: 'foo',
            },
        }));

        pipeline.addStage(new AppStage(this, 'git-cicd-testing-prod', {
            env: {account: '{{ account-id }}', region: '{{ region }}'},
            certificateArn: '{{ prod-acm-certificate-arn }}',
            domainName: '{{ prod-domain-name }}',
            buildEnv: {
                VITE_APP_MY_VARIABLE: 'bar',
            },
        }), {
            pre: [
                new ManualApprovalStep('PromoteToProd'),
            ],
        });

        pipeline.buildPipeline();

        const topic = new Topic(this, 'code-pipeline-api');
        new NotificationRule(this, 'NotificationRule', {
            source: pipeline.pipeline,
            events: [
                'codepipeline-pipeline-stage-execution-failed',
            ],
            targets: [topic],
        });

        const handler = new NodejsFunction(this, 'CodePipelineNotifications', {
            runtime: Runtime.NODEJS_18_X,
            handler: 'main',
            bundling: {
                minify: false,
                sourceMap: true,
                sourcesContent: false,
                target: 'es2022',
                format: OutputFormat.ESM,
                mainFields: ['module', 'main'],
            },
            environment: {
                /**
                 * @todo Create webhook in zoom
                 * type '/inc connect cicd' into a channel to get the webhook and signature
                 */
                WEBHOOK_ENDPOINT: '{{ zoom_webhook_endpoint }}',
                WEBHOOK_TOKEN: '{{ zoom_webhook_verification_token }}',
                NODE_OPTIONS: '--enable-source-maps',
            },
            depsLockFilePath: join(__dirname, '../package-lock.json'),
            entry: join(__dirname, '/webhook.ts'),
        });

        topic.addSubscription(new LambdaSubscription(handler));
    }
}
