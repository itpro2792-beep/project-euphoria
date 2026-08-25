# Dedicated Toolbox origin: release gate and migration runbook

Status: **blocked; no hostname has been selected or assumed**.

This document defines what must be true before Project Euphoria describes the Toolbox as isolated or private-by-design. Owning a domain or adding a `CNAME` file is not the finish line.

## The boundary today

The published Toolbox currently runs at `https://itpro2792-beep.github.io/project-euphoria/toolbox/`. Browser storage follows the web origin, not the URL path. Its `localStorage` therefore belongs to all content served from `https://itpro2792-beep.github.io`, including other repositories or future pages on that hostname.

The current page uses a restrictive `<meta http-equiv="Content-Security-Policy">`, but a meta policy is not equivalent to reviewed response headers. In particular, directives such as `frame-ancestors` must be delivered as an HTTP header. GitHub Pages documents [custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) and [HTTPS enforcement](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), but it does not provide this repository a documented mechanism to configure arbitrary per-path response headers. See also the [OWASP Content Security Policy guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

A custom hostname attached to this complete site would separate it from `itpro2792-beep.github.io`, but it would still share one origin with every route on that custom hostname. A dedicated **Toolbox** origin requires a deployment that serves the Toolbox—and only the explicitly reviewed assets it needs—from its own origin.

## Decisions required before implementation

Record all of the following in a reviewed change:

1. The exact hostname and who controls its registration, DNS, renewal, account recovery, and emergency changes.
2. The separate hosting unit that will serve only Toolbox code and local assets.
3. Who may publish, roll back, rotate deployment credentials, and review dependency or workflow changes.
4. The exact response headers, update path, retention assumptions, incident path, and rollback owner.
5. Whether the old GitHub Pages Toolbox remains available during migration, and for how long.

Do not add DNS records, a `CNAME`, redirects, analytics, third-party scripts, or a service worker before these decisions are explicit.

## Technical release gates

All gates are required. A hostname by itself passes none of them.

### Origin and transport

- The final URL has a dedicated scheme, host, and port and serves no unreviewed sibling application.
- DNS ownership and renewal are documented; domain verification and takeover protections are enabled where the host supports them.
- HTTPS is enforced after certificate issuance is verified. HTTP does not serve the application or accept data.
- Redirects are a small, fixed allowlist. No user-controlled redirect or proxy target exists.
- The deployment contains no third-party JavaScript, remote fonts, analytics, advertisements, embeds, tag managers, or unnecessary network connections.

### Response headers

Verify the final responses—not only source markup—for at least:

- `Content-Security-Policy` with a default deny, local scripts and styles only, `connect-src 'none'` while no bridge exists, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and `frame-ancestors 'none'`;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- a restrictive `Permissions-Policy` that disables unused sensors and capabilities; and
- an intentional cache policy for HTML so a retired build is not silently kept as a writer.

Use browser developer tools and a header inspection such as `curl -sSI https://HOST/toolbox/`. Save reviewed output with the release evidence. A meta CSP may remain as defense in depth, but it does not satisfy this gate.

### Storage and application behavior

- A clean profile starts with no Toolbox data and makes no network request after required first-party static assets load.
- The exclusive Web Lock, writer/read-only tab behavior, lock transfer, schema migration, exact recovery record, deployed-version cache transition, export, restore, and erase flows pass in supported browsers.
- Unsupported locks, invalid JSON, oversized files, unknown or future schemas, split datasets, and failed storage writes remain fail-closed and preserve the original bytes.
- Import previews are inert text. No imported field becomes markup, code, a URL to fetch, or an action to execute.
- “Erase” removes active data, legacy values, and migration recovery material that the current origin controls. An orphaned recovery record is quarantined and exported byte-for-byte rather than auto-restored after an interrupted destructive action. Compatibility with the immediately previous cached release is tested against the exact preserved assets; older cached releases are explicitly outside the guarantee and must be reloaded before destructive actions.
- The privacy copy names device, browser-profile, extension, clipboard, downloaded-file, backup, and old-origin limits accurately.

### Operational review

- The release commit is reproducible, reviewed, and passes unit, static, link, accessibility-smoke, and browser tests before deployment.
- Deployment permissions use least privilege, protected review where available, pinned actions, and no long-lived secret exposed to page code.
- Rollback restores a previously reviewed build without converting newer stored data into an older schema writer.
- Every released versioned JavaScript and CSS asset remains available and byte-immutable while cached HTML may reference it; the small historical assets should be retained indefinitely unless a separately reviewed retirement proves they are unreachable.
- `SECURITY.md`, the Siren threat model, release notes, and the public Status & Evidence page match the deployed behavior.

## Moving existing local data

The same-origin policy prevents the new origin from reading `localStorage` on `itpro2792-beep.github.io`. DNS and redirects do not move it. Migration must therefore be manual and visible.

1. On the old origin, close other Toolbox tabs and confirm the page holds the writer lock.
2. Download a full Toolbox backup. Treat it as private, unencrypted JSON.
3. Keep the old origin and its data available. Do not erase anything yet.
4. Open the reviewed new origin and select the backup through its explicit restore control.
5. The new origin must validate the complete schema and limits, show what will be restored, and require a second explicit confirmation before persistence. It must not fetch the file from a path or URL.
6. Compare the visible counter, ledger, Fresh Page, plan, and agreement state. Export a new-origin backup and verify that it can be restored in a clean test profile.
7. Only the visitor may choose to erase the old-origin data. The project cannot promise deletion from browser sync, device backups, clipboard history, downloaded files, extensions, screenshots, or copies already shared.
8. Delete or securely retain the plain-text transfer files according to the visitor’s own device practices.

Never build an automatic cross-origin copier, hidden iframe bridge, tracking redirect, or temporary relaxation that lets either origin read arbitrary data from the other.

## Cutover and rollback

Run a staged cutover with synthetic data first. Keep a reviewed old-origin build available long enough for voluntary export, but mark it read-only if it cannot safely understand the newest schema. Publish the exact cutover date, supported browsers, migration steps, and data boundaries before changing links.

If any gate fails, stop promotion and restore the last reviewed deployment. Do not “fix” a release by clearing visitor storage, downgrading a schema, changing DNS without an owner, or widening CSP/CORS. The rollback result must preserve both the old-origin data and any new-origin backup the visitor created.
