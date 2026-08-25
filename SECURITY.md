# Security policy

Project Euphoria is a static public alpha. It is not security-certified, and the current Toolbox stores unencrypted data on a shared GitHub Pages origin. Read the in-product privacy boundary before entering anything.

## Report a vulnerability privately

Use GitHub’s [private vulnerability reporting form](https://github.com/itpro2792-beep/project-euphoria/security/advisories/new) for a vulnerability that could expose or alter visitor data, execute unintended code, bypass an explicit safety control, compromise the build or deployment path, or enable a malicious file to escape its documented limits.

Include only what is needed to reproduce the security issue:

- the affected Project Euphoria URL, file, or release;
- the vulnerability class and likely impact;
- minimal reproduction steps using synthetic data; and
- a proposed fix, if known.

Do not include real Toolbox entries, backup or handoff files, credentials, tokens, names, contact details, screenshots containing private material, transcripts, or another person’s data.

If GitHub’s private-report button is unavailable, this repository currently has no published private security email. Do not disclose exploit details in a public issue. Instead, submit a [public Toolbox feedback issue](https://github.com/itpro2792-beep/project-euphoria/issues/new?template=toolbox-feedback.yml) containing only:

- Tool: “Data controls / backup” or “Other”;
- Action: “Tried to open private vulnerability reporting”;
- Expected: “A private reporting channel”;
- Actual: “Private security reporting is unavailable”; and
- your browser name and version.

That minimal notice is a request to restore a private channel, not a vulnerability report. Wait for a private channel before sharing technical details. The project does not promise a response time while it is maintained as a public alpha.

## Report an ordinary public bug

Use the [Toolbox feedback form](https://github.com/itpro2792-beep/project-euphoria/issues/new?template=toolbox-feedback.yml) for a visual defect, unclear copy, keyboard or screen-reader problem, or non-sensitive functional bug. The issue and GitHub account name are public. Follow the form’s data-minimization rules.

Do not use a public issue for urgent help, personal advice, private household events, abuse or threat reports, health information, security payloads, or data copied from the Toolbox. If someone may be in immediate danger, use local emergency services or appropriate real-time support; in the United States and its territories, call or text [988](https://988lifeline.org/) for crisis support and call 911 for a life-threatening emergency.

## Current known boundaries

The following are disclosed design limits, not hidden security properties:

- `localStorage` is scoped to the complete `https://itpro2792-beep.github.io` origin, not only this repository or `/toolbox/` path.
- Saved entries and downloaded JSON or CSV files are plain text, not encrypted.
- Browser extensions, synced clipboards, other people with access to the browser profile, and current or future code on the same origin may be able to read data.
- A Content Security Policy delivered in a `<meta>` element cannot supply every response-header protection. The dedicated-origin and response-header work remains blocked until the gates in [`docs/DEDICATED_ORIGIN.md`](docs/DEDICATED_ORIGIN.md) pass.

These known boundaries do not excuse a new way to cross the stated controls. Report unexpected read, write, execution, import, migration, deletion, or deployment behavior through the appropriate channel above.

