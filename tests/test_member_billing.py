import datetime as dt
import unittest
from lib import member_billing as b
from lib import payments

UID='11111111-1111-1111-1111-111111111111'
NOW='2027-02-14T04:00:00+00:00'
class BillingTests(unittest.TestCase):
    def test_proration_and_downgrade(self):
        current={'plan':{'id':'a','tier':'observation','price_twd':380},'period_start':'2027-01-31T04:00:00Z','period_end':'2027-02-28T04:00:00Z'}
        self.assertEqual(b.change_quote(current,{'id':'b','tier':'research','price_twd':680},NOW)['amount_due'],150)
        current['plan']={'id':'b','tier':'research','price_twd':680}
        self.assertEqual(b.change_quote(current,{'id':'a','tier':'observation','price_twd':380},NOW)['operation'],'downgrade')
    def test_calendar(self):
        feb=b.next_month('2027-01-31T12:00:00+08:00',31)
        self.assertEqual(feb.day,28)
        self.assertEqual(b.next_month(feb,31).day,31)
    def test_no_auth_and_no_monthly_fallback(self):
        self.assertEqual(b.handle('billing_status',{},None,None)[0],401)
        with self.assertRaises(payments.PayError) as error:
            payments.create({'id':UID},{'billing_mode':'monthly'},lambda *a: self.fail('must not access database'))
        self.assertEqual(error.exception.code,'SUBSCRIPTION_PROVIDER_NOT_CONNECTED')
    def summary(self,data,fail=False):
        def rest(path):
            table=path.split('?')[0][1:]
            if table=='member_billing_contracts' and table not in data:return 404,{}
            if fail and table=='member_payment_orders':return 500,{}
            return 200,data.get(table,[])
        return b.legacy_summaries([{'id':UID}],rest,now=NOW)[UID]
    def test_paid_period_is_not_recurring(self):
        p={'id':1,'user_id':UID,'starts_at':'2027-01-31T04:00:00Z','expires_at':'2027-02-28T04:00:00Z'}
        data={'member_subscription_periods':[p],'member_payment_orders':[{'user_id':UID,'period_id':1}]}
        self.assertEqual(self.summary(data)['source'],'one_time')
        self.assertFalse(self.summary(data)['auto_renew'])
        self.assertEqual(self.summary(data,True)['source'],'unknown')
    def test_demo_not_classified_as_paid_subscription(self):
        data={'member_billing_contracts':[{'user_id':UID,'is_test':True,'status':'active','current_period_end':'2027-02-28T04:00:00Z'}]}
        self.assertEqual(self.summary(data)['source'],'free')
        data['member_billing_contracts'][0].update(is_test=False,cancel_at_period_end=True)
        self.assertEqual(self.summary(data)['status'],'已取消續訂')
    def test_metadata_cannot_claim_paid_or_administrator(self):
        result=b.legacy_summaries([{'id':UID,'user_metadata':{'tier':'admin','paid':True}}],lambda path:(200,[]),now=NOW)[UID]
        self.assertEqual(result['source'],'free')

if __name__=='__main__':unittest.main()
