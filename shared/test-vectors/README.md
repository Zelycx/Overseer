# Shared timezone test vectors

`timezone-v1.json` is a language-neutral contract fixture for Web, Android, and iOS. It contains only JSON primitives, arrays, and objects: no JavaScript `Date`, Temporal, Firestore `Timestamp`, or platform-specific date objects.

## Format

- `version` identifies the fixture schema version.
- `format` identifies this fixture family.
- `ianaTzdbRelease` records the timezone database release used to independently verify expected instants.
- Every item in `cases` has a stable `id`, an `operation`, an `input` object, and an `expected` object.
- Resolved cases use `expected.status = "resolved"`; instants are RFC 3339 UTC strings ending in `Z`, and disambiguation metadata is `null`, `earlier`, or `later`.
- Rejected cases use `expected.status = "error"` and a stable `code` corresponding to the platform-neutral error category.
- Ambiguous local-time failures include both candidate UTC instants under `expected.choices`.
- `deviceTimezoneIndependence` contains device timezone names as test context; they are never inputs to the conversion API.
- `eventTimezoneChange` separates the previous record from the new authored timezone and unchanged wall-clock inputs. Previous disambiguation values are context only and are not forwarded to the new-zone resolver.

Expected UTC values were checked independently with Python 3.12 `zoneinfo` using the system IANA tzdb release 2026e, including both `fold` candidates and local-time round-trips for overlaps and gaps. This fixture format is intended to be read by Android's `java.time`, iOS Foundation, and JavaScript test tools without sharing an implementation.
