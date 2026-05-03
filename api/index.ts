// Vercel serverless entry — imports the pre-built Express app bundle so
// Vercel doesn't try to TypeScript-compile the api-server source directly.
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
