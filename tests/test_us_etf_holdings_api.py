import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("us_etf_holdings", Path(__file__).parents[1] / "webapp/api/us_etf_holdings.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class UsEtfHoldingsTest(unittest.TestCase):
    def test_fund_record_and_latest_filing(self):
        record = MODULE.fund_record({"fields":["cik","seriesId","classId","symbol"], "data":{"0":[123,"S1","C1","VOO"]}}, "voo")
        self.assertEqual(record["seriesId"], "S1")
        filing = MODULE.latest_filing({"hits":{"hits":[
            {"_source":{"form":"NPORT-P","ciks":["0000123"],"adsh":"old","period_ending":"2026-03-31","file_date":"2026-05-01"}},
            {"_source":{"form":"NPORT-P","ciks":["123"],"adsh":"new","period_ending":"2026-06-30","file_date":"2026-08-01"}},
        ]}}, 123)
        self.assertEqual(filing["adsh"], "new")

    def test_parse_nport(self):
        xml = b'''<edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData><genInfo><regName>Test Registrant</regName><seriesName>Test ETF</seriesName><seriesId>S1</seriesId><repPdDate>2026-06-30</repPdDate></genInfo><fundInfo><totAssets>110</totAssets><totLiabs>10</totLiabs><netAssets>100</netAssets><invstOrSecs><invstOrSec><name>Alpha Inc</name><title>Common</title><cusip>001</cusip><identifiers><isin value="US001"/></identifiers><balance>20</balance><units>NS</units><curCd>USD</curCd><valUSD>60</valUSD><pctVal>60</pctVal><assetCat>EC</assetCat><issuerCat>CORP</issuerCat><invCountry>US</invCountry></invstOrSec><invstOrSec><name>Cash</name><balance>40</balance><units>PA</units><curCd>USD</curCd><valUSD>40</valUSD><pctVal>40</pctVal></invstOrSec></invstOrSecs></fundInfo></formData></edgarSubmission>'''
        parsed = MODULE.parse_nport(xml, "S1")
        self.assertEqual(parsed["fundSize"], 100)
        self.assertEqual(parsed["registrantName"], "Test Registrant")
        self.assertEqual(parsed["holdings"][0]["shares"], 20)
        self.assertEqual(parsed["holdings"][1]["shares"], None)
        with self.assertRaises(ValueError):
            MODULE.parse_nport(xml, "S2")


if __name__ == "__main__":
    unittest.main()
