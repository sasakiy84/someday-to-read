export const buildMessageText = (
  line: string = "",
  title: string = "なし",
  tag: string = "なし",
  memo?: string
): string => {
  const message = [];
  line && message.push(`${line}\n`);
  message.push(`> title: ${title}`);
  message.push(`> tags: ${tag}\n`);
  memo && message.push(`\n> \n> ${memo?.replace(/\n/g, "\n>")}`);

  return message.join("");
};
