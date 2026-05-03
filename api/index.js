// Vercel serverless entry — imports the pre-built Express app bundle.
// Using plain JS so Vercel skips TypeScript type-checking of .mjs imports.
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
