(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const paths = {
    building:'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 12h.01M15 12h.01',
    chart:'M4 19V5M4 19h17M7 14l4-5 4 3 5-7',
    search:'M16 16l5 5M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Z',
    bulb:'M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 2H9Z',
    layers:'m3 8 9-5 9 5-9 5ZM3 12l9 5 9-5M3 16l9 5 9-5',
    pen:'m4 20 4-1L20 7l-3-3L5 16ZM14 7l3 3',
    code:'m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    database:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3ZM4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',
    check:'m8 12 3 3 6-7M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6Z',
    shield:'M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6ZM12 8v5M12 16h.01',
    megaphone:'m4 10 15-6v16L4 14ZM4 10v4M8 16l1 5h3l-2-5',
    users:'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-3c0-4 14-4 14 0v3M19 5c4 0 4 6 0 6M3 5c-4 0-4 6 0 6',
    link:'m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 7l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
    wallet:'M20 7V5H4v15h16V7H4M20 11h-6v5h6M16 13h.01',
    scales:'M12 3v18M7 21h10M4 6h16M4 6l-3 8h6ZM20 6l-3 8h6Z',
    book:'M12 6C9 3 4 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 2ZM12 6v15',
    box:'m3 7 9-4 9 4-9 5ZM3 7v10l9 4 9-4V7M12 12v9M7 5l10 5'
  };
  function icon(name){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="'+paths[name]+'"/></svg>'; }
  const groups = ['決策與情報','創新與產品','技術與品質','營運與支持'];
  const departments = [
    {name:'總經理辦公室',group:0,icon:'building',en:'EXECUTIVE OFFICE',text:'統整公司方向與跨部門任務，彙整需要你與合夥人決定的事項。',kind:'meeting'},
    {name:'策略與商業分析部',group:0,icon:'chart',en:'BUSINESS INTELLIGENCE',text:'整合商業模式、定價、成本與成長分析，讓每項決策有依據。',kind:'data'},
    {name:'市場與使用者研究部',group:0,icon:'search',en:'MARKET & USER RESEARCH',text:'觀察市場、競品與使用者需求，將調查結果轉化為產品機會。',kind:'meeting'},
    {name:'創意與創新研發部',group:1,icon:'bulb',en:'CREATIVE LAB',text:'探索新產品與新服務，以小型原型驗證想法，再決定是否投入開發。',kind:'creative'},
    {name:'產品管理部',group:1,icon:'layers',en:'PRODUCT MANAGEMENT',text:'把需求整理為可執行規格，規劃優先順序、產品路線與驗收條件。',kind:'meeting'},
    {name:'品牌與體驗設計部',group:1,icon:'pen',en:'BRAND & EXPERIENCE',text:'維持先見的視覺語言，設計介面、互動、文案與深淺色體驗。',kind:'creative'},
    {name:'工程與 AI 技術部',group:2,icon:'code',en:'ENGINEERING & AI',text:'建置網站與 AI 功能，串接資料庫及工具，落實產品規格。',kind:'engineering'},
    {name:'資料與金融研究部',group:2,icon:'database',en:'DATA & FINANCIAL RESEARCH',text:'核對行情、籌碼與 ETF 資料，維護計算定義、品質及資料來源。',kind:'data'},
    {name:'品質與測試部',group:2,icon:'check',en:'QUALITY ASSURANCE',text:'獨立驗證功能、畫面與效能，檢查改版是否影響既有使用流程。',kind:'engineering'},
    {name:'資安與系統維運部',group:2,icon:'shield',en:'SECURITY & OPERATIONS',text:'管理權限、監控、備份與服務穩定性，追蹤系統異常。',kind:'data'},
    {name:'行銷與成長部',group:3,icon:'megaphone',en:'MARKETING & GROWTH',text:'規劃品牌推廣、內容與活動，追蹤轉換和成效。',kind:'creative'},
    {name:'會員服務與成功部',group:3,icon:'users',en:'MEMBER EXPERIENCE',text:'整理會員問題與回饋，協助教學、使用流程和長期服務品質。',kind:'work'},
    {name:'業務與合作發展部',group:3,icon:'link',en:'PARTNERSHIPS',text:'研究企業方案、商業合作與通路，彙整合作機會。',kind:'meeting'},
    {name:'財務與行政部',group:3,icon:'wallet',en:'FINANCE & ADMINISTRATION',text:'管理預算與成本紀錄，追蹤 AI 用量、採購及內部資源。',kind:'work'},
    {name:'法遵與風險管理部',group:3,icon:'scales',en:'COMPLIANCE & RISK',text:'協助初審內容、個資與授權風險，重要法律事項交由專業人士確認。',kind:'meeting'},
    {name:'組織與知識管理部',group:3,icon:'book',en:'KNOWLEDGE & ORGANIZATION',text:'維護部門職責、工作規範與知識庫，讓任務有紀錄、交接有脈絡。',kind:'library'},
    {name:'供應鏈與物流部',group:3,icon:'box',en:'SUPPLY CHAIN & LOGISTICS',text:'預留供應商、庫存、配送與退貨的未來空間。目前停用，未連接任何物流服務。',kind:'logistics',off:true}
  ];
  window.ForesightOfficeDesign={departments,icon};
})();
