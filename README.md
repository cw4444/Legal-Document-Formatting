# Benefits Specialist Demo

This is a lightweight, non-technical demo for benefits operations work.

Built with Codex from OpenAI: [https://openai.com/codex](https://openai.com/codex)

## What it does

- Reads a job spec, policy note, or benefits brief
- Summarises renewal logic
- Flags vendor audit concerns
- Gives a plain-English statutory compliance summary
- Checks whether the process looks scalable

## Run it

For the local demo only, open `index.html` in a browser.

For proxy-backed live AI, run:

```bash
npm start
```

Then open `http://localhost:3000`.

No build step is required.

## Model settings

The app includes optional fields for:

- Provider: local, OpenAI, Anthropic, Google, or xAI
- API key
- Model name

In this demo, those settings are stored only in the browser and are not sent anywhere. If you use the local proxy, the browser sends prompts to your own machine and the proxy forwards them to the chosen provider. The current experience still falls back to fully local, rule-based analysis when no key is supplied.

## Best next step

If you want live AI later, just use the provider dropdown, paste your key, and run the app through the local proxy.
