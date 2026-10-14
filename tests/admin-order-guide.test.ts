import test from 'node:test';
import assert from 'node:assert/strict';
import {adminOrderGuide} from '../lib/admin-order-guide';
import {transitions} from '../lib/workflow';

test('owner sees the correct next task from review to delivery',()=>{
 const expected={AWAITING_REVIEW:'approve',UNDER_REVIEW:'approve',APPROVED:'request-payment',AWAITING_PAYMENT:'confirm-payment',PAYMENT_VERIFICATION:'confirm-payment',PAYMENT_RECEIVED:'processing',PROCESSING:'preparing',PREPARING_SHIPMENT:'ship',SHIPPED:'deliver',OUT_FOR_DELIVERY:'deliver',REFUND_PENDING:'refund-record'};
 for(const [status,action] of Object.entries(expected))assert.equal(adminOrderGuide(status,'OWNER').action,action);
 for(const status of ['DELIVERED','CANCELLED','REJECTED','REFUNDED','DRAFT'])assert.equal(adminOrderGuide(status,'OWNER').action,undefined);
});
test('read-only staff cannot see order or payment actions',()=>{
 for(const status of Object.keys(transitions))for(const role of ['CUSTOMER_SUPPORT','PRODUCT_MANAGER'] as const){const guide=adminOrderGuide(status,role);assert.equal(guide.action,undefined);assert.deepEqual(guide.other,[]);}
});
