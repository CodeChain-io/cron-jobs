import * as config from "config";
import { EmailClient } from "./EmailNotify";
import { CodeChainAlert } from "./Errors";
import { SlackNotification } from "./SlackNotify";

const targetEmail = "devop@kodebox.io";
const emailClient = new EmailClient("");

export function getConfig<T>(field: string): T {
  const c = config.get<T>(field);
  if (c == null) {
    throw new Error(`${field} is not specified`);
  }
  return c;
}

export function haveConfig(field: string): boolean {
  return !!config.has(field) && config.get(field) != null;
}

export async function sendNotice(error: CodeChainAlert) {
  SlackNotification.instance.sendError(error.title + "\n" + error.content);
  await emailClient.sendAnnouncement(targetEmail, error.title, error.content);
}
