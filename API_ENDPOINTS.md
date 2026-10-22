# SportAPI endpoints used by Matchday

The app uses the RapidAPI host `sportapi7.p.rapidapi.com` with `X-RapidAPI-Key`, `X-RapidAPI-Host`, and `Accept: application/json` headers. The base path is `/api/v1`.

## App flows

| Screen / feature | Method and path | Notes |
| --- | --- | --- |
| Live scores | `GET /sport/football/events/live` | Refresh on a 30 second interval while Live is selected. |
| Daily fixtures | `GET /category/{id}/scheduled-events/{YYYY-MM-DD}` | Aggregates the main European football regions and filters to the device's local date. |
| Match centre | `GET /event/{id}` | Full event, status, teams, tournament and score context. |
| Match timeline | `GET /event/{id}/incidents` | Goals, cards, substitutions and other incidents. |
| Match statistics | `GET /event/{id}/statistics` | Possession, shots, passes and other available team stats. |
| Points picks | Local device storage | Picks are saved with AsyncStorage; this version does not use payment or bookmaker endpoints. |

## Useful next endpoints

| Feature | Method and path |
| --- | --- |
| Countries/regions with fixtures | `GET /sport/football/{date}/{timezoneOffset}/categories` |
| One region's fixtures | `GET /category/{id}/scheduled-events/{date}` |
| Confirmed lineups | `GET /event/{id}/lineups` |
| League table | `GET /unique-tournament/{id}/season/{seasonId}/standings/total` |
| Search teams/players/competitions | `GET /search/{query}` (confirm the exact Search operation in the RapidAPI endpoint catalog before enabling; this family has multiple search routes) |
| Team profile and results | `GET /team/{id}` and documented team event routes |
| Head-to-head | `GET /event/{customId}/h2h/events` |

In a read-only check on October 18, 2026, the RapidAPI host returned 404 for `/sport/football/scheduled-events/{date}` and the sport-wide categories route, while the documented category schedule route returned events. The app therefore loads England, France, Germany, Italy, Spain, and Europe category feeds, combines their events, removes duplicates, and filters them to the device's local date. This covers the supported major European categories; the provider's current gateway does not expose the all-category index needed to promise every world fixture. It caches the day's response in memory so changing tabs does not repeat those calls. Event details, lineups, statistics, incidents, standings, images and search should be called on demand instead of polling every match. See [SportAPI's RapidAPI endpoint catalog](https://rapidapi.com/rapidsportapi/api/sportapi7/playground/apiendpoint_b36bf99f-17be-468c-8f95-be27dfcffab0).

## Credential handling

Set `EXPO_PUBLIC_RAPIDAPI_KEY` in `.env.local` for local development. Expo embeds `EXPO_PUBLIC_*` variables into the application bundle; for a production release, move RapidAPI calls behind a small server endpoint and keep the RapidAPI key on that server. Never commit `.env.local`.
