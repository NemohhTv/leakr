// Vercel serverless entry — uses a pino-free Express app so worker threads
// (which don't exist in serverless) don't crash the function.
import app from "../artifacts/api-server/dist/app-serverless.mjs";

export default app;
