# Discovery baseline for v1.10.0

Generated from the released source of `v1.10.0` (commit `f9948fb`), which is
byte-identical under `src/` to the commit these files were written at:

```sh
git diff --stat f9948fb origin/develop -- src/   # empty
```

Frozen copy: it must not be regenerated when the working tree changes. It is
what installations that already ran v1.10.0 have in their broker, so the
upgrade scenario replays it and the state-topic rule compares against it.

Refresh at release time only, by copying `../../current` here under the new
version directory.
