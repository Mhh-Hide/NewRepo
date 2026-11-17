"""Normalize a user-supplied workbook to a PRIVATE local runtime fixture.
Usage: python scripts/import-business-data.py workbook.xlsx /absolute/private/data.json
Requires openpyxl. Never place output in public/, src/, or a tracked directory.
Only allowlisted columns are read; no URLs, credentials or raw rows are exported.
"""
import sys, json, re, hashlib
from pathlib import Path
from datetime import datetime
import openpyxl
source, target = map(Path, sys.argv[1:3])
repo = Path(__file__).resolve().parents[1]
if target.resolve().is_relative_to(repo) and not target.resolve().is_relative_to(repo / 'private-data'):
    raise SystemExit('Output must be outside the repository or in ignored private-data/')
w = openpyxl.load_workbook(source, read_only=True, data_only=True)
now = '2026-11-17T00:00:00.000Z'
def clean(v):
    s = str(v or '').strip()
    if re.search(r'https?://|sk-[\w-]+|bearer\s|api[_ -]?key|password|密码|密钥|token\s*[:=]|KEY\s*[:：=]',s,re.I): return ''
    if re.search(r'[A-Za-z0-9_+/=-]{28,}',s): return ''
    return s[:800]
def shared_requirement(text, customer):
    result = clean(text)
    for name in sorted(re.split(r'[、,，;；/\n]+', clean(customer)), key=len, reverse=True):
        if len(name.strip()) >= 2:
            result = re.sub(re.escape(name.strip()), '客户', result, flags=re.I)
    if re.search(r'售价|销售价|客户报价|客户价|实付|毛利|营收', result):
        return ''
    return result

def ident(prefix, s): return prefix + hashlib.sha256(s.encode()).hexdigest()[:12]
def base(i): return dict(id=i,source='mock',createdAt=now,updatedAt=now)
def date(v):
    if isinstance(v,datetime): return v.isoformat()[:10]+'T00:00:00.000Z'
    s=clean(v)
    m=re.search(r'(20\d\d)[年/.-](\d{1,2})[月/.-](\d{1,2})',s)
    if m:
        try:return datetime(*map(int,m.groups())).isoformat()+'.000Z'
        except ValueError:pass
    return None
suppliers={}; models={}; vendors={}; channels=[]; tasks=[]; rem=[]; demands=[]; items=[]; matches=[]
def supplier(name):
    name=clean(name)
    # Multi-company cells and banking/certificate fragments need human review.
    if not name or any(x in name.lower() for x in ['、','beneficiary','certificate']):return None
    # Only exact source names are merged. Do not guess legal-name/alias relationships.
    existing=next((s for key,s in suppliers.items() if key.casefold()==name.casefold()),None)
    if existing:return existing['id']
    if name not in suppliers:
        short=re.sub(r'(有限责任公司|股份有限公司|有限公司)$','',name)
        if len(short)>32: short=name[:32]
        suppliers[name]={**base(ident('s-x-',name)), 'name':name,'shortCode':short,'status':'enabled','contactName':'','contactEmail':'','contactPhone':'','ownerUserId':'unassigned-proc','cooperationStatus':'potential','supplierCategory':'other','countryOrRegion':'','description':'','contactPosition':'','alternativeContact':'','remark':'','externalAccountStatus':'not_created','createdBy':'u-proc','updatedBy':'u-proc','version':1}
    return suppliers[name]['id']
def model(name, domestic=False):
    name=clean(name)
    if not name:return None
    if name not in models:
        vid='v-x-domestic' if domestic else 'v-x-overseas'
        vendors[vid]={**base(vid),'name':'国内模型' if domestic else '海外模型','code':vid,'businessDomain':'domestic' if domestic else 'overseas','status':'enabled'}
        models[name]={**base(ident('m-x-',name)),'vendorId':vid,'name':name,'modelCode':name,'version':'待补充','regionVariant':'domestic' if domestic else 'global','category':'other','status':'enabled'}
    return models[name]['id']
for row in w.worksheets[0].iter_rows(min_row=2,values_only=True): supplier(row[1])
for n,row in enumerate(w.worksheets[2].iter_rows(min_row=2,values_only=True),2):
    sid=supplier(row[2]); name=clean(row[7]) or clean(row[5]); mid=model(name,clean(row[4])=='国产')
    if not sid or not mid:continue
    cid=f'ch-x-{n}'; status=clean(row[12]); phase1=clean(row[13])
    quality='failed' if ('未通过' in phase1 or '兼容问题' in phase1 or '待优化' in status or '复测' in status) else 'passed' if phase1 in ['通过','阶段一通过'] or status=='阶段一已通过' else 'running' if '测试中' in status else 'pending'
    # Stage-two completion alone is NOT an explicit pass; preserve as pending validation.
    channels.append({**base(cid),'supplierId':sid,'modelId':mid,'channelType':'official_proxy' if clean(row[6])=='官转' else 'cloud_self_hosted' if clean(row[6])=='自部署' else 'other','displayName':f'{clean(row[2])} · {name}','opChannelId':None,'modelInvocationName':name,'endpointReference':'','sourceVerificationStatus':'unverified','tpm':None,'rpm':None,'concurrencyLimit':None,'ttftMs':None,'resourceStatus':'enabled','qualityStatus':quality,'connectivityStatus':'pending','integrationStatus':'not_started','availabilityStatus':'closed'})
    for phase in ['quality','connectivity']:
        tasks.append({**base(f't-x-{n}-{phase}'),'createdAt':date(row[17]) or date(row[0]) or now,'updatedAt':date(row[21]) or date(row[18]) or now,'channelId':cid,'testType':phase,'stageLabel':(status if '阶段 2' not in clean(row[11]) else '阶段一历史结果待核对') if phase=='quality' else ((status+'（待核验）') if '阶段 2' in clean(row[11]) else '阶段二待验证'),'status':('completed' if quality in ['passed','failed'] else 'pending') if phase=='quality' else 'pending','assignedTo':None})
    if quality=='failed':
        rem.append({**base(f'rem-x-{n}'),'channelId':cid,'relatedTestExecutionId':None,'description':clean(row[14]) or status,'status':'open','supplierResponse':None,'submittedBy':'u-test','updatedBy':'u-test'})
for n,row in enumerate(w.worksheets[1].iter_rows(min_row=2,values_only=True),2):
    name=clean(row[1]); mid=model(name, bool(re.search('千问|豆包|deepseek|glm|mimo',name,re.I)))
    if not mid:continue
    did=f'd-x-{n}'; title=f'{name} 资源采购'; created=date(row[0]) or now
    demands.append({**base(did),'createdAt':created,'requesterUserId':'unassigned-ops','customerId':None,'status':('closed' if clean(row[12]) in ['完成','已完成'] else 'sourcing'),'demandCode':f'REQ-X-{n:03}','title':title,'sharedTitle':title,'description':clean(row[5]),'sharedSummary':shared_requirement(row[5], row[3]),'priority':'urgent' if clean(row[4])=='紧急' else 'high' if clean(row[4])=='高' else 'normal','dueAt':date(row[7]),'version':1,'createdBy':'unassigned-ops','updatedBy':'unassigned-ops'})
    discount=re.fullmatch(r'(\d+(?:\.\d+)?)折',clean(row[9]))
    items.append({**base(f'di-x-{n}'),'demandId':did,'modelId':mid,'targetPurchaseDiscount':int(float(discount[1])*1000) if discount and 0<=float(discount[1])<=10 else 10000,'targetDiscountUnknown':not bool(discount),'requiredTpm':None,'requiredRpm':None,'requiredTtftMs':None,'requiredConcurrency':None,'status':('closed' if clean(row[12]) in ['完成','已完成'] else 'sourcing')})
    # Only exact model-name matches become candidates; never infer suitability.
    for c in channels:
        if c['modelId']==mid:matches.append({'id':f'match-{n}-{c["id"]}','source':'mock','demandItemId':f'di-x-{n}','channelId':c['id'],'matchStatus':'candidate','createdAt':now})
data=dict(vendors=list(vendors.values()),models=list(models.values()),suppliers=list(suppliers.values()),channels=channels,testTasks=tasks,testExecutions=[],exemptions=[],remediations=rem,demands=demands,demandItems=items,matches=matches,quotes=[],incidents=[],audits=[],customers=[],customerGrants=[],supplierGrants=[{'userId':user,'supplierId':s['id']} for s in suppliers.values() for user in ['u-proc','unassigned-proc']])
target.parent.mkdir(parents=True,exist_ok=True); target.write_text(json.dumps(data,ensure_ascii=False),encoding='utf8'); target.chmod(0o600)
print(json.dumps({k:len(v) for k,v in data.items()},ensure_ascii=False))
