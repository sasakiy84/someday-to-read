import { ModalView } from "@slack/bolt";

export const buildMessageText = (
  line: string = "",
  title: string = "なし",
  tag: string = "なし",
  memo?: string
): string => {
  const message = [];
  line && message.push(`${line}\n`);
  message.push(`> title: ${title}\n`);
  message.push(`> tags: ${tag}\n`);
  memo && message.push(`\n> \n> ${memo?.replace(/\n/g, "\n>")}`);

  return message.join("");
};

export const buildCreateTodoModalBlock = (): ModalView["blocks"] => {
  const tags = ["book", "web"];

  const blocks = [
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
  ];
  return blocks;
};
