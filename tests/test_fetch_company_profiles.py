import unittest
from unittest import mock

from fetch_company_profiles import build_company_profile, fetch_tpex_profiles


class CompanyProfilesTests(unittest.TestCase):
    def test_fetch_tpex_profiles_indexes_records_by_company_code(self):
        rows = [
            {"SecuritiesCompanyCode": "6223", "SecuritiesIndustryCode": "24"},
            {"SecuritiesCompanyCode": "", "SecuritiesIndustryCode": "24"},
        ]
        with mock.patch("fetch_company_profiles.get_json", return_value=rows):
            self.assertEqual(fetch_tpex_profiles(), {"6223": rows[0]})

    def test_tpex_holding_gets_semiconductor_industry(self):
        holding = {"code": "6223", "name": "旺矽", "market": "TW"}
        result = build_company_profile(
            holding,
            twse={},
            tpex={"6223": {"SecuritiesIndustryCode": "24"}},
        )
        self.assertEqual(result["industry"], "半導體業")
        self.assertEqual(result["source"], "櫃檯買賣中心")

    def test_missing_taiwan_company_is_not_mislabeled_as_overseas(self):
        holding = {"code": "9999", "name": "測試公司", "market": "TW"}
        result = build_company_profile(holding, twse={}, tpex={})
        self.assertEqual(result["business"], "尚無可用公開摘要。")


if __name__ == "__main__":
    unittest.main()
