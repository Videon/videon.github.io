# videon.github.io

[Soundgarden](https://videon.github.io/soundgarden/)

## Local CMS

The site content lives in `content/site.json`. To edit it with the local CMS:

```powershell
node cms/server.js
```

Then open `http://127.0.0.1:8130/`.

Use the CMS tabs to edit the site by feature:

- `Content` for identity, menu sections, portfolio work, and contact fields
- `Display` for font preset, custom font stack, and base font size
- `Shader` for motion speed, visual intensity, and mouse/menu reactivity

The CMS saves changes to tracked files in this repository:

- `content/site.json` for text, links, contact details, and portfolio data
- `assets/portfolio/` for uploaded portfolio images and video files

After saving, commit and push with your normal Git client.

### Security notes

The CMS is a local editing tool. GitHub Pages serves the site as static files and will not run `cms/server.js`, so visitors cannot use the CMS API to update the website.

By default, the CMS binds to `127.0.0.1` and rejects non-local browser write requests. Do not deploy the CMS server to a public host. If you intentionally run it on a private network, set `ALLOW_REMOTE_CMS=1` only while you are actively editing.
