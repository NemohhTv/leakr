// Serverless-friendly Express app — skips pino-http worker threads
// which don't work in Vercel's serverless environment.
import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
