#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import {CiCdStack} from '../lib/cicd-stack';

const app = new cdk.App();

/**
 * @todo Choose account ID. The region is just for the CICD stack and should be left as is.
 */
new CiCdStack(app, 'git-cicd-testing-cicd', {
    env: {account: '{{ account-id }}', region: 'us-east-1'},
});
