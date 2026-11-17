# Rain

A small installable web app (PWA) with the rain forecast for the Netherlands and Belgium.

- 2-hour rain chart in 5-minute steps; drag across it for a reading
- Longer rain scales (+6h to +48h), temperature, feels like, humidity, wind, UV, sunshine and pollen
- Current conditions from the nearest station, Buienradar's outlook, 5-day forecast
- Place search (NL and BE) and "use my location"
- Works on phones, tablets and desktop; installs to the home screen and loads offline (the weather itself needs a connection)

No build step, no dependencies, no tracking: static files that call the data sources straight from your browser. Your chosen place is kept in your browser's local storage.

## Data

- Weather data: [buienradar.nl](https://www.buienradar.nl) (current conditions, outlook, 5-day forecast, 2-hour rain forecast).
- Longer rain forecasts, temperature, wind, UV, sunshine, pollen and place search: [Open-Meteo.com](https://open-meteo.com), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), free for non-commercial use.
- Reverse lookup of a town name for "use my location": [BigDataCloud](https://www.bigdatacloud.com) client-side API (only used when you tap that button).

This is an unofficial, personal-use project and is not affiliated with or endorsed by Buienradar. Please check the data providers' terms before using it commercially.

## Run locally

    python3 -m http.server 8000

then open <http://localhost:8000>.
