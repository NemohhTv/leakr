// Vercel serverless entry — wraps the Express app so all /api/* routes
// are handled by the same logic that runs in the Replit api-server.
import app from "../artifacts/api-server/src/app.js";

export default app;
