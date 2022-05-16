import {
  App,
  AwsLambdaReceiver,
  BlockAction,
  ButtonAction,
  ViewSubmitAction,
} from "@slack/bolt";
import {
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
} from "@aws-sdk/client-dynamodb";
import { pickOne } from "./utils/shuffle";
import { buildCreateTodoModalBlock, buildMessageText } from "./utils/message";
import {
  buildCreateTodoQuery,
  buildDoneTodoQuery,
  pickTodoItemByTag,
  transactionDbSender,
} from "./utils/query";
import { getCustomMessages, getSlackCredentials } from "./utils/constant";

const { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET } = getSlackCredentials();

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: SLACK_SIGNING_SECRET,
});

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
});

app.command("/st-save", async ({ payload, ack, body, client, logger }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "save",
        private_metadata: payload.channel_id,
        title: {
          type: "plain_text",
          text: "save todo",
        },
        blocks: buildCreateTodoModalBlock(),
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

  const { messageFail, messageSave } = getCustomMessages();

  const { title, tag, memo } = view.state.values;
  const titleInput = title.title_input.value || "";
  const tagInput = tag.tag_input.selected_option?.value || "";
  const memoInput = memo.memo_input.value || "";

  const updateRequest = buildCreateTodoQuery(titleInput, tagInput, memoInput);

  const sendErrorMessage = async (message: string) => {
    try {
      await client.chat.postMessage({
        channel: view.private_metadata,
        text: `${pickOne(messageFail)}\n${message}`,
      });
    } catch (error) {
      logger.error(error);
      throw Error("Can`t Send message to slack");
    }
  };

  await transactionDbSender(
    new TransactWriteItemsCommand(updateRequest),
    sendErrorMessage
  );

  const lineDone = pickOne(messageSave);
  const messageText = buildMessageText(
    lineDone,
    titleInput,
    tagInput,
    memoInput
  );

  try {
    await client.chat.postMessage({
      channel: view.private_metadata,
      text: `${messageText}`,
    });
  } catch (error) {
    logger.error(error);
    throw Error("Can`t Send message to slack");
  }
});

app.command("/st-pick", async ({ ack, body, say }) => {
  await ack();
  const { messagePick } = getCustomMessages();

  const todoItem = await pickTodoItemByTag(body.text, say);

  const id = todoItem.id.S;
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
          value: `${id},${title},${tag},${memo}`,
        },
      },
    ],
    mrkdwn: true,
    text: messageText,
  });
});

app.action<BlockAction<ButtonAction>>("done", async ({ ack, say, payload }) => {
  const { messageDone } = getCustomMessages();

  await ack();

  const [targetId, title, tag, memo] = payload.value.split(",");
  const updateRequest: TransactWriteItemsCommandInput = buildDoneTodoQuery(
    targetId,
    tag
  );

  await transactionDbSender(new TransactWriteItemsCommand(updateRequest), say);

  const lineDone = pickOne(messageDone);
  await say(buildMessageText(lineDone, title, tag, memo));
});

module.exports.handler = async (event: any, context: any, callback: any) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
