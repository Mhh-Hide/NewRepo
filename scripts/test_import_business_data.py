"""Synthetic workbook regression checks; contains no internal business records."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import openpyxl


class ImportBusinessDataTests(unittest.TestCase):
    def test_allowlist_references_unknown_results_and_dates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            book = openpyxl.Workbook()
            resources = book.active
            resources.append([f'column-{i}' for i in range(11)])
            resources.append(['2026/11/10', 'Sample Supplier Ltd', None, None,
                              'password=excluded-secret', None, None, None, None,
                              'sk-excluded-credential-123456789'])
            demands = book.create_sheet('demands')
            demands.append([f'column-{i}' for i in range(14)])
            demands.append(['2026/11/11', 'safe-model', None, 'excluded-customer',
                            None, 'https://credential.invalid', None, '2026/11/20', None, None, None, None, '完成', None])
            demands.append(['2026/11/11', 'safe-model', None, '测试客户甲', None, '测试客户甲：语音助手', None, None, None, None, None, None, None, None])
            tests = book.create_sheet('tests')
            tests.append([f'column-{i}' for i in range(26)])
            row = [''] * 26
            row[0], row[2], row[7] = '2026/11/10', 'sample supplier ltd', 'safe-model'
            row[11], row[12], row[17] = '阶段 2 ：平台接入测试', '阶段二已完成', '2026年11月12日'
            tests.append(row)
            source, target = root / 'source.xlsx', root / 'private.json'
            book.save(source)
            subprocess.run([sys.executable, str(Path(__file__).with_name('import-business-data.py')),
                            str(source), str(target)], check=True, capture_output=True)
            data = json.loads(target.read_text())
            self.assertEqual(len(data['suppliers']), 1)
            self.assertEqual(data['channels'][0]['supplierId'], data['suppliers'][0]['id'])
            self.assertEqual(data['matches'][0]['channelId'], data['channels'][0]['id'])
            self.assertEqual(data['channels'][0]['qualityStatus'], 'pending')
            self.assertEqual(data['channels'][0]['connectivityStatus'], 'pending')
            self.assertEqual(data['demands'][0]['status'], 'closed')
            self.assertEqual(data['demandItems'][0]['status'], 'closed')
            self.assertEqual(data['quotes'], [])
            self.assertEqual(data['testExecutions'], [])
            self.assertTrue(data['demandItems'][0]['targetDiscountUnknown'])
            self.assertEqual(data['testTasks'][0]['createdAt'], '2026-11-12T00:00:00.000Z')
            self.assertNotIn('excluded-', target.read_text())
            self.assertIn('测试客户甲', data['demands'][1]['description'])
            self.assertNotIn('测试客户甲', data['demands'][1]['sharedSummary'])


if __name__ == '__main__':
    unittest.main()
