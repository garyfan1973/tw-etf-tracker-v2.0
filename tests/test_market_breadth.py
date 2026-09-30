import json
import unittest
from unittest.mock import patch
import fetch_macro_markets as m


def payload(date='20260930', up='828(32)', down='187(0)'):
    return {'stat': 'OK', 'date': date, 'tables': [{}, {
        'fields': ['類型', '整體市場', '股票'],
        'data': [['上漲(漲停)', '9,445(170)', up], ['下跌(跌停)', '4,475(61)', down], ['持平', '1,111', '65']]
    }]}


class BreadthTests(unittest.TestCase):
    def test_uses_stock_column_and_excludes_limit_counts(self):
        self.assertEqual(m.parse_twse_breadth(payload(), '2026-09-30'),
                         {'date': '2026-09-30', 'advances': 828, 'declines': 187, 'unchanged': 65})
        self.assertEqual(m.parse_twse_breadth(payload(up='1,005(32)'), '2026-09-30')['advances'], 1005)

    def test_wrong_date_and_invalid_counts_are_rejected(self):
        for p in [payload(date='20260929'), payload(up='--'), payload(down='-1'), {'stat': 'OK', 'date': '20260930'}]:
            with self.subTest(payload=p), self.assertRaises(ValueError):
                m.parse_twse_breadth(p, '2026-09-30')

    @patch.object(m.time, 'sleep')
    def test_cumulative_dates_deduplicated_fixed_origin_and_corrections(self, _):
        dates = ['2026-09-28', '2026-09-29', '2026-09-30']
        with patch.object(m, 'read_url', side_effect=[json.dumps(payload(d.replace('-', ''), str(up), str(down)))
                                                   for d, up, down in zip(dates, [10, 2, 7], [4, 8, 7])]):
            b = m.update_twse_breadth(None, list(reversed(dates)) + dates)
        self.assertEqual([r['adl'] for r in b['rows']], [6, 0, 0])
        self.assertEqual(b['baseDate'], dates[0])
        with patch.object(m, 'read_url', side_effect=[json.dumps(payload(d.replace('-', ''), '10', '3')) for d in dates]):
            updated = m.update_twse_breadth(b, dates[1:])
        self.assertEqual(updated['baseDate'], dates[0])
        self.assertEqual([r['adl'] for r in updated['rows']], [7, 14, 21])

    @patch.object(m.time, 'sleep')
    def test_expanded_price_history_does_not_move_established_origin(self, _):
        previous = {'baseDate': '2026-09-30', 'rows': []}
        with patch.object(m, 'read_url', return_value=json.dumps(payload())) as read:
            result = m.update_twse_breadth(previous, ['2026-09-29', '2026-09-30'])
        self.assertEqual(read.call_count, 1)
        self.assertEqual(result['baseDate'], '2026-09-30')
        self.assertEqual(result['rows'][0]['adl'], 641)

    @patch.object(m.time, 'sleep')
    def test_falls_back_to_full_official_report(self, _):
        with patch.object(m, 'read_url', side_effect=[OSError('redirect'), json.dumps(payload())]) as read:
            result = m.update_twse_breadth(None, ['2026-09-30'])
        self.assertEqual(result['rows'][0]['adl'], 641)
        self.assertIn('type=ALLBUT0999', read.call_args.args[0])

    @patch.object(m.time, 'sleep')
    def test_missing_session_breaks_adl_until_recovered_and_preserves_old_rows(self, _):
        dates = ['2026-09-28', '2026-09-29', '2026-09-30']
        with patch.object(m, 'read_url', side_effect=[json.dumps(payload('20260928')), OSError('offline'), OSError('offline'), json.dumps(payload())]):
            b = m.update_twse_breadth(None, dates)
        self.assertEqual([r['adl'] for r in b['rows']], [641, None, None])
        self.assertIsNone(b['rows'][1]['advances'])
        with patch.object(m, 'read_url', side_effect=[OSError('offline'), OSError('offline'), json.dumps(payload('20260929')), OSError('offline'), OSError('offline')]):
            recovered = m.update_twse_breadth(b, dates)
        self.assertEqual([r['adl'] for r in recovered['rows']], [641, 1282, 1923])


if __name__ == '__main__':
    unittest.main()
