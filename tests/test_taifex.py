import unittest

from webapp.api._taifex import build_snapshot


class TaifexSnapshotTests(unittest.TestCase):
    def test_keeps_day_and_night_separate_and_selects_front_month(self):
        daily = [
            {"Date":"20260902","Contract":"TX","ContractMonth(Week)":"202610","Last":"24050","Change":"50","%":"0.21%","Volume":"100","TradingSession":"一般"},
            {"Date":"20260902","Contract":"TX","ContractMonth(Week)":"202609","Last":"24000","Change":"-20","%":"-0.08%","Volume":"500","OpenInterest":"800","TradingSession":"一般"},
            {"Date":"20260902","Contract":"TX","ContractMonth(Week)":"202609","Last":"24100","Change":"80","%":"0.33%","Volume":"200","OpenInterest":"-","TradingSession":"盤後"},
            {"Date":"20260902","Contract":"TX","ContractMonth(Week)":"202609/202610","Last":"50","Volume":"10","TradingSession":"一般"},
            {"Date":"20260902","Contract":"MTX","ContractMonth(Week)":"202609","Last":"24010","Change":"-10","%":"-0.04%","Volume":"900","TradingSession":"一般"},
        ]
        institutions = [{"Date":"20260902","ContractCode":"臺股期貨","Item":"外資及陸資","TradingVolume(Net)":"-20","OpenInterest(Long)":"100","OpenInterest(Short)":"300","OpenInterest(Net)":"-200"}]
        ratios = [{"Date":"20260902","PutVolume":"120","CallVolume":"100","PutCallVolumeRatio%":"120.0","PutOI":"90","CallOI":"100","PutCallOIRatio%":"90.0"}]
        result = build_snapshot(daily, institutions, ratios)
        self.assertEqual(result["asOfDate"], "2026-09-02")
        self.assertEqual(result["products"]["TX"]["frontMonth"], "202609")
        self.assertEqual(result["products"]["TX"]["day"]["last"], 24000)
        self.assertEqual(result["products"]["TX"]["night"]["last"], 24100)
        self.assertEqual([row["month"] for row in result["products"]["TX"]["termStructure"]], ["202609", "202610"])
        self.assertEqual(result["institutional"]["rows"][0]["openInterestNet"], -200)
        self.assertEqual(result["putCall"][0]["volumeRatio"], 120.0)


if __name__ == "__main__":
    unittest.main()
