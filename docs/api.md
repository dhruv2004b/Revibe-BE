# ReVibe API contract

Base URL: local `http://localhost:8080` (Android emulator: `http://10.0.2.2:8080`), production: the Render URL.

Every route under `/v1` needs `Authorization: Bearer <token>`:
- local (`AUTH_MODE=mock`): `dev:<uid>`, e.g. `dev:demo1`
- production (`AUTH_MODE=firebase`): a Firebase ID token from `FirebaseAuth.instance.currentUser.getIdToken()`

Errors are always `{ "error": { "code": string, "message": string, ...extra } }`. `message` is safe to show to the user.

| Status | Meaning |
|---|---|
| 400 | Invalid input (`invalid_input`, `invalid_json`, `insufficient_coins`, `task_expired`, `invalid_slot`) |
| 401 | Missing or expired sign-in |
| 404 | Not found (also used when the item belongs to someone else) |
| 409 | Conflict (`already_completed`, `already_owned`, `slot_taken`) |
| 422 | Community post or comment blocked (`post_blocked`, extra: `supportNeeded`, `helplines`) |
| 429 | Rate limited (120 requests / minute) |

## Public

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ ok, time, ai: "huggingface" \| "lexicon" }`. Call on app start to wake the server. |
| GET | `/helplines` | `{ helplines: Helpline[] }` |

## Profile

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/me` | | `{ user: UserProfile, today: "YYYY-MM-DD" }`. Creates the profile on first call. |
| PATCH | `/v1/me` | `{ displayName?, onboarded? }` | `{ user }` |
| DELETE | `/v1/me` | | 204. Deletes all the user's data. |

## Moods and insights

| Method | Path | Body / query | Response |
|---|---|---|---|
| POST | `/v1/moods` | `{ mood: 1-5, stress: 1-5, note?, screenTimeHours?, tags?: string[] }` | 201 `{ entry: MoodEntry, crisis: bool, helplines: Helpline[], message }` |
| GET | `/v1/moods?days=30` | days 1-90 | `{ moods: MoodEntry[] }` oldest first |
| GET | `/v1/insights?days=7` | days 1-90 | `{ days: {date, mood, stress}[], checkIns, avgMood, avgStress, moodTrend, bestDay, toughestDay, topTags, summary }` |

If `crisis` is true, the app must show the helpline sheet immediately.

On the day's first check-in, tasks already picked for today are dropped if none was completed or skipped, so the next `GET /v1/tasks/today` picks for the new mood.

## Tasks

| Method | Path | Response |
|---|---|---|
| GET | `/v1/tasks/today` | `{ date, state: "struggling"\|"steady"\|"thriving", suggestConsult, hasCheckIn, tasks: AssignedTask[] }`. Chosen once per day; check in first for better picks. |
| POST | `/v1/tasks/:id/complete` | `{ task, coinsAwarded, capped, balance, streak }` |
| POST | `/v1/tasks/:id/skip` | `{ task }` |

## Coins and rewards

| Method | Path | Response |
|---|---|---|
| GET | `/v1/coins` | `{ balance, streak, bestStreak, earnedToday, dailyCap, transactions: CoinTransaction[] }` |
| GET | `/v1/rewards` | `{ balance, rewards: (Reward & { owned })[] }` |
| POST | `/v1/rewards/:id/redeem` | `{ balance, unlockedRewards, reward }` |

## Community

Author uids are never returned. Each item has `mine: bool`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/v1/community/topics` | | `{ topics: string[] }` |
| GET | `/v1/community/posts` | `?limit=20&before=<ISO>` | `{ posts: PublicPost[], nextBefore }` |
| POST | `/v1/community/posts` | `{ text: 3-1000, topic? }` | 201 `{ post, supportNeeded, helplines }` or 422 |
| POST | `/v1/community/posts/:id/like` | | `{ liked, likeCount }` (toggles) |
| POST | `/v1/community/posts/:id/report` | | `{ reported, hidden }`. Hidden at 3 reports. |
| GET | `/v1/community/posts/:id/comments` | | `{ comments: PublicComment[] }` |
| POST | `/v1/community/posts/:id/comments` | `{ text: 1-500 }` | 201 `{ comment, supportNeeded, helplines }` or 422 |

## Consultations (demo data)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/consultants` | | `{ consultants: (Consultant & { slots: ISO[] })[] }` |
| POST | `/v1/bookings` | `{ consultantId, slot, note? }` | 201 `{ booking }` or 409 `slot_taken` |
| GET | `/v1/bookings` | | `{ bookings: Booking[] }` |

Types are defined in [src/domain/types.ts](../src/domain/types.ts).
