import {execSync} from 'child_process';
import * as path from 'path';
import type {StackProps} from 'aws-cdk-lib';
import {AssetHashType, CfnOutput, DockerImage, RemovalPolicy, Stack} from 'aws-cdk-lib';
import {Certificate} from 'aws-cdk-lib/aws-certificatemanager';
import {Distribution, OriginAccessIdentity, ViewerProtocolPolicy} from 'aws-cdk-lib/aws-cloudfront';
import {S3Origin} from 'aws-cdk-lib/aws-cloudfront-origins';
import {RetentionDays} from 'aws-cdk-lib/aws-logs';
import {BlockPublicAccess, Bucket} from 'aws-cdk-lib/aws-s3';
import {BucketDeployment, CacheControl, Source} from 'aws-cdk-lib/aws-s3-deployment';
import type {Construct} from 'constructs';
import {copySync} from 'fs-extra';

export type BuildEnv = {
    /* eslint-disable @typescript-eslint/naming-convention */
    VITE_APP_MY_VARIABLE : string;
    /* eslint-enable @typescript-eslint/naming-convention */
};

type ServiceStackProps = StackProps & {
    certificateArn : string;
    domainName : string;
    buildEnv : BuildEnv;
};

export class CloudfrontStack extends Stack {
    public constructor(scope : Construct, id : string, props : ServiceStackProps) {
        super(scope, id, props);

        const websiteBucket = new Bucket(this, 'WebsiteBucket', {
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const originAccessIdentity = new OriginAccessIdentity(this, 'OriginAccessIdentity');
        websiteBucket.grantRead(originAccessIdentity);

        const certificate = Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn);

        const distribution = new Distribution(this, 'Distribution', {
            certificate,
            domainNames: [props.domainName],
            defaultBehavior: {
                origin: new S3Origin(websiteBucket, {originAccessIdentity}),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
            ],
        });

        new CfnOutput(this, 'DistributionDomainName', {value: distribution.domainName});

        const source = Source.asset(path.join(__dirname, '../../'), {
            exclude: ['cdk'],
            bundling: {
                image: DockerImage.fromRegistry('public.ecr.aws/h1a5s9h8/alpine:latest'),
                command: ['sh', '-c', 'echo "Docker build not supported." && exit 1'],
                local: {
                    tryBundle: (outputDir : string) : boolean => {
                        execSync('npm run build', {
                            stdio: ['ignore', process.stderr, process.stdout],
                            cwd: path.join(__dirname, '../..'),
                            env: {
                                ...process.env,
                                ...props.buildEnv,
                            },
                        });

                        copySync(path.join(__dirname, '../../dist'), outputDir);

                        return true;
                    },
                },
                environment: props.buildEnv,
            },
            assetHashType: AssetHashType.OUTPUT,
        });

        const mutableFiles = [
            'index.html',
        ];

        new BucketDeployment(this, 'BucketDeployment', {
            destinationBucket: websiteBucket,
            distribution,
            logRetention: RetentionDays.ONE_DAY,
            prune: false,
            exclude: mutableFiles,
            cacheControl: [CacheControl.fromString('max-age=31536000,public,immutable')],
            sources: [source],
        });

        new BucketDeployment(this, 'HtmlBucketDeployment', {
            destinationBucket: websiteBucket,
            distribution,
            logRetention: RetentionDays.ONE_DAY,
            prune: false,
            exclude: ['*'],
            include: mutableFiles,
            cacheControl: [CacheControl.fromString('max-age=0,no-cache,no-store,must-revalidate')],
            sources: [source],
        });
    }
}
