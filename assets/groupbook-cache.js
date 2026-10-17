(function(root){
  root.createGroupBookCache=function(fetcher,now){
    var entries=new Map(),pending=new Map(),ttl=300000;now=now||Date.now;
    return function(windowDays){
      var key=String(windowDays),entry=entries.get(key);
      if(entry&&now()-entry.at<ttl)return Promise.resolve(entry.data);
      if(pending.has(key))return pending.get(key);
      var request=Promise.resolve().then(function(){return fetcher(windowDays)}).then(function(data){
        if(!data||!Array.isArray(data.groups))throw Error('統計資料格式異常');
        entries.set(key,{data:data,at:now()});return data;
      }).finally(function(){pending.delete(key)});
      pending.set(key,request);return request;
    };
  };
})(typeof window==='undefined'?globalThis:window);
