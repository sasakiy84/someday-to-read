export const getDbTableName = () => {
  const TODO_TABLE = process.env.TODO_TABLE;
  const RANDOM_TABLE = process.env.RANDOM_TABLE;

  if (!TODO_TABLE || !RANDOM_TABLE)
    throw new Error("TODO_TABLE and RANDOM_TABLE required");

  return {
    TODO_TABLE,
    RANDOM_TABLE,
  };
};

export const getCustomMessages = () => {
  const messageSave = process.env.MESSAGE_SAVE?.split(",") || ["保存した"];
  const messagePick = process.env.MESSAGE_PICK?.split(",") || [
    "これがおすすめ",
  ];
  const messageDone = process.env.MESSAGE_DONE?.split(",") || ["削除した"];
  const messageNotFound = process.env.MESSAGE_NOT_FOUND?.split(",") || [
    "見つからなかった",
  ];
  const messageFail = process.env.MESSAGE_FAIL?.split(",") || [
    "想定外の事態で作業が完了できなかった",
  ];
  return {
    messageSave,
    messagePick,
    messageDone,
    messageNotFound,
    messageFail,
  };
};

export const getSlackCredentials = () => {
  const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

  if (SLACK_SIGNING_SECRET === undefined || SLACK_SIGNING_SECRET === "") {
    throw Error("SLACK_SIGNING_SECRET is not provided");
  }
  if (SLACK_BOT_TOKEN === undefined || SLACK_BOT_TOKEN === "") {
    throw Error("SLACK_BOT_TOKEN is not provided");
  }

  return {
    SLACK_SIGNING_SECRET,
    SLACK_BOT_TOKEN,
  };
};
