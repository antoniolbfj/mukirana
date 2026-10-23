from pathlib import Path
import re,subprocess,os,tempfile
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('MUKIRANA_TEST_OUTPUT',str(Path(tempfile.gettempdir())/'mukirana-tests')))
INCLUDES={'includeFinanceStyles_':'web/FinanceStyles.html','includeTransfersView_':'transfers/TransfersView.html','includeTransferClient_':'transfers/TransferClient.html','includeFinanceClient_':'web/FinanceClient.html','includeCategoriesView_':'categories/CategoriesView.html','includeCategoryClient_':'categories/CategoryClient.html','includeTransactionsView_':'transactions/TransactionsView.html','includeTransactionClient_':'transactions/TransactionClient.html'}
def render():
 s=(ROOT/'generated/App.html').read_text()
 for _ in range(3):
  for key,path in INCLUDES.items(): s=s.replace('<?!= '+key+'(); ?>',(ROOT/path).read_text())
 assert '<?!=' not in s
 return s
if __name__=='__main__':
 out=OUT;out.mkdir(exist_ok=True,parents=True)
 s=render();(out/'index.html').write_text(s)
 for i,script in enumerate(re.findall(r'<script[^>]*>([\s\S]*?)</script>',s)):
  path=out/f'client-{i}.js';path.write_text(script);subprocess.run(['node','--check',str(path)],check=True)
 for path in ROOT.rglob('*.js'): subprocess.run(['node','--check',str(path)],check=True)
 print('Sintaxe do backend e de todos os scripts da interface válida.')
