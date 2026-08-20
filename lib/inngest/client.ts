import { Inngest } from "inngest";

export const inngest = new Inngest({
    id: "sortie",
    // These will now automatically pick up the values from .env.local
    eventKey: process.env.INNGEST_EVENT_KEY,
});