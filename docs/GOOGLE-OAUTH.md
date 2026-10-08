# Google OAuth setup

Create your own Google Cloud project, enable Google Tasks API, configure a consent screen and add your personal address as a test user when using External Testing. Create an OAuth **Desktop app** client and store the downloaded JSON in ignored `.private/client.json`. Never commit or distribute it. This repository does not create credentials or publish an OAuth app for you.

Configure the expected email first. Run the read-only enrollment command from README only after approving that persistent grant. The system browser and an ephemeral 127.0.0.1 callback perform the consent flow; no password/token is entered into chat. Read-only enrollment requests openid, email and Tasks readonly. The optional write-access command requests full Tasks only after deliberate approval. All Tasks scopes cover the account rather than one list.

Enrollment verifies PKCE, state, nonce, verified email, expected account and stable subject. Windows CurrentUser DPAPI encrypts the offline refresh data. The granting desktop user must also run the server; copying the ciphertext to another account/machine is not a supported migration. Use a separate independent grant for another installation.

Google can expire or revoke refresh tokens. External consent screens left in Testing normally issue refresh tokens with a seven-day lifetime when Tasks scopes are requested; do not treat this as a server regression. Any production publishing/verification decision belongs to your project owner and may require Google's review. Re-enrollment is a human-approved action, not an automated retry loop.

Official guidance: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).
