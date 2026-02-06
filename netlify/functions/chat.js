// netlify/functions/chat.js
import { handler as simonHandler } from "./simon.js";

export async function handler(event, context) {
  return simonHandler(event, context);
}
