import datetime as dt
import json
import unittest
from unittest.mock import patch

from webapp.api import _intraday_rankings as live
from webapp.api import market_rankings as api


NOW = dt.datetime(2026, 11, 23, 12, 10, tzinfo=live.TAIPEI)


def row(symbol='00981A.TW', **overrides):
    return {'symbol': symbol, 'name': '測試 ETF', 'rank': '1', 'price': '6.20',
            'change': '0.20', 'changePercent': '+3.33%', 'dayHigh': '6.30', 'dayLow': '5.70',
            'volume': '1000000', 'turnoverK': '5800', **overrides}


def store(metric='volume', market='all', **overrides):
    return {'params': {'exchange': live.MARKETS[market], 'sortBy': live.METRICS[metric][1], 'period': '1D', 'offset': 0, 'limit': 100},
            'listMeta': {'rankTime': '2026-11-23T12:09:00+08:00'},
            'pagination': {'resultsTotal': 100}, 'list': [row()], **overrides}


def page(data):
    # Unrelated executable page content must not be evaluated by the parser.
    return '<script>ignored();var x={"TableStore":' + json.dumps({'main-0-StockRanking': data}) + '}; throw new Error("not executed");</script>'


class IntradayRankingsTests(unittest.TestCase):
    def test_snapshot_uses_actual_cumulative_amount_and_source_timestamp(self):
        p = live.parse_snapshot(page(store()), 'volume', 'all', NOW)
        self.assertEqual(p['quoteType'], 'intradaySnapshot')
        self.assertEqual(p['sourceTime'], '2026-11-23T12:09:00+08:00')
        self.assertEqual(p['rankingScope'], 'providerTop100')
        self.assertEqual(p['rows'][0]['turnover'], 5800000)
        self.assertNotEqual(p['rows'][0]['turnover'], p['rows'][0]['close'] * p['rows'][0]['volume'])
        self.assertEqual(p['rows'][0]['spread'], .6)
        self.assertEqual(p['rows'][0]['changePct'], 3.33)

    def test_all_six_modes_and_both_exchanges_have_independent_scope(self):
        for metric in live.METRICS:
            for market in live.MARKETS:
                with self.subTest(metric=metric, market=market):
                    data = store(metric, market, list=[row('6488.TWO' if market == 'TPEX' else '2330.TW')])
                    p = live.parse_snapshot(page(data), metric, market, NOW)
                    self.assertEqual(p['market'], market)
                    self.assertEqual(p['metric'], metric)

    def test_stale_prior_session_future_and_unzoned_timestamps_are_rejected(self):
        for timestamp in ['2026-11-20T13:30:00+08:00', '2026-11-23T12:04:59+08:00',
                          '2026-11-23T12:12:00+08:00', '2026-11-23T12:09:00']:
            with self.subTest(timestamp=timestamp), self.assertRaises(ValueError):
                live.parse_snapshot(page(store(listMeta={'rankTime': timestamp})), 'volume', 'all', NOW)

    def test_wrong_metric_market_period_or_page_is_not_reused_as_selected_ranking(self):
        for field, value in [('exchange', 'TAI'), ('sortBy', '-price'), ('period', '1W'), ('offset', 100), ('limit', 200)]:
            p = store();p['params'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                live.parse_snapshot(page(p), 'volume', 'all', NOW)
        with self.assertRaises(ValueError):
            live.parse_snapshot('<html>Unavailable</html>', 'volume', 'all', NOW)

    def test_filters_fx_and_derivatives_and_preserves_zero_changes(self):
        p = live.parse_snapshot(page(store(list=[row(change='0', changePercent='0%'), row('00636K.TW'), row('030001.TW')])), 'volume', 'all', NOW)
        self.assertEqual(len(p['rows']), 1)
        self.assertEqual(p['sourceRows'], 3)
        self.assertEqual(p['rows'][0]['changePct'], 0)
        with self.assertRaises(ValueError):
            live.parse_snapshot(page(store(market='TPEX', list=[row('2330.TW')])), 'volume', 'TPEX', NOW)
        for bad in [row(turnoverK='—'), row(rank='101'), row(volume='0')]:
            with self.subTest(row=bad), self.assertRaises(ValueError):
                live.parse_snapshot(page(store(list=[bad])), 'volume', 'all', NOW)

    def test_an_empty_source_list_is_valid_only_when_source_total_is_zero(self):
        p = store(list=[], pagination={'resultsTotal': 0})
        self.assertEqual(live.parse_snapshot(page(p), 'volume', 'all', NOW)['rows'], [])
        with self.assertRaises(ValueError):
            live.parse_snapshot(page(store(list=[])), 'volume', 'all', NOW)

    def test_handler_falls_back_as_a_whole_without_mixing_live_and_close_fields(self):
        instance = api.handler.__new__(api.handler)
        instance.path = '/api/market_rankings?mode=live&metric=volume&market=all'
        sent = [];instance.send_json = lambda payload, status: sent.append((payload, status))
        closing = {'quoteType': 'officialClose', 'rows': [{'close': 100, 'volume': 2000}]}
        with patch.object(api, '_cache', {}), patch.object(api, 'load_snapshot', side_effect=ValueError('stale')), patch.object(api, 'saved_snapshot', return_value=closing):
            instance.do_GET()
        self.assertEqual(sent[0][1], 200)
        self.assertEqual(sent[0][0]['rows'], closing['rows'])
        self.assertTrue(sent[0][0]['intradayUnavailable'])

    def test_official_close_uses_saved_snapshot_without_slow_upstream_requests(self):
        saved = {'quoteType': 'officialClose', 'asOf': '2026-11-20', 'rows': []}
        with patch.object(api, 'saved_snapshot', return_value=saved), patch.object(api, 'build_payload') as fetch:
            self.assertEqual(api.closing_payload(), {**saved, 'fallback': True})
            fetch.assert_not_called()

    def test_handler_does_not_share_cached_rankings_between_markets(self):
        instance = api.handler.__new__(api.handler)
        sent = [];instance.send_json = lambda payload, status: sent.append(payload)
        with patch.object(api, '_cache', {}), patch.object(api, 'load_snapshot', side_effect=lambda metric, market: {'market': market}) as fetch:
            for market in ['all', 'TPEX', 'all']:
                instance.path = '/api/market_rankings?mode=live&metric=volume&market=' + market
                instance.do_GET()
            self.assertEqual(fetch.call_count, 2)
        self.assertEqual([p['market'] for p in sent], ['all', 'TPEX', 'all'])

    def test_invalid_source_parameters_are_rejected_before_fetching(self):
        instance = api.handler.__new__(api.handler)
        sent = [];instance.send_json = lambda payload, status: sent.append(status)
        instance.path = '/api/market_rankings?mode=live&market=unknown'
        with patch.object(api, 'load_snapshot') as fetch:
            instance.do_GET();fetch.assert_not_called()
        self.assertEqual(sent, [400])


if __name__ == '__main__':
    unittest.main()
