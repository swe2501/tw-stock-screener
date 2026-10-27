/* Learning rewards use server-created evidence, never editable profile progress. */
(() => {
 'use strict';
 const errors={LEARNING_UNAVAILABLE:'學習核驗尚未開放，閱讀與個人已讀標記仍可使用。',LEARNING_READ_REQUIRED:'請先展開文章閱讀至少 30 秒，並在 24 小時內完成核驗。',LEARNING_QUIZ_REQUIRED:'請完成文章測驗，答對至少八成後再確認。',LEARNING_INPUT_INVALID:'請先回答所有測驗題目。',LEARNING_WEEK_CHANGED:'本週挑戰已更新，請重新開啟學習中心。',LEARNING_LESSONS_REQUIRED:'請先完成本週指定文章的閱讀核驗。'};
 async function rpc(name,body){
  const owner=localStorage.getItem('sb_token');if(!owner)throw Error('請先登入會員');
  if(window.AcademyPhoneGate&&!await window.AcademyPhoneGate.ensure())throw Error('請先完成手機驗證');
  if(owner!==localStorage.getItem('sb_token'))throw Error('帳號已切換，請重新開啟學習中心');
  let response;try{response=await fetch(SIG_SB_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SIG_SB_ANON,Authorization:'Bearer '+owner,'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{throw Error('核驗結果尚未確認，請稍後重試；同一篇文章與同週挑戰不會重複建立完成紀錄。');}
  const r=await response.json();if(owner!==localStorage.getItem('sb_token'))throw Error('帳號已切換，請重新開啟學習中心');
  if(!response.ok)throw Error(errors[r.message]||(response.status===404?'學習核驗服務準備中，閱讀與個人已讀標記仍可使用。':'目前無法確認學習核驗結果，請稍後再試。'));
  return r;
 }
 window.AcademyLearningVerification={start:id=>rpc('member_learning_start',{p_lesson_id:id}),complete:(id,answers)=>rpc('member_learning_complete',{p_lesson_id:id,p_answers:answers}),challenge:(week,answers)=>rpc('member_learning_challenge',{p_week_key:week,p_answers:answers})};
})();
