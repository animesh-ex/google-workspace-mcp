import open from "open";
import { runInteractiveAuth, CREDENTIALS_PATH } from "./auth.js";

runInteractiveAuth((url) => open(url))
  .then(() => {
    console.log("Done. You can now use the Google Workspace MCP server.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(`Auth failed: ${e.message}\n(OAuth client file expected at ${CREDENTIALS_PATH})`);
    process.exit(1);
  });
