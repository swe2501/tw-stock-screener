/* Node VM runs the real inline refresh/admin transport against mock fetch. */
'use strict';
const {test}=require('node:test'),vm=require('node:vm'),{factory,cases,scenario}=require('./helpers/admin-auth-fixture.cjs');
for(const name of cases)test(name,async()=>{const createClient=vm.runInNewContext(factory+';createClient',{Response,Map,JSON,Promise});await scenario(name,createClient);});
