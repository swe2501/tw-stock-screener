/* The late-401 counterexample and session-boundary negative controls are formal tests. */
'use strict';
const {test}=require('node:test'),vm=require('node:vm'),{factory,cases,scenario}=require('./helpers/admin-auth-interleaving.cjs');
for(const name of cases)test(name,async()=>{const create=vm.runInNewContext(factory+';createInteropClient',{Response,Map,JSON,Promise});await scenario(name,create);});
