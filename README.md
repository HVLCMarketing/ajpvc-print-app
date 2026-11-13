# AJPVC Print Materials

A small website for Advanced Joint Pain & Vascular Center that:

- fills every printable piece (trifold, patient folder, provider folder, flyer, postcard, mousepad, and the Personal Injury, Workers' Comp and Correctional Health referral slick sheets) with a location's **name, address, hours and map**, plus optional event dates for the flyer and postcard;
- prints or saves each piece as a true-size PDF;
- takes **print orders** and emails them to the marketing team.

No build tools or accounts beyond Netlify are needed.

## Deploy to Netlify

**Option A: drag and drop (fastest).** In Netlify, go to *Add new site → Deploy manually* and drop this whole folder (or the zip). Done.

**Option B: from GitHub (recommended, keeps it in sync with the design canvas).** Push this folder to a GitHub repo, then in Netlify choose *Add new site → Import an existing project* and pick the repo. `netlify.toml` already sets the publish folder and regenerates the templates on every deploy.

## Turn on shared locations (one time)

Locations are saved on the Netlify site itself (Netlify Blobs), so everyone sees the same list in any browser. Anyone with the link can view and print; editing needs a team passcode.

1. In Netlify: *Site configuration → Environment variables → Add a variable*.
2. Key `EDIT_PASSCODE`, value: the passcode your team will use. Save.
3. *Deploys → Trigger deploy → Deploy site* so the new passcode takes effect.
4. On the site, click **Unlock editing** and enter the passcode. It's remembered on that device until you click **Lock**.

To change the passcode later, edit `EDIT_PASSCODE` and redeploy. Everyone will need to unlock again.

## Turn on order emails with PDFs (one time)

When an order is submitted, the site builds a print-ready PDF of every ordered piece for that location and emails them to the marketing team through [Resend](https://resend.com). Files that don't fit in one email (over about 30 MB together) are linked instead; every file also has a download link that works for 90 days.

1. Create a free Resend account. Under **Domains**, add `vhpmd.com` and add the DNS records Resend shows (ask whoever manages the vhpmd.com DNS). Wait until the domain shows **Verified**.
2. In Resend, create an **API key** with sending access.
3. In Netlify: *Site configuration → Environment variables*, add:
   - `RESEND_API_KEY`: the key from step 2
   - `ORDER_EMAIL_TO`: who receives orders (separate several addresses with commas)
   - `ORDER_EMAIL_FROM`: for example `AJPVC Print Orders <orders@vhpmd.com>`
4. Redeploy the site.

Orders still appear under *Forms* in the Netlify dashboard. If you also had a Netlify form email notification turned on, turn it off to avoid getting two emails per order.

The PDFs are built by `netlify/functions/order-pdfs-background.mjs` (a background function, which can run for up to 15 minutes) and served by `netlify/functions/order-file.mjs`.

## Using it

Use the **Facility** menu at the top to switch between **Advanced Joint Pain & Vascular Center** and **Heart Vascular & Leg Center**. Each facility has its own pieces and order items. Which facility a piece belongs to is the `facility` value (`ajpvc`, `hvlc`, or `both` to show on both pages) on that piece in `tools/pieces.json`; order items use `data-facility` on their label in `index.html`. Links can open straight to one: `?facility=hvlc`. Pieces are grouped into sections (Marketing materials, Folders, Patient guides, Newsletters, Referral materials) by the `group` value in `tools/pieces.json`; a new newsletter is a new piece with `"group": "Newsletters"`. A finished PDF supplied as-is (like the HVLC joint pain poster) goes in `files/` with a preview image and a piece with `"kind": "file"`, `"pdf"` and `"preview"`; the app shows the preview and a Download PDF button.


1. **Location materials** tab: pick a location (click **Unlock editing** to add or change one), then fill in the name, address, hours and upload a map image. Previews update as you type.
2. Anything still **highlighted in yellow** is a placeholder (in the design or not filled in yet).
3. Click **Print / PDF** on a piece. In the print dialog choose *Save as PDF* (or a printer), margins *None*, and turn on *Background graphics*.
4. **Business cards** tab: type a person's name, title, phone numbers and email and pick the office address. The card style follows the Facility menu. Click **Print / PDF** for a true-size 3.5 × 2 in card, or **Order these cards** to add them to an order (the card details are sent with the order).
5. **Place an order** tab: choose the location, enter quantities and delivery details, and submit.

Locations are shared: changes are saved to the site and appear for everyone (others see them the next time they open or return to the page). **Export locations** downloads a backup; **Import** loads one back in. If the site was used before shared locations were turned on, unlocking shows a button to add the locations saved in that browser to the shared list.

## How design changes reach the site

The designs live on the **AJPVC Launch Creative Kit** canvas in Claude. The files in `source/` are copies of those artboards.

1. Make the change on the canvas (or ask Claude to).
2. Ask Claude to **sync the print app**. Claude copies the updated artboards into `source/`, runs `python3 tools/sync.py`, and pushes to GitHub.
3. Netlify redeploys automatically.

`tools/sync.py` turns `[STREET ADDRESS]`, `[CITY, STATE ZIP]`, `[HOURS]`, `[LOCATION NAME]`, `[LOCATION MAP]` and the event placeholders into fields the app fills. Any other bracketed text stays as a highlighted placeholder. A new image added on the canvas must be saved into `assets/` and listed in `tools/pieces.json`; the sync stops with a message if one is missing.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `js/app.js` | Location editor, previews, order form |
| `print.html`, `js/print.js` | True-size print view for one piece |
| `netlify/functions/locations.mjs` | Shared location list API (`/api/locations`) |
| `js/render.js` | Fills templates with a location's details |
| `js/templates.js` | Generated by `tools/sync.py`; do not edit |
| `source/` | Artboard copies from the design canvas |
| `assets/` | Logos, photos, QR code |
| `tools/pieces.json` | Which artboards make up each piece, print sizes, image map |

## Order manager (orders.html)

Every order placed on the "Place an order" tab becomes a tracked record (ORD-0001, ORD-0002, ...). The site builds the print-shop PDFs, emails them to marketing@heartandleg.com, and keeps the record in Netlify Blobs (store `orders`).

- Open `orders.html` (link: "Order manager" in the top bar). It uses the same team passcode as location editing (`EDIT_PASSCODE`).
- Statuses: Building PDFs (automatic) -> New -> Sent to print shop -> In production -> Shipped -> Delivered, plus On hold and Cancelled.
- Each order keeps the print files and quantities, print shop / PO / quote, carrier and tracking number, a history log, and can email the requester when the status changes or re-send the print email.
- Environment variables: `EDIT_PASSCODE` (required), `RESEND_API_KEY` and `ORDER_EMAIL_FROM` (required to send any email), `ORDER_EMAIL_TO` (optional, defaults to marketing@heartandleg.com).
- Functions: `netlify/functions/orders.mjs` (the `/api/orders` API), `netlify/functions/order-pdfs-background.mjs` (builds PDFs and creates the record), shared code in `netlify/lib/orders.mjs`.
