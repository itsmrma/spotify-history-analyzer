import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from history_utils import get_artist_track_and_date, load_history
from listenbrainz import convert_listen, estrai_da_listenbrainz_per_data
from spotify_anal import get_all_streaks
from spot_top100 import top_100_songs


class LegacyTests(unittest.TestCase):
    def test_invalid_entries_do_not_crash(self):
        for entry in [None, [], 123, {}, {'artistName': 'A', 'trackName': 'T', 'msPlayed': '60000'}]:
            self.assertEqual(get_artist_track_and_date(entry), (None, None, 0, None))
        entry = {'artistName': 'A', 'trackName': 'T', 'msPlayed': 60000, 'endTime': '2026-02-30 12:30'}
        self.assertEqual(get_artist_track_and_date(entry), ('A', 'T', 60000, None))

    def test_loader_ignores_objects_and_handles_uppercase_bom_and_broken_files(self):
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            Path(folder, 'history.JSON').write_text(json.dumps([{'artistName': 'A', 'trackName': 'T', 'msPlayed': 60000}, None]), encoding='utf-8-sig')
            Path(folder, 'account.json').write_text('{}')
            Path(folder, 'broken.json').write_text('{')
            self.assertEqual(len(load_history(folder)), 2)
            top_100_songs(folder)  # Invalid records must not crash the CLI either.

    def test_streaks_deduplicate_days_and_skip_invalid_dates(self):
        streaks = get_all_streaks(['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-01', 'bad'])
        self.assertEqual([streak[2] for streak in streaks], [3])

    def test_durations_are_measured_or_explicitly_estimated(self):
        listen = {'listened_at': 1772366400, 'track_metadata': {'artist_name': 'A', 'track_name': 'T', 'additional_info': {'duration': 150}}}
        self.assertEqual(convert_listen(listen)['ms_played'], 150000)
        listen['track_metadata']['additional_info'] = {}
        self.assertTrue(convert_listen(listen)['duration_estimated'])
        self.assertIsNone(convert_listen({'listened_at': None}))

    def test_downloader_uses_utc_and_encoded_username_and_stops_at_boundary(self):
        body = {'payload': {'listens': [{'listened_at': 1772323200, 'track_metadata': {'artist_name': 'A', 'track_name': 'T'}}]}}
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            previous = os.getcwd()
            try:
                os.chdir(folder)
                with patch('listenbrainz.urlopen', return_value=io.BytesIO(json.dumps(body).encode())) as request:
                    filename = estrai_da_listenbrainz_per_data('test user', '2026-03-01')
                self.assertIsNotNone(filename)
                self.assertIn('test%20user', request.call_args.args[0].full_url)
                self.assertEqual(request.call_args.kwargs['timeout'], 30)
                self.assertEqual(request.call_count, 1)
                self.assertEqual(json.loads(Path(filename).read_text())[0]['ts'], '2026-03-01T00:00:00Z')
            finally:
                os.chdir(previous)

    def test_stalled_download_does_not_write_partial_history(self):
        body = {'payload': {'listens': [{'listened_at': 1772366400, 'track_metadata': {'artist_name': 'A', 'track_name': 'T'}}]}}
        with tempfile.TemporaryDirectory() as folder, redirect_stdout(io.StringIO()):
            previous = os.getcwd()
            try:
                os.chdir(folder)
                with patch('listenbrainz.urlopen', side_effect=lambda *args, **kwargs: io.BytesIO(json.dumps(body).encode())), patch('listenbrainz.time.sleep'):
                    self.assertIsNone(estrai_da_listenbrainz_per_data('test', '2026-03-01'))
                self.assertEqual(list(Path(folder).iterdir()), [])
            finally:
                os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
