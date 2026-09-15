# MyRedis Studio

Your Node.js key-value server, with a retro web workspace. Built for Maliha Ehsan.

Type commands, browse keys, edit values, watch expiration, and inspect activity.
This is a working frontend and backend, not a mock dashboard. It starts empty;
the optional **Load example keys** button creates three real demo keys.

## Start in your Windows VS Code

1. Extract the ZIP into a **new folder**. Keep your original index.js as a backup.
2. Open the MyRedis-Studio folder in VS Code. Open Terminal > New Terminal.
3. Check `node -v`. This project requires Node.js 22.9 or newer.
4. Stop your old index.js server with Ctrl+C so port 8000 is free.
5. Run these commands one at a time:

```cmd
npm install
npm run build
npm start
```

Open **http://localhost:3000** in Chrome. Leave the terminal running.
The browser replaces the long `node -e` test commands. Type into the green console:

```text
PING
SET name "Maliha Ehsan"
GET name
SET session active EX 20
TTL session
EXPIRE session 60
PERSIST session
DEL name
```

For frontend development, stop npm start, then use `npm run dev`.
It serves both the backend and Vite through one server at localhost:3000;
UI changes appear without rebuilding. Backend edits still require a restart.
Do not use VS Code Live Server for this app: it needs its Node.js backend.

## What you can do

- Run PING, SET, GET, DEL, TTL, EXPIRE, and PERSIST from the browser.
- Create or edit keys with a form; a blank expiration means no expiry.
- Search key names, filter expiring keys, inspect values, and copy them.
- Watch active-key counts, TTL countdowns, and the latest 60 commands.
- Review up to 100 command results and recall commands with the arrow keys.
- Focus the console with Ctrl+K (Command+K on macOS).
- Export the currently live keys as JSON. Export is a snapshot, not automatic persistence.
- Switch between light and dark themes; reduced-motion preferences are respected.

The workspace refreshes from the server every 1.8 seconds. Countdown animations
between refreshes use server timestamps. Metrics are actual counts and stored
value bytes, not fabricated performance benchmarks. Displayed command duration
is server execution time, not total network latency.

## How this continues your original code

Your original server combined command parsing, storage, expiration, and TCP in one
file. This version separates those responsibilities:

| File | Responsibility |
| --- | --- |
| server/engine.js | Shared command parser, Map storage, expiration, command execution, optional Redis adapter |
| server/index.js | HTTP API, web frontend delivery, optional access key, original plain-text TCP endpoint |
| src/main.jsx | Browser console, key table, inspector, forms, history, command guide |
| src/styles.css | Retro palette, hard shadows, responsive layouts, theme tokens |
| src/number-ticker.jsx | Magic UI adapted animated counts |
| src/components/animated-filters.jsx | SmoothUI adapted sliding filter indicator |
| tests/ | Command behavior and HTTP integration checks |

The web API and localhost TCP endpoint share the same engine and data.
Your original client.js still works on **127.0.0.1:8000**. The browser uses **3000**.
This remains your custom plain-text TCP protocol, not a complete RESP server.
Do not expect redis-cli or Redis GUI extensions to work with that TCP endpoint yet.

Values support quoted spaces, escaped newlines, Unicode, and empty strings.
Unquoted words after a SET key are joined with spaces for compatibility with your
earlier project. The optional trailing `EX seconds` is treated as expiration;
quote an entire literal value that ends with those words to avoid ambiguity.

## Storage modes

### Your custom engine (default)

No Redis server installation or cloud account is required. Data is stored in a
Map and disappears when Studio stops. Expiration is checked at access time and
by periodic cleanup, so a delayed timer cannot keep an expired key readable.
Limits: 1,000 keys, 256 bytes per key, 64 KB per value, 5 MB total key/value bytes.
Invalid SET commands do not overwrite existing values. A successful SET replaces
both the old value and its expiry. DEL removes expiry as well.

### Optional actual Redis / Redis Cloud

Use this only if you want an existing Redis database to store your values.
There is still no need to install Redis locally.

1. Copy `.env.example` to `.env` in VS Code.
2. Set `REDIS_URL` to the connection URL supplied for your database. Example shape:
   `rediss://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT`.
3. Keep secrets in `.env`, never in frontend code. Special password characters
   must be URL-encoded. Use the TLS scheme and settings supplied by your provider.
4. Restart Studio. The engine label changes to **Redis Cloud / external** only
   after the connection succeeds.

Keys are namespaced under `myredis-studio:` by default. Set REDIS_PREFIX to a
separate value for another workspace. The browser reads at most 1,000 string keys
from that namespace; counters and exports describe that returned view. Redis owns
expiration, persistence, capacity limits, and billing in this mode. Do not use
the prefix for non-string keys. External Redis integration is implemented but
was not tested against an actual cloud account because credentials were absent.

Official client reference: https://redis.io/docs/latest/develop/clients/nodejs/

## Let other people use it

This is a **shared workspace**: everyone with access sees and edits the same keys.
It is not a multi-tenant product with per-user private databases.

### On your trusted local network

Create `.env` using `.env.example`. Set HOST to 0.0.0.0 and STUDIO_TOKEN to a long,
random access key (at least 24 characters). Generate one in your own terminal:

```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep that value private. Restart Studio, use `ipconfig` to find your computer's
IPv4 address, and share http://YOUR_IPV4_ADDRESS:3000 with trusted people on the
same network. Their browser asks for the access key. Windows may require you to
allow Node.js on your private network. Your computer and server must stay running.
HTTP on a LAN is unencrypted, so use only non-sensitive demo data in this mode.

### Public website

The project includes a Dockerfile for a **long-running Node.js/container host**.
Set HOST=0.0.0.0, STUDIO_TOKEN, PUBLIC_ORIGIN to the exact HTTPS site origin,
and TCP_PORT=0. Set REDIS_URL if you need external storage. The host must terminate
HTTPS and route HTTP traffic to the PORT it supplies. Container port defaults to
3000. Use one instance for the custom Map engine, since memory is not shared
between processes and deployments reset it. Login sessions also live in process
memory; restarts require signing in again.

This package has not been publicly deployed. No hosting account or paid resource
was created. A static-only frontend deployment cannot run this backend. Public
multi-user production use would need user accounts, roles, stronger distributed
rate limiting, operational monitoring, and a reviewed persistence strategy.

## Your requested design and review tools

| Tool | What was used / what remains |
| --- | --- |
| RetroUI | The visual direction follows its bold borders and offset shadows. The finished controls are custom CSS; the official registry could not be retrieved, so they are not claimed to be installed RetroUI components. |
| Magic UI | Number Ticker source pattern adapted for live counts, with reduced-motion behavior. |
| SmoothUI | AnimatedTabs source adapted into accessible filter buttons with a shared sliding indicator. |
| Taste Skill | Its official source was consulted for typography, palette discipline, motion and layout. Its stated primary scope excludes dashboards; the workspace does not blindly apply its landing-page rules. No skill was installed or modified. |
| CodeRabbit | .coderabbit.yaml is included with backend and frontend review instructions. No CodeRabbit review has run. |
| Redis | Your custom engine remains the default, with the official node-redis client for optional cloud storage. |
| VS Code | npm scripts, environment template, tests, and the complete editable source are included. |

To use CodeRabbit, install the official CodeRabbit extension in your VS Code,
sign in to your account, open this folder, and run its review action. For pull
request reviews, connect your repository to CodeRabbit and commit the YAML file.
Configuration reference: https://docs.coderabbit.ai/reference/configuration

## Verification

`npm test` checks the original commands, quoted and Unicode values, expiration
boundaries, overwrite/delete behavior, concurrent operations, validation,
HTTP authentication, cross-origin rejection, and static frontend delivery.
`npm run build` compiles the actual production frontend.

Browser/visual testing remains pending: automatic approval review rejected it
because the Sites workflow requires an explicit request for browser testing.
No claim is made that desktop/mobile rendering or GUI interactions were browser-verified.

## Troubleshooting

- **Port 8000 occupied:** stop your earlier `node index.js`; or set TCP_PORT=0
  in .env if you only need the web interface.
- **Port 3000 occupied:** set PORT=3001 and open localhost:3001.
- **File not found:** run npm run build before npm start.
- **Server offline:** check the terminal and click the connection refresh icon.
- **(nil) after restart:** the custom Map resets. Set the key again or use external Redis.
- **Access key rejected:** use exactly STUDIO_TOKEN from the running server's .env.
- **Redis connection failure:** check REDIS_URL, TLS settings, and the database's
  access settings. Credentials are never sent to the browser.

Next engineering milestones: native RESP2, per-user workspaces, durable custom
snapshots or append-only logging, then more Redis data types. These are not
represented as completed features.
