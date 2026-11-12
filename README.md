# AutoSense

Car repair shop website: a React/Vite frontend (`frontend/`) and an
Express/PostgreSQL API (`backend/`).

## End-to-end API tests

`backend/tests/full-flow.test.js` drives the whole API end to end — services,
AI diagnosis, availability, bookings, lookup, cancellation and the contact form
— and prints a per-test summary table. It is a plain Node script with no test
framework, and it targets `http://localhost:4000` unless `API_BASE` says
otherwise. Any non-localhost target also needs `CONFIRM_PROD=yes`, because the
suite creates real bookings, diagnosis requests and contact messages in
whatever database it points at.

```bash
# against a local backend (cd backend && npm start, in another terminal)
node backend/tests/full-flow.test.js

# against production
API_BASE=https://autosense-production.up.railway.app CONFIRM_PROD=yes node backend/tests/full-flow.test.js
```

The suite prints the cleanup SQL for every row it created at the end of the
run; run it against the target database afterwards.
