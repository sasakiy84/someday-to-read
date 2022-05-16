import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  GetItemCommandOutput,
  TransactWriteItem,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
  TransactWriteItemsCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { getCustomMessages, getDbTableName } from "./constant";
import { pickOne } from "./shuffle";

export const transactionDbSender = async (
  dbCommand: TransactWriteItemsCommand,
  errorMessageSender: (message: string) => Promise<any> = async () => {}
): Promise<TransactWriteItemsCommandOutput> => {
  const dynamoDbClient = process.env.IS_OFFLINE
    ? new DynamoDBClient({
        apiVersion: "2012-08-10",
        region: "localhost",
        endpoint: "http://localhost:8000",
      })
    : new DynamoDBClient({
        apiVersion: "2012-08-10",
      });

  let result;
  try {
    result = await dynamoDbClient.send(dbCommand);
  } catch (error) {
    await errorMessageSender("db connection error");
    throw error;
  }

  if (result.$metadata.httpStatusCode !== 200) {
    await errorMessageSender(
      `invalid Status Code: ${result.$metadata.httpStatusCode}`
    );
    throw Error(`Invalid Status Code: ${result.$metadata.httpStatusCode}`);
  }

  return result;
};

export const getDbSender = async (
  dbCommand: GetItemCommand,
  errorMessageSender: (message: string) => Promise<any> = async () => {}
): Promise<Exclude<GetItemCommandOutput["Item"], undefined>> => {
  const dynamoDbClient = process.env.IS_OFFLINE
    ? new DynamoDBClient({
        apiVersion: "2012-08-10",
        region: "localhost",
        endpoint: "http://localhost:8000",
      })
    : new DynamoDBClient({
        apiVersion: "2012-08-10",
      });

  let result;
  try {
    result = await dynamoDbClient.send(dbCommand);
  } catch (error) {
    throw error;
  }

  if (result.$metadata.httpStatusCode !== 200) {
    throw Error(`Invalid Status Code: ${result.$metadata.httpStatusCode}`);
  }

  const item = result.Item;

  if (item === undefined) {
    await errorMessageSender("");
    throw Error("Item does not exist");
  }

  return item;
};

export const buildCreateTodoQuery = (
  title: string,
  tag: string,
  memo: string
): TransactWriteItemsCommandInput => {
  const uuid = randomUUID();
  const { TODO_TABLE, RANDOM_TABLE } = getDbTableName();

  const updateRequest: TransactWriteItem[] = [
    {
      Put: {
        TableName: TODO_TABLE,
        Item: {
          id: {
            S: uuid,
          },
          title: {
            S: title,
          },
          tag: {
            S: tag,
          },
          memo: {
            S: memo,
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
        UpdateExpression: "ADD ids :id",
        ExpressionAttributeValues: {
          ":id": {
            SS: [uuid],
          },
        },
      },
    },
  ];

  return {
    TransactItems: updateRequest,
  };
};

export const buildDoneTodoQuery = (
  targetId: string,
  tag: string
): TransactWriteItemsCommandInput => {
  const { TODO_TABLE, RANDOM_TABLE } = getDbTableName();

  return {
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
};

export const pickTodoItemByTag = async (
  tag: string,
  sendMessage: (message: string) => Promise<any> = async () => {}
) => {
  const { TODO_TABLE, RANDOM_TABLE } = getDbTableName();
  const { messageNotFound, messageFail } = getCustomMessages();

  const sendFailMessage = async (_: string) => {
    await sendMessage(`${pickOne(messageFail)}\n> tag: ${tag} does not exist`);
  };

  const getIdsByTagRequest: GetItemCommandInput = {
    TableName: RANDOM_TABLE,
    Key: {
      tag: {
        S: tag,
      },
    },
  };
  const tagItem = await getDbSender(
    new GetItemCommand(getIdsByTagRequest),
    sendFailMessage
  );

  const ids = tagItem?.ids.SS;

  if (!ids || ids.length === 0) {
    await sendMessage(`${pickOne(messageNotFound)}\n> tag: ${tag}`);
    throw Error("Invalid Id List Type");
  }

  const targetId = pickOne(ids);

  const getTodoItemRequestById: GetItemCommandInput = {
    TableName: TODO_TABLE,
    Key: {
      id: {
        S: targetId,
      },
      tag: {
        S: tag,
      },
    },
  };

  const todoItem = await getDbSender(
    new GetItemCommand(getTodoItemRequestById),
    sendFailMessage
  );

  return todoItem;
};
