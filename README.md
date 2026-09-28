# 🎵 Spotify & ListenBrainz History Analyzer

Welcome to my personal project! This is a simple, fast, and completely private tool to analyze your **Spotify Extended Streaming History** and fill the recent gaps using **ListenBrainz**.

## 🚀 The Web App (Recommended)
This repository contains a modern, client-side web application that lets you visualize your data instantly without running any code.

👉 **[Try the Web App Here!](https://itsmrma.github.io/spotify-history-analyzer/)** *(Link will work once GitHub Pages is deployed)*

### Features
* **100% Private**: Everything runs locally in your browser using JavaScript. No data is uploaded to any server.
* **Drag & Drop**: Simply drop your `.zip` file from Spotify directly into the browser.
* **ListenBrainz Integration**: Fetch your recent listening history directly from ListenBrainz to fill the gap between the Spotify data export request date and today.
* **Interactive Dashboard**: View your Top Artists, Top 100 Songs, and your Longest Listening Streaks.
* **Search**: Look up any artist to see your top songs and personal record streaks.

---

## 🐍 Legacy Python Scripts
Initially, this project started as a collection of Python scripts. **They are now deprecated** and have been entirely superseded by the Web App. I keep them here for historical reference and in case you prefer using the terminal.

* `listenbrainz.py`: Connects to ListenBrainz API to download your history starting from a specific date, converting it into the Spotify Extended JSON format.
* `spotify_anal.py`: An interactive terminal script to analyze your listening streaks and top artists.
* `spot_top100.py`: A script focused on calculating your top 100 most played songs across your entire history.

## ⚠️ Disclaimer
This is a personal hobby project. It is not affiliated with Spotify or MetaBrainz/ListenBrainz in any way.
