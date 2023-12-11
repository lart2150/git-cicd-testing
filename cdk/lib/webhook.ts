import type {CodePipelineCloudWatchStageEvent, SNSEvent} from "aws-lambda";

type CodePipelineNotification = CodePipelineCloudWatchStageEvent & {
    "additionalAttributes" : {
        "additionalInformation" ?: string,
        failedActions : [{
            action : string;
            additionalInformation : string;
        }] | undefined
    },
    "detail" : {
        "action" : string | undefined,
        "execution-id" : string,
        "execution-result" : {
            "error-code" : string,
            "external-execution-id" : string,
            "external-execution-summary" : string,
            "external-execution-url" : string,
        } | undefined,
        "pipeline-execution-attempt" : string,
        "region" : string | undefined,
        "type" : {
            "category" : string,
            "owner" : string,
            "provider" : string,
            "version" : string,
        } | undefined,
    },
    "detailType" : string,
    "notificationRuleArn" : string,
};

declare global {
    // Missing native fetch type https://github.com/DefinitelyTyped/DefinitelyTyped/issues/60924
    function fetch(...args : any[]) : Promise<any>;
}

const hasSourceAndDetail = (event : unknown) : event is {source : unknown; detail : unknown} => {
    return (
        typeof event === 'object'
        && event !== null
        && 'source' in event
        && 'detail' in event
    );
};

const codeNotification = (event : unknown) : event is CodePipelineNotification => {
    if (hasSourceAndDetail(event)) {
        return (
            event.source === 'aws.codepipeline'
            && typeof event.detail === 'object'
        );
    }

    return false;
};

export const main = async (event : SNSEvent) : Promise<void> => {
    if (!process.env.WEBHOOK_URL) {
        throw new Error(`Missing webhook url ${process.env.WEBHOOK_URL}`);
    }

    console.log('event.Records', event.Records[0]);

    try {
        for (const message of event.Records) {
            const record = JSON.parse(message.Sns.Message);

            if (codeNotification(record)) {
                let message = `${record.detail.stage} ${record.detail.state}`;
                const executionResult = record.detail['execution-result'];

                if (executionResult) {
                    message += executionResult['external-execution-summary']
                        ? `\n${executionResult['external-execution-summary']}`
                        : '';
                }

                if (record.additionalAttributes.failedActions?.length) {
                    const firstFailedAction = record.additionalAttributes.failedActions[0];

                    if (firstFailedAction.action === 'PromoteToProd') {
                        console.log('skipping event PromoteToProd', firstFailedAction);
                        return;
                    }

                    message += firstFailedAction.additionalInformation
                        ? `\n${firstFailedAction.additionalInformation}`
                        : '';
                }

                await fetch(
                    `${process.env.WEBHOOK_ENDPOINT}?format=full`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': process.env.WEBHOOK_TOKEN,
                        },
                        body: JSON.stringify({
                            'head': {
                                'text': record.detail.pipeline,
                                'style': {
                                    'bold': true,
                                },
                            },
                            'body': [
                                {
                                    'type': 'message',
                                    'text': record.detailType,
                                    'style': {
                                        'bold': true,
                                    },
                                },
                                {
                                    'type': 'message',
                                    'text': message,
                                },
                            ],
                        }),
                    }
                );
            } else {
                console.error('not codeNotification', record);
            }
        }
    } catch (e) {
        console.error('error', e);
    }
};
