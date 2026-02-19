# OpenClaw Security Hardening Checklist

## 1. Cloudflare Tunnel + Zero Trust (Critical)

Your OpenClaw instance has shell access, file system control, and API keys. If it's publicly reachable, attackers can exploit it directly — even without your gateway token (see CVE-2026-25253).

**What to do:**
- Set up a Cloudflare Tunnel so your Railway service has no public IP at all
- Put the Control UI behind Cloudflare Zero Trust (require Google/GitHub login)
- Disable Railway's public networking once the tunnel is active
- This replaces the need for SSH or Tailscale

**Why it matters:**
Without it, the gateway token is your only defense. With it, an attacker needs to bypass Cloudflare Zero Trust, then know the gateway token, then find an exploit — three layers instead of one.

## 2. Prompt Injection via Slack Messages

Anyone who can @mention the bot in Slack can send it messages. A crafted message (prompt injection) could trick the agent into running shell commands, reading files, or leaking secrets.

**What to do:**
- Restrict which Slack channels the bot is added to
- Limit which tools/skills the agent has access to in OpenClaw config
- Don't give unrestricted shell access if the bot only needs to answer questions
- Be cautious about who in your Slack workspace can interact with the bot

## 3. Slack Token Rotation

`SLACK_BOT_TOKEN` lets anyone post as your bot to any channel it's in. If leaked, they can phish your entire workspace.

**What to do:**
- Rotate Slack tokens periodically
- Monitor for unexpected bot activity in your Slack workspace

## 4. Anthropic API Key Spending Limits

A compromised instance could burn through thousands in API calls. There's no spending cap by default.

**What to do:**
- Set a usage limit in your Anthropic dashboard immediately
- Monitor API usage for unexpected spikes

## 5. Railway Volume Data

Railway volumes aren't encrypted at rest by default. Anything your agent stores in `/data/` sits unencrypted.

**What to do:**
- Never store secrets in files on the volume — keep them in Railway env vars
- Be mindful of what data the agent writes to the workspace

## 6. Keep OpenClaw Updated

OpenClaw has had multiple CVEs in a short time. Your Railway deploy won't auto-update.

**What to do:**
- Check for security patches weekly
- Sync your fork from upstream and redeploy when updates are available
- Watch the OpenClaw GitHub repo for security advisories
