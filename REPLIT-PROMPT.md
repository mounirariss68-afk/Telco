# Replit prompt — Dhow (telecom agentic layer, working example)

Two steps. Nothing to configure by hand.

1. **Import the ZIP.** replit.com/import → **ZIP** → upload `dhow-telecom.zip` → **Import**. Wait for the file tree to appear.
2. **Paste the text below the line into Replit's Agent** and send it. The Agent creates the database, confirms the Anthropic connection and starts the app. If Replit shows a confirmation asking to use **Replit AI Integrations** for this app, choose **Approve**. If the Agent asks anything else, answer it; it has been told not to change code.

The first start takes two to three minutes (install, build, generate 3,000 subscribers and 380 history cases). The web view opens when the console prints `Dhow is running on port 5000`.

---

This app was imported from a ZIP and is complete. Set it up to run. Do not change its code.

1. Create a PostgreSQL database for this app with Replit's Database tool, so that `DATABASE_URL` is set in the environment. Do not create any tables, run any migration or insert any data: the app creates its own schema and its synthetic data on first start.

2. The app uses Claude through Replit AI Integrations for Anthropic. It reads `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` from the environment. Make sure that integration is enabled for this app. Do not add an `ANTHROPIC_API_KEY` secret or any other key, and do not install any SDK: the app already has what it needs.

3. Do not modify, add, rename or delete any file. Do not change dependencies, `package.json`, the lockfile, `.replit` or `tools/replit-run.sh`. Do not reformat anything. If something in this setup seems to require a code change, stop and ask me instead.

4. Make sure the workflow defined in `.replit` exists: **Dhow** (the Run button, `bash tools/replit-run.sh`, port 5000 on external port 80). Start it and wait until the console prints `Dhow is running on port 5000`. The first start takes two to three minutes because it installs, builds and generates the demo data; do not interrupt it or restart it.

5. When it is running, tell me: the web view URL, whether `DATABASE_URL` is set, and which `AI_INTEGRATIONS_ANTHROPIC_*` variables are set. Then stop.
