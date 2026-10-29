# ACCELERA

**A guided payment-information follow-up assistant.** A business supplies a missing detail; an operations analyst receives the conversation, checks and case history together and decides the next step.

Independent student portfolio project, originally explored for OCBC IGNITE. Not affiliated with or endorsed by OCBC. Synthetic examples only. No live bank connection, money movement, payment resubmission, settlement verification or automated cancellation.

## Run the portfolio app

Requires Node.js 22.5+ and npm.

```sh
npm ci
npm run demo
```

Open http://127.0.0.1:4174. The launcher prints temporary staff credentials and the synthetic business case token. It binds to your computer only and disables external AI calls. Do not use real customer information. The local demo database persists between launches; use **Create a case** in the staff workspace for a new journey after completing the seed case.

## Walkthrough

1. Open Business using case EX-4821 and the launcher token.
2. Ask what a clearing code means, then enter `123456` and confirm. Six digits is an illustrative rule; real formats vary by payment network.
3. Open Staff workspace and sign in. Inspect the response, format result and conversation.
4. Add a review reason and record analyst review. The receipt verifies the saved **case record**, not the payment.
5. Create another synthetic case, show its business access and try help, account-change, incomplete-answer or cancellation requests.

The **How this works** button provides a guided tour. Queue search and counts locate cases needing review. A format pass never proves bank ownership or information accuracy.

## Policy enforcement

| Boundary | Enforcement |
|---|---|
| Case access | Case-specific bearer token checked by the server; simulated access, not bank identity verification |
| Staff authority | Password hash, signed expiring session, revocation on logout |
| Minimal information | One missing field; recognised password/code disclosures rejected before persistence |
| Response integrity | Original messages retained; basic format checked, uncertainty stays open |
| Changed intent | Cancellation recorded as a request; beneficiary-change indicators held for staff |
| Analyst review | Required review reason; pending or risk-held cases cannot be marked reviewed |
| Stale/repeated actions | Version checked within the transaction |
| Saved outcome | Persisted version, status and decision checked before returning a verification receipt |

These are prototype rules, not OCBC internal policies. Keyword indicators and sensitive-content detection are limited; they are not fraud detection, sanctions screening or comprehensive personal-data protection. Staff can access case tokens; production role separation is not implemented.

## Test

```sh
npm test
```

Integration tests use an isolated server and temporary database. They cover the full workflow, access boundaries, incomplete replies, stale/concurrent actions, saved-record checks, cancellation, help, recognised sensitive disclosures and logout. Live AI and bank integrations are not tested.

## Hosting and configuration

Use `.env.example` for configured `npm start`. Generate a staff password hash with `node -e "import('bcryptjs').then(async b=>console.log(await b.hash('YOUR_STRONG_PASSWORD',12)))"`. Use random secrets and a managed libSQL database for hosting. The Render blueprint serves the frontend and API together. Sessions are in memory: use one instance and expect sign-in to reset after restart. No hosting deployment or LinkedIn publication is performed by these commands.

Default conversations use guided policy responses. Optional Groq wording assistance sends recent synthetic conversation text to that provider; it cannot execute actions. Do not enter real or sensitive information.

### Migration from the earlier demo

Generate a **fresh** `CASE_TOKEN_SECRET` of at least 32 random characters. Never copy the old `BUSINESS_TOKEN` value: earlier seed-case access exposed that value. Old bearer links intentionally stop working; authenticated staff can issue new case access. The local launcher handles fresh keys automatically and prints only a derived case token.

Keep `TRUST_PROXY_HOPS=0` for direct/local access. The Render blueprint sets `1` for a single trusted ingress hop; verify this against the actual host before deploying. Do not enable it if clients can bypass that ingress or reach the server through shorter paths. Rate-limit tests simulate this configuration; they do not validate Render's live network topology.

The older workbench remains available through `npm run start:legacy` with its separate configuration. Historical Netlify configuration applies to that older app, not this full-stack follow-up app.

See [release checks](docs/portfolio-release.md) for scope and limitations.
