# Matchday

Football live scores built with Expo and React Native, using SportAPI on RapidAPI.

Today and Scores combine same-day fixtures from the supported major European categories. The RapidAPI schedule aggregator is currently returning 404, so the app uses the available per-category schedule route instead.

The Bet tab is a local, points-only prediction area. Picks stay on the device; the app does not accept deposits or pay out winnings.

## Run locally

```sh
npm install
npm start
```

The local RapidAPI key is read from `.env.local`, which is ignored by Git. If you replace it, use the `EXPO_PUBLIC_RAPIDAPI_KEY` variable shown in `.env.example` and restart Expo. Expo public variables are bundled into the client app; production builds should call SportAPI through a server-side proxy so the RapidAPI key is not extractable from the app.

See [API_ENDPOINTS.md](./API_ENDPOINTS.md) for the endpoint map and suggested feature extensions.
