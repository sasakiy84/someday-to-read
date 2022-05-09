import {
  App,
  AwsLambdaReceiver,
  BlockAction,
  ButtonAction,
  ViewSubmitAction,
} from "@slack/bolt";
import { randomUUID } from "crypto";

import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
} from "@aws-sdk/client-dynamodb";
import { pickOne } from "./utils/shuffle";
import { buildMessageText } from "utils/message";

const TODO_TABLE = process.env.TODO_TABLE;
const RANDOM_TABLE = process.env.RANDOM_TABLE;

const messageSave = process.env.MESSAGE_SAVE?.split(",") || ["保存した"];
const messagePick = process.env.MESSAGE_PICK?.split(",") || ["これがおすすめ"];
const messageDone = process.env.MESSAGE_DONE?.split(",") || ["削除した"];
const messageNotFound = process.env.MESSAGE_NOT_FOUND?.split(",") || [
  "見つからなかった",
];
const messageFail = process.env.MESSAGE_FAIL?.split(",") || [
  "想定外の事態で作業が完了できなかった",
];

if (!TODO_TABLE || !RANDOM_TABLE)
  throw new Error("TODO_TABLE and RANDOM_TABLE required");

const dynamoDbClient = process.env.IS_OFFLINE
  ? new DynamoDBClient({
      apiVersion: "2012-08-10",
      region: "localhost",
      endpoint: "http://localhost:8000",
    })
  : new DynamoDBClient({
      apiVersion: "2012-08-10",
    });

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || "",
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
});

app.command("/st-save", async ({ payload, ack, body, client, logger }) => {
  await ack();

  const tags = ["book", "web"];

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "save",
        private_metadata: payload.channel_id,
        title: {
          type: "plain_text",
          text: "save todo",
        },
        blocks: [
          {
            type: "input",
            block_id: "title",
            label: {
              type: "plain_text",
              text: "title",
            },
            element: {
              type: "plain_text_input",
              action_id: "title_input",
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "select tag",
            },
            block_id: "tag",
            accessory: {
              type: "static_select",
              options: tags.map((tag) => {
                return {
                  text: {
                    type: "plain_text",
                    text: tag,
                  },
                  value: tag,
                };
              }),
              initial_option: {
                text: {
                  type: "plain_text",
                  text: tags[0],
                },
                value: tags[0],
              },
              action_id: "tag_input",
            },
          },
          {
            type: "input",
            block_id: "memo",
            label: {
              type: "plain_text",
              text: "memo",
            },
            element: {
              type: "plain_text_input",
              action_id: "memo_input",
              multiline: true,
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
      },
    });
  } catch (error) {
    logger.error(error);
  }
});

app.view<ViewSubmitAction>("save", async ({ ack, view, client, logger }) => {
  await ack();

  const uuid = randomUUID();

  const { title, tag, memo } = view.state.values;
  const title_input = title.title_input.value || "";
  const tag_input = tag.tag_input.selected_option?.value || "";
  const memo_input = memo.memo_input.value || "";

  const updateRequest: TransactWriteItemsCommandInput = {
    TransactItems: [
      {
        Put: {
          TableName: TODO_TABLE,
          Item: {
            id: {
              S: uuid,
            },
            title: {
              S: title_input,
            },
            tag: {
              S: tag_input,
            },
            memo: {
              S: memo_input,
            },
          },
        },
      },
      {
        Update: {
          TableName: RANDOM_TABLE,
          Key: {
            tag: {
              S: tag_input,
            },
          },
          UpdateExpression: "ADD ids :id",
          ExpressionAttributeValues: {
            ":id": {
              SS: [uuid],
            },
          },
        },
      },
    ],
  };

  const result = await dynamoDbClient.send(
    new TransactWriteItemsCommand(updateRequest)
  );

  if (result.$metadata.httpStatusCode !== 200) {
    try {
      await client.chat.postMessage({
        channel: view.private_metadata,
        text: pickOne(messageFail),
      });
    } catch (e) {
      logger.error(e);
    }
  }

  const lineDone = pickOne(messageSave);
  const messageText = buildMessageText(
    lineDone,
    title_input,
    tag_input,
    memo_input
  );

  try {
    const message = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: messageText,
          },
        },
      ],
      text: messageText,
    };
    await client.chat.postMessage({
      channel: view.private_metadata,
      ...message,
    });
  } catch (e) {
    logger.error(e);
  }
});

app.command("/st-pick", async ({ ack, body, say }) => {
  await ack();

  const getIdsByTagRequest: GetItemCommandInput = {
    TableName: RANDOM_TABLE,
    Key: {
      tag: {
        S: body.text,
      },
    },
  };

  const { Item: tagItem, $metadata: tagMetadata } = await dynamoDbClient.send(
    new GetItemCommand(getIdsByTagRequest)
  );
  if (tagMetadata.httpStatusCode !== 200)
    throw new Error(`db returns statusCode: ${tagMetadata.httpStatusCode}`);

  const ids = tagItem?.ids.SS;
  if (!ids) {
    await say(`${pickOne(messageNotFound)}\n> tag: ${body.text}`);
    return;
  }

  if (ids.length === 0) {
    await say(`${pickOne(messageNotFound)}\n> tag: ${body.text}`);
    return;
  }

  const targetId = pickOne(ids);

  const getTodoItemRequestById: GetItemCommandInput = {
    TableName: TODO_TABLE,
    Key: {
      id: {
        S: targetId,
      },
      tag: {
        S: body.text,
      },
    },
  };
  const { Item: todoItem, $metadata: todoMetadata } = await dynamoDbClient.send(
    new GetItemCommand(getTodoItemRequestById)
  );
  if (todoMetadata.httpStatusCode !== 200)
    throw new Error(`db returns statusCode: ${todoMetadata.httpStatusCode}`);

  if (!todoItem) {
    await say(`${pickOne(messageFail)}\n> tag: ${body.text} is not existed`);
    return;
  }

  const title = todoItem.title.S;
  const tag = todoItem.tag.S;
  const memo = todoItem.memo.S;

  const lineDone = pickOne(messagePick);
  const messageText = buildMessageText(lineDone, title, tag, memo);

  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: messageText,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Done!",
          },
          action_id: "done",
          value: `${targetId},${title},${tag},${memo}`,
        },
      },
    ],
    mrkdwn: true,
    text: messageText,
  });
});

app.action<BlockAction<ButtonAction>>("done", async ({ ack, say, payload }) => {
  await ack();

  const [targetId, title, tag, memo] = payload.value.split(",");

  const updateRequest: TransactWriteItemsCommandInput = {
    TransactItems: [
      {
        Update: {
          TableName: TODO_TABLE,
          Key: {
            id: {
              S: targetId,
            },
            tag: {
              S: tag,
            },
          },
          UpdateExpression: "SET isDone = :bool",
          ExpressionAttributeValues: {
            ":bool": {
              BOOL: true,
            },
          },
        },
      },
      {
        Update: {
          TableName: RANDOM_TABLE,
          Key: {
            tag: {
              S: tag,
            },
          },
          UpdateExpression: "DELETE ids :id",
          ExpressionAttributeValues: {
            ":id": {
              SS: [targetId],
            },
          },
        },
      },
      {
        Update: {
          TableName: RANDOM_TABLE,
          Key: {
            tag: {
              S: `${tag}_done`,
            },
          },
          UpdateExpression: "ADD ids :id",
          ExpressionAttributeValues: {
            ":id": {
              SS: [targetId],
            },
          },
        },
      },
    ],
  };

  const result = await dynamoDbClient.send(
    new TransactWriteItemsCommand(updateRequest)
  );

  const lineDone = pickOne(messageDone);
  await say(buildMessageText(lineDone, title, tag, memo));
});

module.exports.handler = async (event: any, context: any, callback: any) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
