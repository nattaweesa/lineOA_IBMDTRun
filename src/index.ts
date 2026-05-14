import express from "express";
import webhookRouter from "./routes/webhook";
import { env } from "./config/env";

const app = express();

app.use(webhookRouter);

app.listen(env.PORT, () => {
  console.log(`LINE OA IBMDT Run server listening on port ${env.PORT}`);
});