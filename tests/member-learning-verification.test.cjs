const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),sql=f=>fs.readFileSync(path.join(root,'docs/database',f),'utf8');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,phone text,created_at timestamptz default now(),email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to public;grant execute on function auth.uid() to public;create table public.watchlist(id bigserial primary key,user_id uuid not null,code text not null);`);
 for(const file of ['member-services.sql','member-services-supplement.sql','member-share-unlock.sql','member-share-vouchers.sql','member-voucher-levels.sql','member-task-wallet.sql','member-perks-exchange-v2.sql','member-perks-tasks-v2.sql','member-perks-tasks-v3-points.sql','member-learning-verification.sql','member-learning-catalog-v1.sql','member-learning-verification.sql','member-learning-catalog-v1.sql'])await db.exec(sql(file));
 const uid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,admin=()=>db.exec('reset role'),as=async n=>{await admin();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await db.exec('set role authenticated');};
 const value=async(query,args=[])=>(await db.query(query,args)).rows[0].value;
 const fixture={window:{}};for(const file of ['learning-curriculum.js','learning-more.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'apps/web/assets',file),'utf8'),fixture);
 const A=fixture.window.AcademyLearning;
 await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$2)',[uid(1),JSON.stringify({member_learning:A.lessons.map(l=>l.id),member_learning_challenges:{'2026-W01':{passed:true},'2026-W02':{passed:true},'2026-W03':{passed:true},'2026-W04':{passed:true}}}),uid(2)]);
 assert.equal(await value("select count(*) value from public.member_task_definitions where id in ('learning10-v1','learning30-v1','challenge4-v1','streak7-v1','streak15-v1','streak30-v1') and active"),0,'migration never activates rewards');
 // Enable only inside this throwaway database to exercise claims, never against Supabase.
 await db.exec("update public.member_task_definitions set active=true where id in ('learn-v1','daily-learn-v1','learning3-v1','learning10-v1','learning30-v1','weekly-learn-v1','challenge4-v1')");
 await as(1);let status=await value('select public.member_task_status() value');assert.equal(status.learning_verification,1);assert.ok(status.rows.filter(t=>t.id.startsWith('learning')).every(t=>!t.eligible));
 await assert.rejects(value("select public.claim_member_task('learn-v1') value"),/MEMBER_TASK_INCOMPLETE/,'forged user metadata cannot earn points');
 const lesson=A.lessons[0],answers=Array.from(lesson.quiz,q=>q.answer);
 await assert.rejects(value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers)]),/LEARNING_READ_REQUIRED/);
 await value('select public.member_learning_start($1) value',[lesson.id]);
 await assert.rejects(value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers)]),/LEARNING_READ_REQUIRED/,'client clock cannot skip server reading minimum');
 await admin();await db.query("update public.member_learning_attempts set started_at=clock_timestamp()-interval '31 seconds' where user_id=$1",[uid(1)]);await as(1);
 await assert.rejects(value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers.map(()=>99))]),/LEARNING_INPUT_INVALID/);
 await assert.rejects(value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers.map((q,i)=>(q+1)%lesson.quiz[i].options.length))]),/LEARNING_QUIZ_REQUIRED/);
 let r=await value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers)]);assert.equal(r.duplicate,false);
 r=await value('select public.member_learning_complete($1,$2) value',[lesson.id,JSON.stringify(answers)]);assert.equal(r.duplicate,true);
 const first=await value("select public.claim_member_task('learn-v1') value");assert.equal(first.duplicate,false);assert.equal((await value("select public.claim_member_task('learn-v1') value")).duplicate,true);
 assert.equal(await value('select count(*) value from public.member_learning_completions'),1);
 await assert.rejects(db.query('insert into public.member_learning_completions(user_id,lesson_id,score,total) values($1,$2,1,1)',[uid(1),'kbar']),/permission denied/);
 await assert.rejects(db.query('select * from public.member_learning_catalog'),/permission denied/,'answer keys not accessible by member SQL');
 await as(2);assert.equal(await value('select count(*) value from public.member_learning_completions'),0,'other member cannot read proof');await assert.rejects(value("select public.claim_member_task('learn-v1') value"),/MEMBER_TASK_INCOMPLETE/);
 await as(1);const key=await value(`select to_char(now() at time zone 'Asia/Taipei','IYYY-"W"IW') value`);
 await assert.rejects(value('select public.member_learning_challenge($1,$2) value',['2000-W01','[]']),/LEARNING_WEEK_CHANGED/);
 const ch=fixture.window.AcademyLearningChallenge.current(Date.now()),quizAnswers=Array.from(ch.quiz,q=>q.answer);
 await assert.rejects(value('select public.member_learning_challenge($1,$2) value',[key,JSON.stringify(quizAnswers)]),/LEARNING_LESSONS_REQUIRED/);
 await admin();for(const id of ch.ids){const l=A.lessons.find(l=>l.id===id);await db.query('insert into public.member_learning_completions(user_id,lesson_id,score,total) values($1,$2,$3,$3) on conflict do nothing',[uid(1),id,l.quiz.length]);}await as(1);
 await assert.rejects(value('select public.member_learning_challenge($1,$2) value',[key,JSON.stringify(ch.quiz.map((q)=>(q.answer+1)%q.options.length))]),/LEARNING_QUIZ_REQUIRED/);
 r=await value('select public.member_learning_challenge($1,$2) value',[key,JSON.stringify(quizAnswers)]);assert.equal(r.passed,true);assert.equal(r.challenge_id,ch.id,'server rotation matches website');assert.equal(r.score,ch.quiz.length);
 assert.equal((await value('select public.member_learning_challenge($1,$2) value',[key,JSON.stringify(quizAnswers)])).duplicate,true);
 assert.equal((await value("select public.claim_member_task('weekly-learn-v1') value")).duplicate,false);await assert.rejects(value("select public.claim_member_task('challenge4-v1') value"),/MEMBER_TASK_INCOMPLETE/);
 // Historical dates cannot be injected via RPC; thresholds count distinct server records only.
 await admin();for(const id of A.lessons.slice(0,10).map(l=>l.id))await db.query('insert into public.member_learning_completions(user_id,lesson_id,score,total) values($1,$2,1,1) on conflict do nothing',[uid(1),id]);await as(1);
 status=await value('select public.member_task_status() value');assert.equal(status.rows.find(t=>t.id==='learning10-v1').eligible,true);assert.equal(status.rows.find(t=>t.id==='learning30-v1').eligible,false);
 await admin();await db.query("update public.member_learning_completions set completed_at=now()-interval '1 day' where user_id=$1",[uid(1)]);await as(1);status=await value('select public.member_task_status() value');assert.equal(status.rows.find(t=>t.id==='daily-learn-v1').eligible,false,'daily reward uses Taipei completion date');
 await admin();for(const id of A.lessons.slice(0,30).map(l=>l.id))await db.query('insert into public.member_learning_completions(user_id,lesson_id,score,total) values($1,$2,1,1) on conflict do nothing',[uid(1),id]);
 for(const week of ['2000-W01','2000-W02','2000-W03'])await db.query('insert into public.member_learning_weekly_results(user_id,week_key,challenge_id,score,total) values($1,$2,$3,1,1)',[uid(1),week,ch.id]);await as(1);status=await value('select public.member_task_status() value');assert.equal(status.rows.find(t=>t.id==='learning30-v1').eligible,true);assert.equal(status.rows.find(t=>t.id==='challenge4-v1').eligible,true);
 for(const timestamp of ['2026-12-31T15:59:59Z','2026-12-31T16:00:00Z','2027-01-03T15:59:59Z','2027-01-03T16:00:00Z']){const week=await value(`select to_char($1::timestamptz at time zone 'Asia/Taipei','IYYY-"W"IW') value`,[timestamp]);assert.equal(week,fixture.window.AcademyLearningChallenge.weekInfo(Date.parse(timestamp)).key,'ISO year and Taipei Monday align');}
 console.log('PASS learning verification: repeatable migration, inactive task preservation, forged metadata rejection, server reading time, quiz grading, unique completion/claim, own-only RLS, no member writes/answer reads, weekly rotation/boundary, prerequisites, thresholds and Taipei daily dates.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
