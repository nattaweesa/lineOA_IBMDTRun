import express from "express";
import webhookRouter from "./routes/webhook";
import { env } from "./config/env";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(webhookRouter);

app.listen(env.PORT, () => {
  console.log(`LINE OA IBMDT Run server listening on port ${env.PORT}`);
});
