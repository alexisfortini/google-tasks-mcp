# Private cloud tunnel

Production here uses stdio on Windows. Obtain custom MCP access in your target ChatGPT account/workspace and permission for your own OpenAI Platform tunnel. Local stdio configuration in another client does not make the cloud chat connected. Availability is account/workspace dependent; do not assume another client or Spark account supports the same custom connection.

The official route associates your tunnel with the correct Platform organization and ChatGPT workspace. Runtime permissions are Tunnels Read + Use; creating/managing a tunnel requires separate management rights. Use a Restricted runtime key and keep it distinct from the Google grant. The client connects outbound over HTTPS; no inbound firewall/public unauthenticated endpoint is required. See [official Secure MCP Tunnel instructions](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Download/install the official OpenAI tunnel-client only after you approve that software installation. The included launcher has been exercised with v0.0.15. Place your chosen compatible binary at tools/tunnel-client-v0.0.15/tunnel-client.exe; the repository does not vendor the binary. Verify release provenance according to the official distribution instructions.

After building helpers, create an ignored machine-specific profile:

```powershell
node scripts/create-tunnel-profile.mjs --tunnel-id YOUR_OWN_TUNNEL_ID
```

Use the actual tunnel_... identifier. This writes quoted local Node/server paths, an environment key reference, loopback health binding and disabled raw HTTP logging. It neither creates nor starts a tunnel. Run connection/foreground-tunnel.exe personally; paste the existing runtime key only at its masked prompt. It calls doctor before foreground run and keeps the key in child-process memory. No admin key is used or key saved. Keep the terminal/desktop available. Do not run two clients for the same tunnel ID.

Create a private custom MCP connection in ChatGPT with Connection=Tunnel and your tunnel. Google authorization is already handled server-side; this stdio implementation does not expose browser-facing MCP OAuth endpoints. Choose the platform configuration appropriate to that route rather than inventing a public OAuth server. Tunnel authorization and Google OAuth remain separate.

Verify fresh discovery of 16 tools, a harmless read and the mutation receipt on an explicitly authorized isolated test. A successful doctor/health status alone does not prove end-to-end cloud schema behavior. Use [official connection refresh steps](https://developers.openai.com/plugins/deploy/connect-chatgpt) after metadata changes. Account/product usage costs are not promised free by this repository; no paid middleware is part of its design.
