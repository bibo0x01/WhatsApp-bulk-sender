# WhatsApp Bulk Sender

Internal desktop app (Electron + `whatsapp-web.js`) to send WhatsApp messages in bulk from an Excel file.

## Features

- WhatsApp login via **QR inside the app**
- Import contacts from **Excel** (`.xlsx`, `.xls`)
- Message template with placeholder: **`{name}`**
- Send **one by one** with configurable delay
- Progress: **elapsed timer**, sent/failed counters, and a send log
- Runs **locally only** (no external server)

## Requirements (end users)

- **Windows**: Google Chrome **or** Microsoft Edge installed (the app uses an installed browser)

## Requirements (developers)

- Node.js 18+

## Excel format

First sheet with columns (header names can be English or Arabic):

- number (e.g. `2010...` with country code)
- name

Supported header examples:
- Numbers: `number`, `phone`, `mobile`, `whatsapp`, `رقم`, `رقم الهاتف`, `موبايل`, `واتساب`
- Names: `name`, `full name`, `client name`, `اسم`, `الاسم`, `اسم العميل`

If headers are not recognized, the app will fallback to:
- **1st column = number**
- **2nd column = name**

## Run (dev)

```bash
npm install
npm start
```

## Build (Windows / macOS)

```bash
npm run dist
```

Build outputs are written to `dist-out3/` (see `package.json` → `build.directories.output`).

## Notes / warnings

- Internal use only.
- Make sure recipients consent to being contacted.
- Bulk messaging can lead to WhatsApp account restrictions if overused.
