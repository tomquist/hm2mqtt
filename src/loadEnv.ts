import * as dotenv from 'dotenv';

// `.env` has to be loaded before any module that reads `process.env` while it is
// being imported. Several do: `globalPollInterval` in deviceDefinition.ts and the
// `POLL_*` flags in the device definitions are all evaluated at import time.
//
// ESM evaluates every import of a module before that module's own body, so a
// `dotenv.config()` call in the body of index.ts runs *after* the device
// definitions have already been registered — the values in `.env` were silently
// ignored. Keeping the call in its own module and importing it first is what
// guarantees the ordering.
dotenv.config();
