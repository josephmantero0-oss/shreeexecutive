// Locked per-room URL detection
const urlParams = new URLSearchParams(window.location.search);
const lockedRoom = (urlParams.get('room') || urlParams.get('r') || '').trim();
const isRoomLocked = Boolean(lockedRoom);
let S=null;

let guestOrders = [], trackSheetOpen = false, dismissedOrderIds = new Set(), reviewBoxState = {};
function getMyStoredOrderIds() {
  try {
    const list = JSON.parse(localStorage.getItem('se_my_orders') || '[]');
    return Array.isArray(list) ? list.map(x => (typeof x === 'string' ? x : x.id)).filter(Boolean) : [];
  } catch(e) { return []; }
}
function addMyStoredOrderId(id) {
  try {
    const list = JSON.parse(localStorage.getItem('se_my_orders') || '[]');
    const next = [{ id, time: Date.now() }, ...list.filter(x => (typeof x === 'string' ? x : x.id) !== id)].slice(0, 20);
    localStorage.setItem('se_my_orders', JSON.stringify(next));
  } catch(e) {}
}
function isOrderActiveForGuest(o) {
  if (!o) return false;
  if (dismissedOrderIds.has(o.id)) return false;
  const st = o.status || 'pending';
  if (st === 'pending' || st === 'accepted' || st === 'in_progress' || st === 'preparing' || st === 'ready') return true;
  if (st === 'delivered' || st === 'completed' || st === 'rejected') {
    const fin = new Date(o.updated_at || o.updatedAt || o.created_at || o.createdAt).getTime();
    return (Date.now() - fin) < 10 * 60 * 1000; // 10 minutes auto-vanish
  }
  return false;
}
function getVanishRemainingMinutes(o) {
  const fin = new Date(o.updated_at || o.updatedAt || o.created_at || o.createdAt).getTime();
  const rem = Math.max(0, Math.ceil(10 - (Date.now() - fin) / (60 * 1000)));
  return rem;
}
function getActiveGuestOrders() {
  return guestOrders.filter(isOrderActiveForGuest);
}

function trackBanner(){ return ''; }

function trackUI(){
  if(admin) return '';
  return '<div class="osheet ' + (trackSheetOpen ? 'open' : '') + '" id="tracksheet">'
    + '<div class="oh" style="background:#ffffff !important;border-bottom:1.5px solid #ede5d8 !important;color:#14110F !important">'
    + '<b style="color:#14110F !important;font-weight:800 !important;font-size:1.05rem">🛎️ Live Room Orders & Requests</b>'
    + '<button data-act="closetrack" aria-label="Close" style="color:#14110F !important;font-weight:800 !important;font-size:1.4rem !important;opacity:1 !important;cursor:pointer">✕</button>'
    + '</div>'
    + '<div class="track-sheet-content">'
    + renderGuestOrdersList()
    + '</div></div>';
}

function renderGuestOrdersList(){
  const actives = getActiveGuestOrders();
  if(!actives.length){
    return '<div class="empty-track">'
      + '<h3>No Active Orders</h3>'
      + '<p>Orders you place for food or front desk services will appear here with live updates from staff!</p>'
      + (isRoomLocked ? '<p style="margin-top:10px;font-weight:700;color:#6d8a57">🔒 Tracking updates for Room ' + esc(lockedRoom) + '</p>' : '')
      + '</div>';
  }

  return actives.map(o => {
    const isFood = (o.type === 'restaurant:shreeexecutive' || !o.type || o.type === 'restaurant');
    const st = o.status || 'pending';
    const isRejected = (st === 'rejected');
    const isDone = (st === 'delivered' || st === 'completed');
    const isInProg = (st === 'accepted' || st === 'in_progress' || st === 'preparing');
    const rem = getVanishRemainingMinutes(o);

    let step1Class = 'done';
    let step2Class = isInProg ? 'active' : (isDone ? 'done' : '');
    let step3Class = isDone ? 'done' : '';
    if(isRejected){
      step2Class = 'rejected';
      step3Class = '';
    }

    const timeStr = new Date(o.created_at || o.createdAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});

    return '<div class="track-order-card" data-id="' + o.id + '">'
      + '<div class="toc-head">'
      + '<div>'
      + '<div class="toc-title">' + (isFood ? '🍽️ Food Order' : '🛎️ Service Request') + ' #' + esc(o.id) + '</div>'
      + '<div class="toc-meta">Room: ' + esc(o.room) + ' • Placed at ' + timeStr + '</div>'
      + '</div>'
      + '<span class="tb-tag" style="background:' + (isDone ? '#27ae60' : (isRejected ? '#c0392b' : (isInProg ? '#2980b9' : '#e67e22'))) + '">' + esc(st) + '</span>'
      + '</div>'
      + (isDone ? '<div class="toc-vanish-note">✅ <b>Delivered!</b> Enjoy your stay. (Vanishes in ' + rem + ' min' + (rem>1?'s':'') + ')</div>' : '')
      + (isRejected ? '<div class="toc-vanish-note rej">❌ <b>Order Declined:</b> ' + esc(o.reject_reason || o.rejectReason || 'Unavailable') + '. (Vanishes in ' + rem + ' min' + (rem>1?'s':'') + ')</div>' : '')
      + '<div class="track-steps">'
      + '<div class="ts-step ' + step1Class + '"><div class="ts-circle">✓</div><div class="ts-label">Received</div></div>'
      + '<div class="ts-step ' + step2Class + '"><div class="ts-circle">' + (isRejected ? '✕' : (isInProg ? '⏳' : (isDone ? '✓' : '2'))) + '</div><div class="ts-label">' + (isRejected ? 'Declined' : (isFood ? 'Cooking' : 'In Progress')) + '</div></div>'
      + '<div class="ts-step ' + step3Class + '"><div class="ts-circle">' + (isDone ? '✓' : '3') + '</div><div class="ts-label">Delivered</div></div>'
      + '</div>'
      + (isFood ? (
        '<ul class="toc-items">'
        + (o.items || []).map(it => '<li class="toc-item"><span>' + esc(it.name) + ' × ' + it.q + '</span><b>Rs ' + ((it.price||0)*(it.q||1)) + '</b></li>').join('')
        + '</ul>'
        + (o.total ? '<div class="toc-total"><span style="color:#14110F!important;font-weight:800">Total</span><span style="color:#14110F!important;font-weight:800">Rs ' + o.total + '</span></div>' : '')
      ) : (
        '<div style="font-size:.85rem;margin:8px 0;font-weight:700">' + esc(o.service_title || o.serviceTitle || 'Room Service Request') + '</div>'
      ))
      + (o.note ? '<div class="toc-note"><b>Note:</b> ' + esc(o.note) + '</div>' : '')
      + (o.guest_feedback ? '<div class="toc-note" style="border-left:3px solid #9b59b6;color:#6c3483"><b>⭐' + (o.guest_star ? o.guest_star+'/5 ' : '') + 'Guest Feedback:</b> ' + esc(o.guest_feedback) + '</div>' : '')
      + (isDone && S.review ? (() => {
        const rs = reviewBoxState[o.id];
        if(rs && rs.status === 'thanked'){
          return '<div class="toc-review-box" id="revbox_' + esc(o.id) + '">'
            + '<div style="color:#27ae60;font-weight:700;font-size:.85rem;margin-bottom:6px">🎉 Thank you for ' + rs.score + ' stars!</div>'
            + '<div style="font-size:.78rem;color:#555;margin-bottom:10px">Would you take 10 seconds to share your kind review on Google Maps? It means the world to our staff!</div>'
            + '<a class="btn" style="background:#4285f4;color:#fff;display:inline-block;padding:8px 16px;text-decoration:none" href="' + esc(S.review) + '" target="_blank" rel="noopener">⭐ Share on Google Review</a>'
            + '</div>';
        }
        if(rs && rs.status === 'feedback_submitted'){
          return '<div class="toc-review-box" id="revbox_' + esc(o.id) + '">'
            + '<div style="color:#27ae60;font-weight:700;font-size:.85rem">🙏 Thank you! Your feedback has been noted directly for management.</div>'
            + '</div>';
        }
        const showFb = (rs && rs.status === 'feedback_open');
        const curScore = (rs && rs.score) || 0;
        return '<div class="toc-review-box" id="revbox_' + esc(o.id) + '">'
          + '<div class="trb-title">⭐ Rate your experience</div>'
          + '<div class="trb-sub">' + (showFb ? 'We are sorry to hear that. Please let us know how we can make it right:' : 'How was your food and room service?') + '</div>'
          + '<div class="trb-stars" style="' + (showFb ? 'opacity:0.5;' : '') + '">'
          + [1,2,3,4,5].map(s => '<button type="button" class="trb-star-btn" data-act="rateexp" data-score="' + s + '" data-id="' + esc(o.id) + '" aria-label="' + s + ' stars">' + (s <= curScore ? '★' : '★') + '</button>').join('')
          + '</div>'
          + '<div class="trb-feedback" style="display:' + (showFb ? 'block' : 'none') + ';margin-top:10px">'
          + '<textarea class="trb-fb-txt" placeholder="Tell us how we can improve..." rows="2" style="width:100%;font-size:.8rem;padding:6px;border-radius:6px;border:1px solid #ddd;box-sizing:border-box">' + esc((rs && rs.text) || '') + '</textarea>'
          + '<button type="button" class="btn g" style="margin-top:6px;padding:4px 10px;font-size:.75rem" data-act="sendprivfb" data-id="' + esc(o.id) + '">Submit Feedback</button>'
          + '<button type="button" class="btn" style="margin-top:6px;margin-left:6px;padding:4px 10px;font-size:.75rem;background:#eee;color:#333" data-act="cancelprivfb" data-id="' + esc(o.id) + '">Cancel</button>'
          + '</div>'
          + '</div>';
      })() : '')
      + '</div>';
  }).join('');
}

function normalize(){
 S.hotel=S.hotel||{name:'Hotel Shree Executive',tagline:'An Executive Stay',phone:'+91 9876543210',ai_info:'Welcome to Hotel Shree Executive. Premium executive hospitality, banquet facilities, and 24/7 room service.'};
 S.wifi=S.wifi||{name:'ShreeExecutive_Guest',pass:'welcome123'};
 S.rules=S.rules||[];
 S.menu=S.menu||[];
 S.notices=S.notices||[];
 S.review=S.review||'https://www.google.com/search?q=Hotel+Shree+Executive+reviews';
 S.pw=S.pw||'b5568af32829c2152598164f09862ef657c347d654d7c017f58799ca7774b032';
 S.order=S.order||{on:true};
 if(!S.order.food)S.order.food={wa:S.order.wa||'919876543210',sms:S.order.sms||''};
 if(!S.order.desk)S.order.desk={wa:S.order.wa||'919876543210',sms:S.order.sms||''};
 delete S.order.wa;delete S.order.sms;
 S.toil=S.toil||[['Executive Dental Kit'],['Luxury Bath Soap'],['Premium Shampoo'],['Extra Bath Towel'],['Extra Pillow'],['Warm Blanket'],['Executive Shaving Kit'],['Room Slippers']].map((x,i)=>({id:'t'+(i+1),n:x[0],p:'',a:true}))
}
const $=s=>document.querySelector(s),esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,8);
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
let adminTab = 'kitchen', kitchenFilter = 'active', liveOrders = [], soundEnabled = true, lastKnownOrderIds = new Set();

function playChime(){
  if(!soundEnabled || !admin || isRoomLocked)return;
  try{
    const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
    const c=new A(),o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.setValueAtTime(587.33,c.currentTime);
    o.frequency.setValueAtTime(880,c.currentTime+0.12);
    g.gain.setValueAtTime(0.3,c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.6);
    o.connect(g);g.connect(c.destination);
    o.start();o.stop(c.currentTime+0.6);
  }catch(e){}
}
let admin=false,login=false,tab='notices',mcat=0,ci=0,q='',vegOnly=false,delArm=-1;
try{admin=(!isRoomLocked && sessionStorage.getItem('se_admin')==='1')}catch(e){}

const IC={
  wifi:'<path d="M2 9a15 15 0 0120 0M5.5 12.5a10 10 0 0113 0M9 16a5 5 0 016 0"/><circle cx="12" cy="19" r="1"/>',
  menu:'<path d="M3 18h18M5 18a7 7 0 0114 0M12 8V6M10 6h4"/>',
  rules:'<path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  home:'<path d="M3 11l9-7 9 7M5 10v10h14V10"/>',
  bell:'<path d="M6 17h12l-1.5-2V10a4.5 4.5 0 00-9 0v5zM10 20h4"/>',
  bottle:'<path d="M10 3h4v3l2 3v11a1 1 0 01-1 1H9a1 1 0 01-1-1V9l2-3zM8 13h8"/>'
};
const ic=n=>`<svg class="ic" viewBox="0 0 24 24">${IC[n]||''}</svg>`;

const url=u=>/^https?:\/\//i.test(u)?u:'';
function menuBlock(){
 const c=S.menu[mcat]||{items:[]},n=q.toLowerCase();
 const src=q?S.menu.flatMap(x=>x.items):c.items;
 const items=src.filter(it=>(!vegOnly||it.v)&&(!n||(it.n+' '+it.d).toLowerCase().includes(n))).map(it=>`<div class="it ${it.a?'':'off'}"><span class="vd ${it.v?'v':'n'}"></span><div class="im"><div class="nl"><b>${esc(it.n)}</b><i class="ld"></i><span class="pr">${it.a?'₹'+esc(it.p):'Sold out'}</span></div><small>${esc(it.d)}</small></div></div>`).join('')||'<p class="mu">No dishes match.</p>';
 return (q?'':`<div class="pills sticky">${S.menu.map((x,i)=>`<button class="pill ${i===mcat?'on':''}" data-act="cat" data-i="${i}">${esc(x.cat)}</button>`).join('')}</div>`)+items;
}

function getMealContext(){
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if(h >= 6 && h < 11.5) return 'breakfast';
  if(h >= 11.5 && h < 16) return 'lunch';
  if(h >= 16 && h < 19) return 'snacks';
  if(h >= 19 && h < 23) return 'dinner';
  return 'night';
}

const TIME_SUGGESTIONS = {
  breakfast: [
    "Good morning! ☕ A fresh start begins with warm breakfast and hot masala tea.",
    "Executive breakfast: Warm Poha, fresh Upma & steaming hot Chai delivered to your room 🍳",
    "Rise and shine! Start your day energized with our chef's morning specials 🛌🥐",
    "Breakfast is ready! Freshly brewed coffee and hot snacks are just a tap away ☕"
  ],
  lunch: [
    "Lunch time! 🍛 Treat yourself to a hearty Dal Makhani, Butter Chicken or Veg Biryani.",
    "Executive dining: Savor our chef's rich gravies and fragrant biryanis 🍽️",
    "Midday culinary delight: Pair a crisp starter with our signature main course 🥘",
    "Hungry? Our kitchen is firing up delicious royal delicacies for your afternoon meal 👨‍🍳"
  ],
  snacks: [
    "Golden hour relaxation! 🌇 Unwind with crispy Spring Rolls and chilled Lime Soda.",
    "Evening tea time! Hot Masala Chai with crispy bites makes the perfect break ☕",
    "Recharge this evening: Chilled Cold Coffee & tasty starters delivered to your suite 🍹",
    "A quick executive bite: Tap Order Food to enjoy snacks in the comfort of your room."
  ],
  dinner: [
    "Dinner is served! 🌙 Indulge in aromatic Chicken Malai Tikka, Dal Makhani & warm Naan.",
    "Royal evening feast: Treat yourself to our chef's signature dinner specialties 🍽️",
    "Relax and dine in style. Our culinary team has prepared a splendid evening menu 🌟",
    "End the night on a sweet note with warm Gulab Jamun! 🍯"
  ],
  night: [
    "Wishing you a peaceful night 🌙 Our reception is at your service 24/7.",
    "Rest well in comfort. Need anything for your room? Tap Request anytime 🛌",
    "Sweet dreams! Fresh executive breakfast starts tomorrow morning at 7:00 AM ☕"
  ]
};

function getMealItems(meal, allItems){
  if(meal === 'breakfast'){
    const bk = allItems.filter(i => {
      const c = (i.category || '').toLowerCase();
      const n = (i.n || '').toLowerCase();
      return c.includes('breakfast') || c.includes('सकाळ') || n.includes('poha') || n.includes('पोहे') || n.includes('sheera') || n.includes('upma') || n.includes('omelette') || n.includes('puri') || n.includes('chai') || n.includes('tea') || n.includes('coffee');
    });
    if(bk.length) return bk;
  }
  if(meal === 'lunch'){
    const lc = allItems.filter(i => {
      const c = (i.category || '').toLowerCase();
      return c.includes('main') || c.includes('meal') || c.includes('starter') || c.includes('biryani') || c.includes('curry');
    });
    if(lc.length) return lc;
  }
  if(meal === 'snacks'){
    const sn = allItems.filter(i => {
      const c = (i.category || '').toLowerCase();
      const n = (i.n || '').toLowerCase();
      return c.includes('snack') || c.includes('evening') || c.includes('संध्याकाळ') || n.includes('roll') || n.includes('fries') || n.includes('corn') || n.includes('tikka') || n.includes('soda') || n.includes('chai') || n.includes('coffee');
    });
    if(sn.length) return sn;
  }
  if(meal === 'dinner'){
    const dn = allItems.filter(i => {
      const c = (i.category || '').toLowerCase();
      return c.includes('main') || c.includes('meal') || c.includes('starter') || c.includes('biryani') || c.includes('curry');
    });
    if(dn.length) return dn;
  }
  return allItems;
}

const hi=()=>{
  const h=new Date().getHours();
  return h<5||h>=21?['Good night','Rest well. Reception is only a tap away.']:
         h<12?['Good morning','Wishing you a pleasant and productive start to the day.']:
         h<17?['Good afternoon','We hope your stay is going splendidly.']:
         ['Good evening','Welcome back. We are at your service.'];
};

const TIPS=[
  'Tap the keycard to flip it 💳',
  'Tap WiFi for instant network & password access 📶',
  'Looking for recommendations? Try Chef\u2019s choice on the menu ✦',
  'House rules and check-out timings are just below 📜',
  'Enjoying your executive stay? A Google review means a great deal ⭐'
];
let ti=0;

function say(m){
  const b=$('#say');
  if(!b)return;
  b.textContent=m;
  b.classList.remove('pop');
  void b.offsetWidth;
  b.classList.add('pop');
}

function owl(){
  const k=$('#kc');
  if(k)k.classList.toggle('flip');
  const meal = getMealContext();
  const quotes = TIME_SUGGESTIONS[meal] || TIME_SUGGESTIONS.lunch;
  
  // Real live food suggestions from menu
  const all = S.menu.flatMap(c => (c.items||[]).map(i=>({...i, category:c.cat}))).filter(i => i.a && (!vegOnly || i.v));
  const pool = getMealItems(meal, all).filter(i => i.a && (!vegOnly || i.v));
  const foodItems = pool.length ? pool : all;
  
  const foodieSuggestions = foodItems.map(it => {
    const pStr = it.p ? ` (₹${it.p})` : '';
    const descStr = it.d ? ` - ${it.d}` : '';
    const templates = [
      `Craving fine dining? May we suggest the *${it.n}*${pStr}! 🍽️`,
      `Chef's recommendation: *${it.n}*${pStr}${descStr} ✦`,
      `How about fresh *${it.n}*${pStr}? Tap Order Food to order to your room! 🛎️`,
      `Executive favorite: *${it.n}* — prepared fresh by our culinary team 👨‍🍳`,
      `Treat yourself: *${it.n}*${pStr} delivered straight to your suite 🛌✨`
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  });

  const hotelTips = [
    'Tap the WiFi card below, the password is ready to copy 📶',
    'Room dining: Tap "Order Food" to send your order directly on WhatsApp 🛎️',
    'House rules and check-out timings are outlined below 📜',
    'Enjoyed our executive hospitality? Please leave us a review ⭐',
    'Tap the keycard again to flip between guest access & welcome view 💳'
  ];

  const combined = [];
  const maxLen = Math.max(quotes.length, foodieSuggestions.length, hotelTips.length);
  for(let idx = 0; idx < maxLen; idx++){
    if(quotes[idx % quotes.length]) combined.push(quotes[idx % quotes.length]);
    if(foodieSuggestions[idx % foodieSuggestions.length]) combined.push(foodieSuggestions[idx % foodieSuggestions.length]);
    if(hotelTips[idx % hotelTips.length]) combined.push(hotelTips[idx % hotelTips.length]);
  }

  const finalPool = combined.length ? combined : quotes;
  const tip = finalPool[ti++ % finalPool.length];
  say(tip);
  boom($('#kc') || $('#hero'));
}

function boom(el){
  const r=(el||document.body).getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,c=['#d6b25e','#f1deaa','#fff7ea','#b88a2e'];
  for(let i=0;i<22;i++){
    const d=document.createElement('i');
    d.className='cf';
    d.style.cssText=`left:${x}px;top:${y}px;background:${c[i%4]};--dx:${(Math.random()-.5)*280}px;--dy:${-60-Math.random()*140}px;--r:${Math.random()*720}deg`;
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),1100);
  }
}

function pick(t){
  const meal = getMealContext();
  const all = S.menu.flatMap(c => (c.items||[]).map(i=>({...i, category:c.cat}))).filter(i => i.a && (!vegOnly || i.v));
  const pool = getMealItems(meal, all).filter(i => i.a && (!vegOnly || i.v));
  const finalPool = pool.length ? pool : all;
  const e = $('#pick');
  if(!finalPool.length){e.innerHTML='<p class="mu">Nothing to suggest right now.</p>';return}
  const it = finalPool[Math.floor(Math.random() * finalPool.length)];
  const mealLabels = {
    breakfast: '✦ Morning recommendation',
    lunch: '✦ Midday recommendation',
    snacks: '✦ Evening snack recommendation',
    dinner: '✦ Executive dinner choice',
    night: '✦ Chef\'s choice'
  };
  const label = mealLabels[meal] || '✦ Chef\'s choice';
  e.innerHTML = `<div class="pickc"><small>${label}</small><b>${esc(it.n)}</b><span>${it.p ? '₹' + esc(it.p) + ' · ' : ''}${esc(it.d)}</span></div>`;
  say('May we recommend the ' + it.n + '? ✦');
  boom(t);
}

function guest(){
 const ph=String(S.hotel.phone).replace(/[^+\d]/g,''),rv=url(S.review),H=hi(),ini='SE';
 const nt=S.notices.slice().reverse().map(n=>`<div class="card note rv"><b>From reception</b><p style="margin:6px 0 4px">${esc(n.t)}</p><small>${esc(n.time)}</small></div>`).join('');
 return `<div class="adm">${isRoomLocked ? `<span class="top-room-badge"><i class="top-r-dot"></i>ROOM ${esc(ord.room||lockedRoom)}</span>` : `<button data-act="login">Admin</button>`}</div><div class="wrap">
 <header class="hero" id="hero">
  <div class="scene" data-act="owl"><div class="float"><div class="keycard" id="kc"><div class="face front"><span class="sheen"></span><b class="fanc"></b><div class="mono">${esc(ini)}</div><svg class="nfc" viewBox="0 0 24 24"><path d="M6 8a6 6 0 010 8M10 5.5a10 10 0 010 13M14 3a14 14 0 010 18"/></svg><div class="cn">${esc(S.hotel.name.toUpperCase())}</div><small>GUEST ACCESS CARD</small></div><div class="face back"><div class="rings"><i></i><i></i><i></i></div><div><div class="wb">Welcome</div><small>${esc(S.hotel.tagline)}</small></div></div></div></div></div>
 <p class="hint" data-act="owl">Tap the card 💳</p><p class="eyebrow">${esc(H[0])}</p><h1>${esc(S.hotel.name)}</h1><p class="sub">${esc(S.hotel.tagline)}</p><p class="say" id="say" data-act="owl">${esc(H[1])}</p></header>
 <div class="div"><i></i><b class="fan"></b><i></i></div>
 ${nt}
 <nav class="qa rv">
   <button class="tile" data-act="food">${ic('menu')}Order Food<small>जेवण ऑर्डर</small></button>
   <button class="tile" data-act="order">${ic('bell')}Request<small>मदत</small></button>
   <button class="tile" data-act="go" data-t="wifi">${ic('wifi')}WiFi<small>वायफाय</small></button>
   <button class="tile" data-act="go" data-t="menu">${ic('menu')}Menu<small>मेनू</small></button>
   <button class="tile" data-act="go" data-t="rules">${ic('rules')}Rules<small>नियम</small></button>
   ${rv?`<a class="tile" href="${esc(rv)}" target="_blank" rel="noopener">${ic('star')}Review<small>अभिप्राय</small></a>`:''}
   ${ph?`<a class="tile" href="tel:${ph}">${ic('phone')}Call<small>संपर्क</small></a>`:''}
 </nav>
 <section class="card rv" id="wifi"><h2>WiFi</h2><div class="kv"><span class="mu">Network</span><b>${esc(S.wifi.name)}</b></div><div class="kv"><span class="mu">Password</span><b>${esc(S.wifi.pass)}</b></div><div class="bar" style="margin:12px 0 0"><button class="btn" data-act="copy" data-v="${esc(S.wifi.pass)}">Copy password</button><button class="btn g" data-act="copy" data-v="${esc(S.wifi.name)}">Copy name</button></div></section>
 <section class="card rv" id="menu"><h2>Menu</h2><div class="tools"><input id="q" type="search" placeholder="Search dishes…" value="${esc(q)}"><label class="sw"><input type="checkbox" id="vg" ${vegOnly?'checked':''}>Veg only</label></div><div class="bar" style="justify-content:flex-start;gap:10px"><button class="btn" data-act="food">🛎️ Order food</button><button class="btn g" data-act="pick">✦ Chef's choice</button></div><div id="pick"></div><div id="mm">${menuBlock()}</div><button class="btn" style="width:100%;margin-top:16px" data-act="food">🛎️ Order food to your room</button></section>
 <section class="card rv" id="rules"><h2>House rules</h2><ol>${S.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ol></section>
 ${rv?`<section class="card rv" id="review"><h2>Your feedback</h2><p style="margin-top:0">If we served you well, a Google review means a great deal to our team.</p><a class="btn" href="${esc(rv)}" target="_blank" rel="noopener">Leave a review</a></section>`:''}
 <div class="div" style="margin-top:34px"><i></i><b class="fan"></b><i></i></div><p class="foot">Thank you for choosing ${esc(S.hotel.name)}</p></div>
 <nav class="dock"><button data-act="go" data-t="top">${ic('home')}Home</button><button data-act="go" data-t="menu">${ic('menu')}Menu</button><button data-act="food">${ic('bell')}Order</button><button data-act="opentrack" id="docktrack"><span>🛎️</span>Track${getActiveGuestOrders().length ? `<b class="dock-badge">${getActiveGuestOrders().length}</b>` : ''}</button><button data-act="go" data-t="wifi">${ic('wifi')}WiFi</button><button data-act="go" data-t="rules">${ic('rules')}Rules</button></nav>
 ${foodPage()}${orderUI()}${trackUI()}${chatUI()}${login?loginModal():''}`;
}

function inp(k,v,ph,cls){return `<input ${cls?`class="${cls}" `:''}data-k="${k}" value="${esc(v)}" placeholder="${ph}">`}
function adminView(){
 let b='';
 const kActive = liveOrders.filter(o=>(!o.type||o.type==='restaurant:shreeexecutive')&&o.status!=='delivered'&&o.status!=='rejected').length;
 const sActive = liveOrders.filter(o=>(o.type==='hotel:shreeexecutive')&&o.status!=='completed').length;

 if(tab==='kitchen'){
   const rList = liveOrders.filter(o=>{
     const match = (!o.type || o.type==='restaurant:shreeexecutive');
     if(!match) return false;
     return kitchenFilter==='active' ? (o.status!=='delivered'&&o.status!=='rejected') : (o.status==='delivered'||o.status==='rejected');
   });
   const actCount = liveOrders.filter(o=>(!o.type||o.type==='restaurant:shreeexecutive')&&o.status!=='delivered'&&o.status!=='rejected').length;
   const histCount = liveOrders.filter(o=>(!o.type||o.type==='restaurant:shreeexecutive')&&(o.status==='delivered'||o.status==='rejected')).length;

   b = `<div class="card" style="margin-top:14px">
     <div class="dtopbar">
       <div class="dpulse"><i></i><b>LIVE KITCHEN ORDERS</b></div>
       <div style="display:flex;gap:6px">
         <button class="btn g" style="padding:4px 10px;min-height:32px;font-size:.7rem" data-act="togglesound">${soundEnabled ? '🔔 Alert: ON' : '🔕 Alert: OFF'}</button>
         <button class="btn g" style="padding:4px 10px;min-height:32px;font-size:.7rem" data-act="testsound">Test Chime</button>
       </div>
     </div>
     <div class="staff-alert-banner">⚠️ <b>STAFF ALERT:</b> Check if the guest is in the hotel before accepting orders!</div>
     <div class="filter-bar">
       <button class="fbtn ${kitchenFilter==='active'?'on':''}" data-act="kfilter" data-f="active">Active Orders (${actCount})</button>
       <button class="fbtn ${kitchenFilter==='history'?'on':''}" data-act="kfilter" data-f="history">Order History (${histCount})</button>
     </div>
     ${!rList.length ? `<div class="empty-box">${kitchenFilter==='active'?'No active orders right now. Waiting for guests to order...':'No past order history yet.'}</div>` : `
       <div class="ord-grid">
         ${rList.map(o=>`
           <div class="ord-card" data-id="${o.id}">
             <div class="ord-head">
               <div><span class="ord-room">ROOM ${esc(o.room)}</span></div>
               <div class="ord-meta"><b>${esc(o.id)}</b><br><small>${new Date(o.createdAt||o.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div>
             </div>
             <ul class="ord-items">
               ${(o.items||[]).map(it=>`<li class="ord-item"><span>${esc(it.name)} x ${it.q}</span><b>₹${it.price ? it.price*it.q : 0}</b></li>`).join('')}
             </ul>
                          ${o.note ? `<div class="ord-note">“${esc(o.note)}”</div>` : ''}
             ${o.guest_feedback || o.guest_star ? `<div class="ord-note" style="border-left-color:#9b59b6;background:#fbf5fd;color:#5b2c6f;font-weight:600;margin-top:4px">⭐ ${o.guest_star ? o.guest_star + '/5 ' : ''}Guest Rating${o.guest_feedback ? `: “${esc(o.guest_feedback)}”` : ''}</div>` : ''}
             ${o.rejectReason||o.reject_reason ? `<div class="ord-note" style="border-left-color:var(--err);color:var(--err)">Reason: ${esc(o.rejectReason||o.reject_reason)}</div>` : ''}
             <div class="ord-foot">
               <span class="ord-badge b-${o.status||'pending'}">${esc(o.status||'pending')}</span>
               <b class="ord-tot">${o.total ? '₹'+o.total : ''}</b>
             </div>
             ${kitchenFilter==='active' ? `
               <div class="ord-acts">
                 ${o.status==='pending' ? `
                   <div style="width:100%;font-size:.72rem;color:#d6b25e;background:rgba(214,178,94,0.12);padding:4px 6px;margin-bottom:4px;font-weight:700">⚠️ Verify guest in hotel before accepting</div>
                   <button class="btn-act btn-accept" data-act="upstat" data-id="${o.id}" data-st="accepted">✔ Accept</button>
                   <button class="btn-act btn-reject" data-act="upstat" data-id="${o.id}" data-st="rejected">✖ Reject</button>
                 ` : o.status==='accepted' ? `
                   <button class="btn-act btn-ready" data-act="upstat" data-id="${o.id}" data-st="ready">🍳 Mark Ready</button>
                 ` : o.status==='ready' ? `
                   <button class="btn-act btn-deliver" data-act="upstat" data-id="${o.id}" data-st="delivered">🚀 Mark Delivered</button>
                 ` : ''}
               </div>
             ` : ''}
           </div>
         `).join('')}
       </div>
     `}
   </div>`;
 }

 if(tab==='staff'){
   const sList = liveOrders.filter(o=>o.type==='hotel:shreeexecutive'&&o.status!=='completed');
   b = `<div class="card" style="margin-top:14px">
     <div class="dtopbar">
       <div class="dpulse"><i></i><b>FRONT DESK SERVICE REQUESTS</b></div>
     </div>
     <div class="staff-alert-banner">⚠️ <b>STAFF ALERT:</b> Verify guest room before fulfilling request!</div>
     ${!sList.length ? `<div class="empty-box">No front desk requests right now. Waiting for guests...</div>` : `
       <div class="ord-grid">
         ${sList.map(o=>`
           <div class="ord-card" data-id="${o.id}">
             <div class="ord-head">
               <div><span class="ord-room">ROOM ${esc(o.room)}</span></div>
               <div class="ord-meta"><small>${new Date(o.createdAt||o.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div>
             </div>
             <div>
               <h3 style="font-size:1.15rem;margin:6px 0">${esc(o.serviceTitle||o.service_title||'Room Service Request')}</h3>
                              ${o.note ? `<p class="ord-note">“${esc(o.note)}”</p>` : ''}
               ${o.guest_feedback || o.guest_star ? `<p class="ord-note" style="border-left-color:#9b59b6;background:#fbf5fd;color:#5b2c6f;font-weight:600;margin-top:4px">⭐ ${o.guest_star ? o.guest_star + '/5 ' : ''}Guest Rating${o.guest_feedback ? `: “${esc(o.guest_feedback)}”` : ''}</p>` : ''}
             </div>
             <div class="ord-foot">
               <span class="ord-badge ${o.status==='in_progress'?'b-accepted':'b-pending'}">${esc(o.status||'pending')}</span>
             </div>
             <div class="ord-acts">
               ${o.status==='pending' ? `
                 <button class="btn-act btn-accept" data-act="upstat" data-id="${o.id}" data-st="in_progress">✔ In Progress</button>
                 <button class="btn-act btn-deliver" data-act="upstat" data-id="${o.id}" data-st="completed">✅ Resolved</button>
               ` : `
                 <button class="btn-act btn-deliver" data-act="upstat" data-id="${o.id}" data-st="completed">✅ Resolved</button>
               `}
             </div>
           </div>
         `).join('')}
       </div>
     `}
   </div>`;
 }

 if(tab==='qr'){
   b = `<div class="card" style="margin-top:14px">
     <h2>🔗 Per-Room Direct Links & QR</h2>
     <p class="mu" style="margin-top:0">Assign each room its own link. When guests open or scan their room link, their room number is <b>automatically locked</b> so no one can falsify another room's number!</p>
     <div style="display:flex;gap:8px;margin:14px 0">
       <input id="qrinp" placeholder="Enter room number, e.g. 101" style="flex:1">
       <button class="btn" data-act="genqr">Copy Link</button>
     </div>
     <div id="qrout" style="font-weight:700;color:var(--gl);min-height:1.2em;margin-bottom:12px"></div>
     <label style="margin-top:10px">Quick copy for common rooms:</label>
     <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
       ${['101','102','103','104','105','201','202','203','204','205'].map(rm=>`
         <button class="btn g" style="padding:6px 12px;min-height:36px;font-size:.74rem" data-act="quickqr" data-rm="${rm}">Room ${rm}</button>
       `).join('')}
     </div>
   </div>`;
 }

 if(tab==='notices'){b=`<div class="card"><h2>Broadcast a notice</h2><textarea id="nt" rows="3" placeholder="Message for all guests, e.g. Breakfast served in banquet hall from 7:30 AM."></textarea><button class="btn" data-act="addnotice">Broadcast now</button></div><div class="card"><h2>Live notices</h2>${S.notices.map((n,i)=>`<div class="row"><p style="margin:0 0 6px">${esc(n.t)}</p><small class="mu">${esc(n.time)}</small> <button class="btn d" data-act="delnotice" data-i="${i}">Remove</button></div>`).join('')||'<p class="mu">No notices.</p>'}</div>`}
 if(tab==='menu'){const c=S.menu[ci];b=`<div class="card"><div class="pills">${S.menu.map((x,i)=>`<button class="pill ${i===ci?'on':''}" data-act="acat" data-i="${i}">${esc(x.cat)}</button>`).join('')}<button class="pill" data-act="addcat">+ Category</button></div>${c?`${inp(`menu.${ci}.cat`,c.cat,'Category name')}${c.items.map((it,j)=>{const p=`menu.${ci}.items.${j}.`;return `<div class="row">${inp(p+'n',it.n,'Dish name')}${inp(p+'p',it.p,'Price ₹')}${inp(p+'d',it.d,'Description')}<label><input type="checkbox" data-k="${p}v" ${it.v?'checked':''}>Veg</label><label><input type="checkbox" data-k="${p}a" ${it.a?'checked':''}>Available</label> <button class="btn d" data-act="delitem" data-j="${j}">Delete</button></div>`}).join('')}<div class="bar"><button class="btn g" data-act="additem">+ Add item</button><button class="btn d" data-act="delcat">${delArm===ci?'Tap again to delete':'Delete category'}</button></div>`:'<p class="mu">Add a category to start.</p>'}</div>`}
 if(tab==='order'){const dn=(k,t)=>`<div class="card"><h2>${t}</h2><label>WhatsApp number (with country code)</label>${inp('order.'+k+'.wa',S.order[k].wa,'919876543210')}<label>SMS number (blank = same as WhatsApp)</label>${inp('order.'+k+'.sms',S.order[k].sms,'919876543210')}</div>`;b=`<div class="card"><h2>Ordering</h2><label class="sw"><input type="checkbox" data-k="order.on" ${S.order.on?'checked':''}>Accept orders</label>${[S.order.food,S.order.desk].some(d=>num(d.wa)||num(d.sms))?'':'<p class="st">No number is set yet. Guests can pick items but can only copy the order until you add a number below.</p>'}<p class="mu" style="font-size:.9rem">Food orders and toiletries/messages are sent separately. Orders are dispatched via WhatsApp or SMS directly to your phone.</p></div>${dn('food','Kitchen (food orders)')}${dn('desk','Front desk (toiletries and messages)')}<div class="card"><h2>Toiletries</h2>${S.toil.map((x,i)=>`<div class="row">${inp('toil.'+i+'.n',x.n,'Item name')}${inp('toil.'+i+'.p',x.p,'Price Rs (optional)')}<label><input type="checkbox" data-k="toil.${i}.a" ${x.a?'checked':''}>Available</label> <button class="btn d" data-act="deltoil" data-i="${i}">Delete</button></div>`).join('')}<button class="btn g" data-act="addtoil">+ Add item</button></div>`}
 if(tab==='info'){b=`<div class="card"><h2>Details</h2><label>Hotel name</label>${inp('hotel.name',S.hotel.name,'')}<label>Tagline</label>${inp('hotel.tagline',S.hotel.tagline,'')}<label>Reception phone</label>${inp('hotel.phone',S.hotel.phone,'+91…')}<label>WiFi name</label>${inp('wifi.name',S.wifi.name,'')}<label>WiFi password</label>${inp('wifi.pass',S.wifi.pass,'')}<label>Google review link</label>${inp('review',S.review,'https://…')}</div><div class="card"><h2>House rules</h2>${S.rules.map((r,i)=>`<div class="row">${inp('rules.'+i,r,'Rule')}<button class="btn d" data-act="delrule" data-i="${i}">Delete</button></div>`).join('')}<button class="btn g" data-act="addrule">+ Add rule</button></div><div class="card"><h2>Admin password</h2><input id="opw" type="password" placeholder="Current password" autocomplete="current-password"><input id="npw" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password"><button class="btn g" data-act="setpw">Change password</button></div>`}
 return `<div class="wrap"><div class="bar"><h2 style="margin:0">Admin</h2><div><button class="btn g" data-act="logout">Exit</button> <button class="btn" data-act="save">Save changes</button></div></div><div class="st" id="st"></div><div class="pills">${[['kitchen','🍳 Kitchen ('+kActive+')'],['staff','🛎️ Front Desk ('+sActive+')'],['notices','Notices'],['menu','Menu'],['info','Info & rules'],['order','Ordering'],['qr','🔗 Room Links']].map(t=>`<button class="pill ${tab===t[0]?'on':''}" data-act="tab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>${b}</div>`;
}

function reveal(){const e=document.querySelectorAll('.rv');if(!('IntersectionObserver' in window))return e.forEach(x=>x.classList.add('in'));const o=new IntersectionObserver(r=>r.forEach(x=>{if(x.isIntersecting){x.target.classList.add('in');o.unobserve(x.target)}}),{threshold:.08});e.forEach(x=>o.observe(x))}
function toast(m){const d=document.createElement('div');d.className='toast';d.textContent=m;document.body.appendChild(d);setTimeout(()=>d.remove(),1800)}
const mm=()=>{const e=$('#mm');if(e)e.innerHTML=menuBlock()};
document.addEventListener('input',e=>{if(e.target.id==='q'){q=e.target.value;mm()}if(e.target.id==='vg'){vegOnly=e.target.checked;mm()}});
function render(){$('#app').innerHTML=(admin && !isRoomLocked)?adminView():guest();reveal();const p=$('#pw');if(p)p.focus()}
const st=m=>{const e=$('#st');if(e)e.textContent=m};

async function save(){
 st('Saving…');
 try{
   const cfgId = (window.APP_CONFIG && window.APP_CONFIG.CONFIG_ID) || 3;
   const {data,error}=await SB.from('site_config').upsert({id:cfgId,data:S,updated_at:new Date().toISOString()});
   if(error)throw error;
   st('Saved. Guests see changes when they open or refresh the page.');
 }catch(e){
   st('Could not save: '+((e&&e.message)||'unknown error'));
 }
}

function setPath(path,v){const k=path.split('.');let o=S;for(let i=0;i<k.length-1;i++)o=o[k[i]];o[k[k.length-1]]=v}
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.k;if(k)setPath(k,e.target.type==='checkbox'?e.target.checked:e.target.value)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pw')act('dologin',e.target)});
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(t)act(t.dataset.act,t)});

async function act(a,t){
 const i=+t.dataset.i,j=+t.dataset.j;
 if(a==='cat'){mcat=i;mm()}
 else if(a==='owl'){owl()}
 else if(a==='chat'){chatToggle()}
 else if(a==='send'){chatSend()}
 else if(a==='chip'){chatSend(t.dataset.q)}
 else if(a==='pick'){pick(t)}
 else if(a==='go'){const d=t.dataset.t;d==='top'?scrollTo({top:0,behavior:'smooth'}):document.getElementById(d).scrollIntoView({behavior:'smooth'})}
 else if(a==='copy'){try{await navigator.clipboard.writeText(t.dataset.v);toast('Copied ✓');say('Copied to clipboard ✓');boom(t)}catch(e){t.textContent='Select & copy manually'}}
 else if(a==='login'){if(isRoomLocked)return;login=true;render()}
 else if(a==='rateexp'){
   const score = +(t.dataset.score || 5);
   const oid = t.dataset.id;
   if(score >= 4){
     reviewBoxState[oid] = { status: 'thanked', score: score };
     window.open(S.review, '_blank', 'noopener');
     toast('Opening Google Review...');
   } else {
     reviewBoxState[oid] = { status: 'feedback_open', score: score, text: '' };
   }
   const tc = document.querySelector('#tracksheet .track-sheet-content');
   if(tc) tc.innerHTML = renderGuestOrdersList();
   if(score < 4){
     setTimeout(() => {
       const box = document.getElementById('revbox_' + oid);
       const ta = box && box.querySelector('.trb-fb-txt');
       if(ta) ta.focus();
     }, 50);
   }
 }
 else if(a==='sendprivfb'){
   const oid = t.dataset.id;
   const box = document.getElementById('revbox_' + oid);
   const txt = (box && box.querySelector('.trb-fb-txt')) ? box.querySelector('.trb-fb-txt').value.trim() : '';
   const prevState = reviewBoxState[oid];
   const score = prevState ? prevState.score : null;
   reviewBoxState[oid] = { status: 'feedback_submitted', text: txt };
   const tc = document.querySelector('#tracksheet .track-sheet-content');
   if(tc) tc.innerHTML = renderGuestOrdersList();
   toast('Feedback submitted!');
   if(txt && SB){
     SB.from('orders').update({ guest_feedback: txt, guest_star: score }).eq('id', oid)
       .then(()=>{}).catch(e=>console.warn('Feedback save:', e));
   }
 }
 else if(a==='cancelprivfb'){
   const oid = t.dataset.id;
   delete reviewBoxState[oid];
   const tc = document.querySelector('#tracksheet .track-sheet-content');
   if(tc) tc.innerHTML = renderGuestOrdersList();
 }
 else if(a==='opentrack'){trackSheetOpen=true;render();const s=$('#tracksheet');if(s)s.classList.add('open')}
 else if(a==='closetrack'){trackSheetOpen=false;const s=$('#tracksheet');if(s)s.classList.remove('open');render()}
 else if(a==='dismissbanner'){const id=t.dataset.id;if(id)dismissedOrderIds.add(id);render()}
 else if(a==='closelogin'){login=false;render()}
 else if(a==='dologin'){if(isRoomLocked)return;if(await sha($('#pw').value)===S.pw){admin=true;login=false;try{sessionStorage.setItem('se_admin','1')}catch(e){}render()}else $('#lst').textContent='Wrong password'}
 else if(a==='logout'){admin=false;try{sessionStorage.removeItem('se_admin')}catch(e){}render()}
 else if(a==='tab'){tab=t.dataset.t;render()}
 else if(a==='kfilter'){kitchenFilter=t.dataset.f;render()}
 else if(a==='togglesound'){soundEnabled=!soundEnabled;render()}
 else if(a==='testsound'){playChime();toast('Chime played 🔔')}
 else if(a==='genqr'){
   const r=($('#qrinp')||{}).value.trim();
   if(!r){toast('Enter a room number');return}
   const link=location.origin+'/?room='+encodeURIComponent(r);
   navigator.clipboard.writeText(link).then(()=>{
     toast('Copied: '+link);
     const o=$('#qrout');if(o)o.textContent='✓ Copied link: '+link;
   });
 }
 else if(a==='quickqr'){
   const rm=t.dataset.rm;
   const link=location.origin+'/?room='+encodeURIComponent(rm);
   navigator.clipboard.writeText(link).then(()=>{
     toast('Copied Room '+rm+' link');
     const o=$('#qrout');if(o)o.textContent='✓ Copied link: '+link;
   });
 }
 else if(a==='upstat'){
   const oid=t.dataset.id, st=t.dataset.st;
   let rsn='';
   if(st==='accepted'||st==='in_progress'){
     if(!confirm('⚠️ STAFF VERIFICATION ALERT:\n\nPlease confirm if the guest is currently in the hotel before accepting!\n\nPress OK if verified, or Cancel to go back.')){return;}
   }
   if(st==='rejected'){
     rsn=prompt('Enter rejection reason (optional):','Item out of stock');
     if(rsn===null)return;
   }
   t.disabled=true;t.textContent='...';
   if(SB){
     SB.from('orders').update({status:st, reject_reason:rsn, updated_at:new Date().toISOString()}).eq('id',oid).then(()=>{
       fetchLiveOrders();
       toast('Order updated to '+st);
     }).catch(err=>{ toast('Update failed'); render(); });
   }
 }
 else if(a==='acat'){ci=i;delArm=-1;render()}
 else if(a==='addcat'){S.menu.push({cat:'New category',items:[]});ci=S.menu.length-1;render()}
 else if(a==='delcat'){if(delArm!==ci){delArm=ci;render();return}S.menu.splice(ci,1);ci=0;delArm=-1;render()}
 else if(a==='additem'){S.menu[ci].items.push({id:uid(),n:'',p:'',d:'',v:true,a:true});render()}
 else if(a==='delitem'){S.menu[ci].items.splice(j,1);render()}
 else if(a==='addtoil'){S.toil.push({id:uid(),n:'',p:'',a:true});render()}
 else if(a==='deltoil'){S.toil.splice(i,1);render()}
 else if(a==='addrule'){S.rules.push('');render()}
 else if(a==='delrule'){S.rules.splice(i,1);render()}
 else if(a==='addnotice'){const v=$('#nt').value.trim();if(v){S.notices.push({id:uid(),t:v,time:new Date().toLocaleString()});save();render()}}
 else if(a==='delnotice'){S.notices.splice(i,1);save();render()}
 else if(a==='setpw'){const o=$('#opw').value,v=$('#npw').value;if(await sha(o)!==S.pw)return st('Current password is wrong.');if(v.length<6)return st('Use at least 6 characters.');S.pw=await sha(v);$('#opw').value='';$('#npw').value='';st('Password changed. Press Save changes to apply.')}
 else if(a==='save')save();
 else if(a==='food'){if(fp.sent){Object.keys(ord.cart).forEach(x=>{if(x[0]==='f')delete ord.cart[x]});ord.note='';fp.sent='';}fp.open=true;fp.view='menu';paintFood();const p=$('#fpage');if(p)p.classList.add('open')}
 else if(a==='fback'){if(fp.sent){Object.keys(ord.cart).forEach(x=>{if(x[0]==='f')delete ord.cart[x]});ord.note='';fp.sent='';}fp.open=false;const p=$('#fpage');if(p)p.classList.remove('open')}
 else if(a==='fcat'){fp.cat=i;paintFood()}
 else if(a==='freview'){fp.view='checkout';paintFood()}
 else if(a==='fcheckback'){fp.view='menu';paintFood()}
 else if(a==='fnew'||a==='fclear'){Object.keys(ord.cart).forEach(x=>{if(x[0]==='f')delete ord.cart[x]});ord.note='';fp.sent='';fp.view='menu';paintFood()}
 else if(a==='fwa'){sendOrder('wa','food')}
 else if(a==='fsms'){sendOrder('sms','food')}
 else if(a==='fcopy'){sendOrder('copy','food')}
 else if(a==='order'){ord.open=true;ord.view='browse';paintOrder();const s=$('#osheet');if(s)s.classList.add('open')}
 else if(a==='oclose'){ord.open=false;const s=$('#osheet');if(s)s.classList.remove('open')}
 else if(a==='otab'){ord.tab=t.dataset.t;paintOrder()}
 else if(a==='oview'){ord.view='checkout';paintOrder()}
 else if(a==='obackbrowse'){ord.view='browse';paintOrder()}
 else if(a==='oback'){ord.sent='';ord.view='browse';paintOrder()}
 else if(a==='onew'){ord.sent='';ord.view='browse';if(ord.sentTab==='msg')ord.msg='';paintOrder()}
 else if(a==='owa'){sendOrder('wa',ord.tab)}
 else if(a==='osms'){sendOrder('sms',ord.tab)}
 else if(a==='ocopy'){sendOrder('copy',ord.tab)}
 else if(a==='qq'){
   const k=t.dataset.k,d=+t.dataset.d,c=qty(k)+d;
   if(c<=0)delete ord.cart[k];else ord.cart[k]=c;
   afterQty(k,t);
 }
}

let AI=true,chat=[],chatOpen=false,busy=false;
const GREET='Welcome to Hotel Shree Executive. I am Joy, your executive digital assistant. Ask me about the menu, room dining, WiFi, house rules, or anything regarding your stay.';
const CHIPS=['WiFi password?','What is veg on the menu?','Non-veg specialties?','House rules?','Suggest a dish'];
function msgs(){return '<div class="bb a">'+esc(GREET)+'</div>'+chat.map(m=>`<div class="bb ${m.role==='user'?'u':'a'}">${m.content?esc(m.content):'…'}</div>`).join('')}
function paint(){const m=$('#cm');if(m){m.innerHTML=msgs();m.scrollTop=m.scrollHeight}}

function chatUI(){
 return `<button class="fab" data-act="chat" aria-label="Chat with Ask Joy">💬 Ask Joy</button><div class="cp ${chatOpen?'open':''}" id="cp"><div class="ch"><b>💬 Ask Joy</b><button data-act="chat" aria-label="Close chat">✕</button></div><div class="cm" id="cm">${msgs()}</div><div class="chips">${CHIPS.map(c=>`<button data-act="chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="crow"><input id="cin" placeholder="Ask about the hotel…" maxlength="400" autocomplete="off"><button class="btn" data-act="send">Send</button></div></div>`;
}
function chatToggle(){chatOpen=!chatOpen;const c=$('#cp');if(c)c.classList.toggle('open',chatOpen);if(chatOpen){const i=$('#cin');if(i)setTimeout(()=>i.focus(),300);paint()}}

function smartReply(q){
 const text = q.toLowerCase().trim();
 const allCategories = S.menu || [];
 const allItems = allCategories.flatMap(c => (c.items || []).map(it => ({ ...it, category: c.cat })));
 const activeItems = allItems.filter(it => it.a);

 // ── GREETING CHECK: "hi", "hii", "hello", "hey", "namaste" ──
 const isGreeting = /^(hi+|hello+|hey+|hola+|namaste|good\s*(morning|afternoon|evening|night))\b/i.test(text) || 
                    ['hi','hii','hiii','hiiii','hello','helloo','hey','heyy','namaste'].includes(text);
 if(isGreeting){
   const meal = getMealContext();
   const greetings = {
     breakfast: `Hii! ☀️ Good morning! I am Joy, your 24/7 executive assistant at ${S.hotel.name}.\n\nReady for fresh executive breakfast? Savor our warm Poha, Upma, Masala Omelette, and hot Masala Chai! Ask me about morning dishes, WiFi, or room assistance.`,
     lunch: `Hello! 🍛 Good afternoon! It's lunch time at ${S.hotel.name}.\n\nCraving our Dal Makhani, Butter Chicken, or Fragrant Veg Biryani? Ask me about dishes, drinks, or tap "Order Food" to order directly to your suite!`,
     snacks: `Hii! 🌇 Good evening! Sunset hour is executive tea & snacks time.\n\nEnjoy our crispy Spring Rolls, French Fries, or chilled Lime Soda! Ask me about snacks, WiFi, or room assistance.`,
     dinner: `Hello! 🌙 Good evening! Time for a delicious royal dinner feast delivered to your room.\n\nSavor our Chicken Malai Tikka, Dal Makhani, or Paneer Tikka! What are you craving tonight?`,
     night: `Hii! 🌙 Good night! I am Joy, your 24/7 assistant at ${S.hotel.name}.\n\nRest well in luxury comfort. If you need WiFi info or morning timings, I am here anytime!`
   };
   return greetings[meal] || `Hello! ✦ Welcome to ${S.hotel.name}. I am Joy, your 24/7 executive assistant. How may I be of service today?`;
 }

 // ── STRICT VEG / NON-VEG INTENT ──
 const isNonVegIntent = text.includes('non-veg') || text.includes('non veg') || text.includes('nonveg') ||
                        text.includes('chicken') || text.includes('fish') || text.includes('mutton') ||
                        text.includes('prawn') || text.includes('egg') || text.includes('meat');

 const isVegOnlyIntent = !isNonVegIntent && (text.includes('veg') || text.includes('vegetarian') || text.includes('pure veg'));

 // 1. NON-VEG direct query
 if(isNonVegIntent && (text.includes('non-veg') || text.includes('non veg') || text.includes('nonveg') || text === 'non veg' || text === 'nonveg')){
   const nonVeg = activeItems.filter(i => !i.v);
   if(nonVeg.length){
     const names = nonVeg.map(d => `• ${d.n}${d.p ? ` (₹${d.p})` : ''}${d.d ? ` - ${d.d}` : ''} [${d.category}]`).join('\n');
     return `🍗 Executive Non-Veg Specialties:\n${names}\n\n🛎️ Tap "Order Food" to order directly to your room!`;
   }
   return `Currently there are no active non-veg items on the menu. Please check with reception!`;
 }

 // 2. PURE VEG direct query
 if(isVegOnlyIntent && (text === 'veg' || text.includes('vegetarian') || text.includes('pure veg'))){
   const vegDishes = activeItems.filter(i => i.v);
   if(vegDishes.length){
     const names = vegDishes.map(d => `• ${d.n}${d.p ? ` (₹${d.p})` : ''}${d.d ? ` - ${d.d}` : ''} [${d.category}]`).join('\n');
     return `🥗 Executive Pure Veg Specialties:\n${names}\n\n🛎️ Tap "Order Food" to view the full menu and order!`;
   }
   return `Our kitchen offers delicious pure vegetarian meals. Tap "Order Food" to view the menu!`;
 }

 // 3. Direct Item & Keyword Search — strictly filtered by intent
 const queryClean = text.replace(/[^a-z0-9\s]/gi, ' ').trim();
 const queryTokens = queryClean.split(/\s+/).filter(t => t.length >= 2 && !['non','veg','the','and','for','are','any','show','have','what','your','this','that','want','give','option','options','dish','dishes'].includes(t));

 const matchedDishes = allItems.filter(it => {
   if(isNonVegIntent && it.v) return false;
   if(isVegOnlyIntent && !it.v) return false;

   const dName = (it.n || '').toLowerCase();
   const dDesc = (it.d || '').toLowerCase();

   if(text === dName || text.includes(dName) || (dName.length >= 3 && dName.includes(text.replace(/non.?veg|vegetarian|pure veg/gi,'').trim()))) return true;

   const dTokens = dName.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(t => t.length >= 2);
   const hasWordMatch = queryTokens.some(qWord => dTokens.some(dWord => dWord === qWord || (dWord.length >= 4 && (dWord.includes(qWord) || qWord.includes(dWord)))));
   if(hasWordMatch) return true;

   if(queryTokens.length === 1 && queryTokens[0].length >= 3){
     if(dDesc.includes(queryTokens[0])) return true;
   }
   return false;
 });

 if(matchedDishes.length === 1){
   const it = matchedDishes[0];
   const status = it.a ? (it.p ? `priced at ₹${it.p}` : 'available') : 'currently sold out';
   const vegTag = it.v ? 'Pure Veg 🟢' : 'Non-Veg 🍗';
   const desc = it.d ? `\n${it.d}` : '';
   return `🍽️ ${it.n} [${vegTag}] — ${it.category}\nStatus: ${status}.${desc}${it.a ? '\n\n🛎️ Tap "Order Food" to order directly to your room!' : ''}`;
 }

 if(matchedDishes.length > 1){
   const list = matchedDishes.filter(it=>it.a).map(it => `• ${it.n}${it.p ? ` (₹${it.p})` : ''} [${it.v ? 'Veg 🟢' : 'Non-Veg 🍗'}]`).join('\n');
   return `🍽️ Matching dishes:${isNonVegIntent?' (Non-Veg)':isVegOnlyIntent?' (Veg only)':''}\n${list}\n\n🛎️ Tap "Order Food" to order!`;
 }

 // 4. Category match
 const matchedCat = allCategories.find(c => {
   const cName = (c.cat || '').toLowerCase();
   return text.includes(cName) ||
          (cName.includes('starter') && (text.includes('starter') || text.includes('tikka') || text.includes('appetizer'))) ||
          (cName.includes('main') && (text.includes('main') || text.includes('curry') || text.includes('gravy') || text.includes('dal'))) ||
          (cName.includes('breakfast') && (text.includes('breakfast') || text.includes('morning') || text.includes('poha'))) ||
          (cName.includes('snack') && (text.includes('snack') || text.includes('evening') || text.includes('rolls'))) ||
          (cName.includes('drink') && (text.includes('drink') || text.includes('coffee') || text.includes('tea') || text.includes('soda') || text.includes('sweet') || text.includes('dessert')));
 });

 if(matchedCat){
   let items = (matchedCat.items || []).filter(i => i.a);
   if(isNonVegIntent) items = items.filter(i => !i.v);
   if(isVegOnlyIntent) items = items.filter(i => i.v);
   if(items.length){
     const list = items.map(d => `• ${d.n}${d.p ? ` (₹${d.p})` : ''}${d.d ? ` - ${d.d}` : ''} [${d.v ? 'Veg 🟢' : 'Non-Veg 🍗'}]`).join('\n');
     return `📋 ${matchedCat.cat}:${isNonVegIntent?' (Non-Veg only)':isVegOnlyIntent?' (Veg only)':''}\n${list}\n\nTap "Order Food" to order!`;
   }
   return `No ${isNonVegIntent?'non-veg':isVegOnlyIntent?'veg':''} items in that category right now. Tap "Order Food" to see the full menu!`;
 }

 // 5. Broad non-veg / veg queries
 if(isNonVegIntent){
   const nonVeg = activeItems.filter(i => !i.v);
   if(nonVeg.length){
     const names = nonVeg.map(d => `• ${d.n}${d.p ? ` (₹${d.p})` : ''} [${d.category}]`).join('\n');
     return `🍗 Non-Veg specialties:\n${names}\n\n🛎️ Tap "Order Food" to order!`;
   }
   return `No non-veg items are currently available. Please check with reception!`;
 }

 if(isVegOnlyIntent){
   const vegDishes = activeItems.filter(i => i.v);
   if(vegDishes.length){
     const names = vegDishes.map(d => `• ${d.n}${d.p ? ` (₹${d.p})` : ''} [${d.category}]`).join('\n');
     return `🥗 Pure Veg specialties:\n${names}\n\n🛎️ Tap "Order Food" to order!`;
   }
   return `Our kitchen offers delicious pure vegetarian meals. Tap "Order Food" to view the menu!`;
 }

 // 6. WiFi
 if(text.includes('wifi') || text.includes('wi-fi') || text.includes('password') || text.includes('internet')){
   return `📶 WiFi Details:\nNetwork: ${S.wifi.name || 'ShreeExecutive_Guest'}\nPassword: ${S.wifi.pass || 'welcome123'}\n\n(Tap the WiFi tile on the home screen to copy it with one tap!)`;
 }

 // 7. Rules & Timings
 if(text.includes('rule') || text.includes('timing') || text.includes('time') || text.includes('check-out') || text.includes('checkout') || text.includes('checkin') || text.includes('check in')){
   const rules = (S.rules || []).filter(Boolean);
   if(rules.length){
     return `📜 House Rules & Timings:\n${rules.map((r, idx) => `${idx + 1}. ${r}`).join('\n')}`;
   }
   return `Please observe our quiet hours after 10 PM and check-out by 11 AM. Feel free to contact reception for assistance!`;
 }

 // 8. Notices
 if(text.includes('notice') || text.includes('announcement') || text.includes('update')){
   const notices = (S.notices || []).filter(n => n.t);
   if(notices.length){
     return `📢 Reception Notices:\n${notices.map(n => `• ${n.t} (${n.time || ''})`).join('\n')}`;
   }
   return `There are no urgent notices at the moment. Enjoy your executive stay!`;
 }

 // 9. Suggestion
 if(text.includes('suggest') || text.includes('recommend') || text.includes('special') || text.includes('dish') || text.includes('surprise') || text.includes('best')){
   const meal = getMealContext();
   const pool = getMealItems(meal, activeItems);
   const candidates = pool.length ? pool : activeItems;
   if(candidates.length){
     const pick = candidates[Math.floor(Math.random() * candidates.length)];
     return `✦ For this time of day, may we suggest our *${pick.n}* (${pick.category}) for ₹${pick.p || 'N/A'}? ${pick.d || 'A guest favorite!'}\n\nTap "Order Food" to order!`;
   }
 }

 // 10. Food Ordering
 if(text.includes('order') || text.includes('food') || text.includes('menu') || text.includes('kitchen')){
   return `🛎️ Ready to dine? Tap the "Order Food" button on your screen to browse our executive menu, select dishes, and dispatch your order directly via WhatsApp!`;
 }

 // 11. Toiletries & Amenities
 if(text.includes('towel') || text.includes('soap') || text.includes('blanket') || text.includes('pillow') || text.includes('toiletr') || text.includes('shampoo') || text.includes('room service') || text.includes('amenit') || text.includes('kit') || text.includes('brush') || text.includes('paste')){
   const toil = (S.toil || []).filter(t => t.a && t.n).map(t => t.n).join(', ');
   return `🧴 Available room amenities:\n${toil || 'Fresh towels, toiletries, blankets, etc.'}\n\nTap the "Request" button on your screen to send a request directly to reception!`;
 }

 // 12. Reception / Contact
 if(text.includes('phone') || text.includes('call') || text.includes('contact') || text.includes('reception') || text.includes('desk') || text.includes('front desk')){
   return `📞 Reception Contact:\nPhone: ${S.hotel.phone || '+91 9876543210'}\nHotel: ${S.hotel.name} (${S.hotel.tagline || ''})\n\nFeel free to call or message us anytime!`;
 }

 const summary = [
   allCategories.length ? `• Executive Menu & Drinks (${allCategories.map(c => c.cat).join(', ')})` : '',
   S.wifi.name ? `• WiFi details` : '',
   (S.rules || []).length ? `• House rules & timings` : '',
   (S.toil || []).length ? `• Room amenities & requests` : '',
   S.hotel.phone ? `• Reception: ${S.hotel.phone}` : ''
 ].filter(Boolean).join('\n');

 return `I'm happy to assist you! You can ask me about:\n${summary}\n\nOr feel free to call our reception${S.hotel.phone ? ` at ${S.hotel.phone}` : ''} ✦`;
}

async function chatSend(pre){
 if(busy||!AI)return;
 const i=$('#cin'),v=String(pre||(i&&i.value)||'').trim().slice(0,400);
 if(!v)return;
 if(i)i.value='';
 chat.push({role:'user',content:v},{role:'assistant',content:''});
 busy=true;
 paint();
 
 const startTime = Date.now();
 let replyText = '';

 let h=chat.slice(0,-1).filter(m=>m.content).slice(-10);
 while(h.length&&h[0].role!=='user')h.shift();

 try{
   if(SB && SB.functions){
     const {data,error}=await SB.functions.invoke('ai-chat',{body:{messages:h}});
     if(error||!data||!data.reply)throw error||new Error('Edge function unavailable');
     replyText=data.reply;
   } else {
     replyText=smartReply(v);
   }
 }catch(e){
   replyText=smartReply(v);
 }

 const elapsed = Date.now() - startTime;
 const delay = Math.max(0, 800 - elapsed);
 setTimeout(()=>{
   chat[chat.length-1].content=replyText;
   busy=false;
   paint();
 }, delay);
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='cin')chatSend()});

let ord = { open: false, view: 'browse', tab: 'toil', cart: {}, msg: '', name: '', room: lockedRoom, note: '', sent: '', sentTab: '', err: '' };
let fp = { open: false, cat: 0, q: '', veg: false, view: 'menu', sent: '' };
try {
  const g = JSON.parse(localStorage.getItem('se_guest') || '{}');
  if (g.name) ord.name = g.name;
  
} catch (e) {}
if (isRoomLocked) {
  ord.room = lockedRoom;
}
const num=s=>{let d=String(s||'').replace(/\D/g,'');if(d.length===10)d='91'+d;return d.length>=11?d:''};
const dest=t=>t==='food'?S.order.food:S.order.desk;
const qty=k=>ord.cart[k]||0,rs=v=>{const n=parseFloat(v);return isNaN(n)?0:n};

function lines(){const f=[],t=[];S.menu.forEach(c=>c.items.forEach(i=>{const q=qty('f:'+i.id);if(q&&i.a)f.push({q,n:i.n,p:i.p,k:'f:'+i.id})}));S.toil.forEach(i=>{const q=qty('t:'+i.id);if(q&&i.a)t.push({q,n:i.n,p:i.p,k:'t:'+i.id})});return{f,t}}
const items=k=>{const l=lines();return k==='food'?l.f:k==='toil'?l.t:[]};
const cnt=k=>items(k).reduce((s,x)=>s+x.q,0),tot=k=>items(k).reduce((s,x)=>s+x.q*rs(x.p),0);
const sumText=k=>{if(k==='msg')return ord.msg.trim()?'Message ready':'Write your message';const c=cnt(k),t=tot(k);return c?`${c} item${c>1?'s':''}${t?` · Rs ${t}`:''}`:'Nothing added yet'};
const TL={food:'Goes to: Kitchen',toil:'Goes to: Reception (toiletries)',msg:'Goes to: Reception (message)'};

function buildMsg(bold,k){const B=x=>bold?'*'+x+'*':x,ln=x=>`- ${x.q} x ${x.n}${rs(x.p)?` (Rs ${rs(x.p)})`:''}`,ti={food:'New Food Order',toil:'New Toiletries Request',msg:'New Message'}[k],L=[B(S.hotel.name+' - '+ti),'Room: '+ord.room.trim(),'Name: '+ord.name.trim()];
 if(k==='msg')L.push('',B('MESSAGE'),ord.msg.trim());else L.push('',B(k==='food'?'FOOD':'TOILETRIES'),...items(k).map(ln));
 if(ord.note.trim())L.push('',B('NOTE'),ord.note.trim());const tt=tot(k);if(tt)L.push('','Total: Rs '+tt);L.push('',new Date().toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}));return L.join('\n')}

const stepper=(k,q)=>`<div class="qty"><button data-act="qq" data-k="${k}" data-d="-1" aria-label="Remove one">-</button><span>${q}</span><button class="p" data-act="qq" data-k="${k}" data-d="1" aria-label="Add one">+</button></div>`;
const fCtl=k=>qty(k)?stepper(k,qty(k)):`<button class="btn add" data-act="qq" data-k="${k}" data-d="1">Add</button>`;
const fCard=i=>{const k='f:'+i.id;return `<div class="fc ${i.a?'':'off'}"><span class="vd ${i.v?'v':'n'}"></span><div class="im"><b>${esc(i.n)}</b>${i.d?`<small>${esc(i.d)}</small>`:''}<span class="fprice">${i.p?'Rs '+esc(i.p):''}</span></div>${i.a?`<div class="fctl">${fCtl(k)}</div>`:'<span class="sold">Sold out</span>'}</div>`};

function fList(){const n=fp.q.toLowerCase(),src=fp.q?S.menu.flatMap(x=>x.items):(S.menu[fp.cat]||{items:[]}).items;
 const it=src.filter(i=>(!fp.veg||i.v)&&(!n||(i.n+' '+i.d).toLowerCase().includes(n))).map(fCard).join('')||'<p class="mu" style="padding:14px 0">No dishes match.</p>';
 return (fp.q?'':`<div class="pills sticky">${S.menu.map((x,i)=>`<button class="pill ${i===fp.cat?'on':''}" data-act="fcat" data-i="${i}">${esc(x.cat)}</button>`).join('')}</div>`)+it}

function fBar(){const c=cnt('food'),t=tot('food');return c?`<button class="btn" data-act="freview">View order · ${c} item${c>1?'s':''}${t?' · Rs '+t:''}</button>`:''}

function formHtml(tab){if(isRoomLocked){ord.room=lockedRoom;}const f=tab==='food',p=f?'f':'o',d=dest(tab),wa=num(d.wa),sm=num(d.sms)||wa;
 return `<div class="oform"><div class="two"><input id="${p}n" placeholder="Your name *" maxlength="60" value="${esc(ord.name)}" autocomplete="name">${isRoomLocked ? `<div style="display:flex;flex-direction:column;flex:1"><input id="${p}r" placeholder="Room no." maxlength="10" value="${esc(ord.room)}" readonly style="background:rgba(214,178,94,0.15);cursor:not-allowed;font-weight:700;border-color:var(--gold)"><small style="color:var(--gl);font-size:0.75rem;margin-top:2px;font-weight:700">🔒 Room ${esc(ord.room)} verified</small></div>` : `<input id="${p}r" placeholder="Room no. *" maxlength="10" value="${esc(ord.room)}">`}</div><input id="${p}x" placeholder="Extra note (optional)" maxlength="300" value="${esc(ord.note)}"><div class="odest">${TL[tab]}</div>${f?'':`<div class="osum" id="osum">${sumText(tab)}</div>`}<div class="oerr" id="${f?'ferr':'oerr'}">${esc(ord.err)}</div><div class="oalert" style="margin:10px 0 12px;padding:12px 14px;background:rgba(214,178,94,0.08);color:var(--gl);border:1px solid rgba(214,178,94,0.35);border-radius:2px;font-size:0.83rem;line-height:1.45;text-align:left">⚠️ <b>सूचना / Notice:</b> कृपया विचारपूर्वक ऑर्डर करा. ऑर्डर केल्यानंतर ती रद्द केली जाऊ शकत नाही आणि हॉटेलचे नुकसान टाळण्यासाठी योग्य ती कारवाई केली जाऊ शकते. / Please order responsibly. Once an order is placed, it CANNOT be cancelled and appropriate action may be taken to prevent hotel loss. Thank you!</div>${wa||sm?'':'<p class="mu" style="font-size:.9rem;margin:4px 0 8px">Reception has not set up the ordering number yet. Tap Copy order and show it at reception, or call.</p>'}<div class="osend">${wa?`<button class="btn" data-act="${p}wa">Send on WhatsApp</button>`:''}${sm?`<button class="btn g" data-act="${p}sms">Send as SMS</button>`:''}<button class="btn g" data-act="${p}copy">Copy order</button></div></div>`}

function fCheck(){
 if(fp.view==='sent')return `<div class="ocnf"><h2>Almost done!</h2><p>${fp.sent==='wa'?'WhatsApp':'Your messaging app'} has opened with your food order. <b>Press Send there to place it.</b> If nothing opened, go back and tap Copy order, then show it at reception.</p><div class="osend"><button class="btn g" data-act="fcheckback">Back</button><button class="btn" data-act="fnew">New order</button></div></div>`;
 const l=items('food'),t=tot('food');
 return `<h2 style="margin:14px 0 4px">Your order</h2>${l.map(x=>`<div class="oi"><div class="im"><b>${esc(x.n)}</b>${rs(x.p)?`<small>Rs ${rs(x.p)} each</small>`:''}</div>${stepper(x.k,x.q)}</div>`).join('')||'<p class="mu">Your order is empty. Go back and add dishes.</p>'}${t?`<div class="osum" style="margin:10px 0">Total: Rs ${t}</div>`:''}${l.length?formHtml('food'):''}`}

function foodPage(){const m=fp.view==='menu';return `<div class="fpage ${fp.open?'open':''}" id="fpage"><div class="fh"><button data-act="fback" aria-label="Back">←</button><b>Order Food</b></div><div id="ftools" class="ftools ${m?'':'hidden'}"><input id="fs" type="search" placeholder="Search dishes…" value="${esc(fp.q)}"><label class="sw"><input type="checkbox" id="fv" ${fp.veg?'checked':''}>Veg only</label></div><div id="flist">${m?fList():''}</div><div id="fcheck" class="fcheck">${m?'':fCheck()}</div><div class="fbar" id="fbar">${m?fBar():''}</div></div>`}

function paintFood(){const m=fp.view==='menu',l=$('#flist'),c=$('#fcheck'),b=$('#fbar'),t=$('#ftools');if(l)l.innerHTML=m?fList():'';if(c)c.innerHTML=m?'':fCheck();if(b)b.innerHTML=m?fBar():'';if(t)t.classList.toggle('hidden',!m)}

const oRow=(k,n,p)=>`<div class="oi"><div class="im"><b>${esc(n)}</b>${p?`<small>Rs ${esc(p)}</small>`:''}</div>${stepper(k,qty(k))}</div>`;

function odyn(){
 if(!S.order.on)return '<p class="mu" style="padding:20px 4px">Ordering is switched off right now. Please call reception.</p>';
 if(ord.sent){const w={toil:'toiletries request',msg:'message'}[ord.sentTab]||'request';return `<div class="ocnf"><h2>Almost done!</h2><p>${ord.sent==='wa'?'WhatsApp':'Your messaging app'} has opened with your ${w}. <b>Press Send there to place it.</b> If nothing opened, go back and tap Copy order, then send it to reception.</p><div class="osend"><button class="btn g" data-act="oback">Back</button><button class="btn" data-act="onew">New ${ord.sentTab==='msg'?'message':'request'}</button></div></div>`}
 if(ord.view==='checkout')return checkoutHtml();
 const tabs=[['toil','🧴 Amenities'],['msg','💬 Message']].map(t=>{const n=t[0]==='toil'?cnt('toil'):0;return `<button class="pill ${ord.tab===t[0]?'on':''}" data-act="otab" data-t="${t[0]}">${t[1]}${n?` (${n})`:''}</button>`}).join('');
 const b=ord.tab==='toil'?(S.toil.filter(i=>i.a&&i.n).map(i=>oRow('t:'+i.id,i.n,i.p)).join('')||'<p class="mu">No items available right now.</p>'):`<label>Message to staff</label><textarea id="omsg" rows="5" maxlength="500" placeholder="e.g. Please arrange extra water bottles or wake-up call at 7 AM">${esc(ord.msg)}</textarea>`;
 return `<div class="otabs">${tabs}</div>${b}`}

function checkoutHtml(){const t=ord.tab;let b;
 if(t==='msg')b=`<h2 style="margin:10px 0 6px">Your message</h2><div class="pickc" style="white-space:pre-wrap;margin-top:0">${esc(ord.msg)}</div>`;
 else{const l=items('toil');b=`<h2 style="margin:10px 0 4px">Your cart</h2>`+(l.map(x=>`<div class="oi"><div class="im"><b>${esc(x.n)}</b>${rs(x.p)?`<small>Rs ${rs(x.p)} each</small>`:''}</div>${stepper(x.k,x.q)}</div>`).join('')||'<p class="mu">Your cart is empty. Go back and add items.</p>')}
 return b+formHtml(t)+`<div class="osend" style="margin:0 0 14px"><button class="btn g" data-act="obackbrowse">← Back</button></div>`}

function obar(){if(!S.order.on||ord.sent||ord.view==='checkout')return '';if(ord.tab==='toil'){const c=cnt('toil'),t=tot('toil');return `<div class="obar">${c?`<button class="btn" data-act="oview">View cart · ${c} item${c>1?'s':''}${t?' · Rs '+t:''}</button>`:'<span class="mu">Add items to see your cart</span>'}</div>`}return ord.msg.trim()?'<div class="obar"><button class="btn" data-act="oview">Continue</button></div>':''}

function orderUI(){return `<div class="osheet ${ord.open?'open':''}" id="osheet"><div class="oh"><b>Room requests & amenities</b><button data-act="oclose" aria-label="Close">✕</button></div><div id="odyn">${odyn()}</div><div id="ofw">${obar()}</div></div>`}
function paintOrder(){const d=$('#odyn');if(d)d.innerHTML=odyn();const f=$('#ofw');if(f)f.innerHTML=obar()}

function afterQty(k,t){if(k[0]==='f'){if(fp.view==='checkout')return paintFood();const c=t.closest('.fctl');if(c)c.innerHTML=fCtl(k);const b=$('#fbar');if(b)b.innerHTML=fBar()}else{const sp=t.parentElement.querySelector('span');if(sp)sp.textContent=qty(k);const sm=$('#osum');if(sm)sm.textContent=sumText(ord.tab);const tb=document.querySelector('.otabs .pill.on');if(tb&&ord.tab==='toil'){const c=cnt('toil');tb.textContent='🧴 Amenities'+(c?` (${c})`:'')}const o=$('#ofw');if(o)o.innerHTML=obar()}}

function validate(tab){if(isRoomLocked){ord.room=lockedRoom;}if(ord.name.trim().length<2)return 'Please enter your name.';if(!ord.room.trim())return 'Please enter your room number.';if(tab==='msg'){if(!ord.msg.trim())return 'Please write your message.'}else if(!cnt(tab))return 'Add at least one item.';return ''}

function sendOrder(kind,tab){ord.err=validate(tab);const e=$(tab==='food'?'#ferr':'#oerr');if(e)e.textContent=ord.err;if(ord.err)return;
 try{localStorage.setItem('se_guest',JSON.stringify({name:ord.name.trim()}))}catch(x){}
 if(kind==='copy'){const m=buildMsg(false,tab);(navigator.clipboard?navigator.clipboard.writeText(m):Promise.reject()).then(()=>toast('Order copied')).catch(()=>toast('Copy not available'));return}
 // Background push to Kitchen & Staff Dashboard in Supabase
 if(SB && kind !== 'copy'){
   const orderId = 'ORD-SE-' + Date.now().toString().slice(-4) + '-' + Math.floor(100 + Math.random()*900);
   const isFood = (tab === 'food');
   const orderPayload = {
     id: orderId,
     type: isFood ? 'restaurant:shreeexecutive' : 'hotel:shreeexecutive',
     room: ord.room.trim() + (ord.name.trim() ? ' (' + ord.name.trim() + ')' : ''),
     items: isFood ? items('food').map(x=>({name:x.n, price:rs(x.p), q:x.q})) : [],
     total: isFood ? tot('food') : 0,
     note: isFood ? ord.note.trim() : (ord.msg.trim() || ord.note.trim()),
     service_title: isFood ? '' : (ord.tab==='msg' ? 'Guest Message' : items('toil').map(x=>x.q+'x '+x.n).join(', ')),
     status: 'pending',
     reject_reason: '',
     created_at: new Date().toISOString(),
     updated_at: new Date().toISOString()
   };
   addMyStoredOrderId(orderId);
   guestOrders.unshift(orderPayload);
   SB.from('orders').insert(orderPayload).then(()=>{
     if(typeof fetchLiveOrders === 'function') fetchLiveOrders();
   }).catch(e=>console.warn('Dashboard sync:', e));
 }
 const d=dest(tab),wa=num(d.wa),sm=num(d.sms)||wa,u=kind==='wa'?`https://wa.me/${wa}?text=${encodeURIComponent(buildMsg(true,tab))}`:`sms:+${sm}?&body=${encodeURIComponent(buildMsg(false,tab))}`;
 const a=document.createElement('a');a.href=u;if(kind==='wa'){a.target='_blank';a.rel='noopener'}document.body.appendChild(a);a.click();a.remove();
 if(tab==='food'){fp.view='sent';fp.sent=kind;paintFood()}else{ord.sent=kind;ord.sentTab=tab;paintOrder()}boom($(tab==='food'?'#fpage':'#osheet'))}

document.addEventListener('input',e=>{const i=e.target.id,v=e.target.value;if(i==='on'||i==='fn')ord.name=v;else if(i==='or'||i==='fr'){if(!isRoomLocked)ord.room=v;}else if(i==='ox'||i==='fx')ord.note=v;else if(i==='omsg'){ord.msg=v;const f=$('#ofw');if(f)f.innerHTML=obar()}else if(i==='fs'){fp.q=v;const l=$('#flist');if(l)l.innerHTML=fList()}else if(i==='fv'){fp.veg=e.target.checked;const l=$('#flist');if(l)l.innerHTML=fList()}});

document.addEventListener('pointermove',e=>{
  const k=$('#kc'),hr=$('#hero');if(!k||!hr)return;
  const r=hr.getBoundingClientRect(),cl=v=>Math.max(-.5,Math.min(.5,v)),
        x=cl((e.clientX-r.left)/r.width-.5),y=cl((e.clientY-r.top)/r.height-.5);
  k.style.setProperty('--ry',(x*28-6).toFixed(1)+'deg');
  k.style.setProperty('--rx',(8-y*20).toFixed(1)+'deg');
  k.style.setProperty('--sx',x.toFixed(2));
});

const CFG=window.APP_CONFIG||{};
const SB=(window.supabase&&CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!/PASTE_/.test(CFG.SUPABASE_ANON_KEY))?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;

function loginModal(){
 return `<div class="modal"><div class="card"><h2>Admin login</h2><input id="pw" type="password" placeholder="Password" autocomplete="current-password"><div class="st" id="lst"></div><div class="bar"><button class="btn g" data-act="closelogin">Cancel</button><button class="btn" data-act="dologin">Unlock</button></div></div></div>`;
}

async function fetchConfig(){
 const cfgId = CFG.CONFIG_ID || 3;
 let dbData = null;
 if(SB){
   try{
     const {data,error}=await SB.from('site_config').select('data').eq('id',cfgId).single();
     if(!error && data) dbData = data.data;
   }catch(e){}
 }
 if(!dbData){
   S={
     hotel:{name:'Hotel Shree Executive',tagline:'An Executive Stay',phone:'+91 9876543210',ai_info:'Welcome to Hotel Shree Executive. Premium executive hospitality, banquet facilities, and 24/7 room service.'},
     wifi:{name:'ShreeExecutive_Guest',pass:'welcome123'},
     review:'https://www.google.com/search?q=Hotel+Shree+Executive+reviews',
     rules:['Check-out time is 11:00 AM.','Quiet hours after 10:00 PM.','No smoking inside rooms.','A valid photo ID is required for every guest.','Please keep your room key safe.'],
     menu:[
       {cat:'Breakfast (सकाळचा नाश्ता)',items:[
         {id:'bk1',n:'Pohe (पोहे)',p:'50',d:'Traditional tempered flattened rice with roasted peanuts',v:true,a:true},
         {id:'bk2',n:'Upma (उपमा)',p:'50',d:'Roasted semolina cooked with mustard seeds and curry leaves',v:true,a:true},
         {id:'bk3',n:'Masala Omelette',p:'80',d:'Two eggs beaten with onions, tomatoes, green chillies & herbs',v:false,a:true},
         {id:'bk4',n:'Puri Bhaji (पुरी भाजी)',p:'90',d:'Four hot puffed wheat puris served with spiced potato bhaji',v:true,a:true},
         {id:'bk5',n:'Masala Chai (मसाला चहा)',p:'25',d:'Fresh ginger cardamom brewed tea',v:true,a:true},
         {id:'bk6',n:'Hot Filter Coffee',p:'35',d:'Rich aromatic south Indian style filter brew',v:true,a:true}
       ]},
       {cat:'Starters (स्टार्टर्स)',items:[
         {id:'a1',n:'Paneer Tikka',p:'260',d:'Char-grilled cottage cheese marinated in spiced hung curd',v:true,a:true},
         {id:'a2',n:'Chicken Malai Tikka',p:'320',d:'Succulent chicken cubes in creamy cashew cheese marinade',v:false,a:true},
         {id:'a3',n:'Veg Spring Rolls',p:'180',d:'Crisp golden rolls stuffed with shredded vegetables & sweet chilli dip',v:true,a:true},
         {id:'a4',n:'Crispy Corn Chilli Pepper',p:'210',d:'Crunchy sweet corn kernels tossed with peppers and garlic',v:true,a:true},
         {id:'a5',n:'Chicken Tikka',p:'290',d:'Classic clay-oven roasted chicken spiced with red chilli & mustard oil',v:false,a:true}
       ]},
       {cat:'Main Course (मुख्य जेवण)',items:[
         {id:'b1',n:'Dal Makhani',p:'240',d:'Slow-cooked black lentils simmered overnight with butter and fresh cream',v:true,a:true},
         {id:'b2',n:'Butter Chicken',p:'340',d:'Tender roasted chicken in silky rich tomato-butter gravy',v:false,a:true},
         {id:'b3',n:'Veg Dum Biryani',p:'260',d:'Layered basmati rice with seasonal vegetables & served with raita',v:true,a:true},
         {id:'b4',n:'Paneer Butter Masala',p:'270',d:'Cottage cheese cubes tossed in rich tomato cashew gravy',v:true,a:true},
         {id:'b5',n:'Chicken Curry Thali',p:'310',d:'Homestyle spicy chicken curry, fragrant rice, 2 rotis & salad',v:false,a:true},
         {id:'b6',n:'Butter Naan',p:'45',d:'Soft leavened flatbread brushed with melted butter',v:true,a:true}
       ]},
       {cat:'Evening Snacks (संध्याकाळचा नाश्ता)',items:[
         {id:'sn1',n:'French Fries',p:'120',d:'Golden crispy salted fries with tomato ketchup',v:true,a:true},
         {id:'sn2',n:'Veg Spring Rolls',p:'180',d:'Crisp vegetable rolls with sweet chilli dip',v:true,a:true},
         {id:'sn3',n:'Chicken Salt & Pepper',p:'260',d:'Crisp chicken tossed with cracked black pepper and scallions',v:false,a:true},
         {id:'sn4',n:'Fresh Lime Soda',p:'70',d:'Sweet or salted chilled soda with fresh lemon juice',v:true,a:true},
         {id:'sn5',n:'Cold Coffee with Ice Cream',p:'130',d:'Rich blended creamy coffee topped with vanilla scoop',v:true,a:true},
         {id:'sn6',n:'Masala Chai',p:'25',d:'Hot brewed cardamom tea',v:true,a:true}
       ]},
       {cat:'Sweets & Drinks (मिठाई व पेये)',items:[
         {id:'c1',n:'Gulab Jamun',p:'90',d:'Two warm melt-in-the-mouth khoya balls in saffron sugar syrup',v:true,a:true},
         {id:'c2',n:'Cold Coffee',p:'110',d:'Chilled frothy coffee',v:true,a:true},
         {id:'c3',n:'Fresh Lime Soda',p:'70',d:'Sweet or salted',v:true,a:true},
         {id:'c4',n:'Malai Kulfi',p:'80',d:'Traditional slow-churned condensed milk ice cream',v:true,a:true}
       ]}
     ],
     notices:[{id:'n1',t:'Welcome to Hotel Shree Executive. Please contact reception if you need anything.',time:'Sample notice'}],
     order:{on:true,food:{wa:'919876543210',sms:''},desk:{wa:'919876543210',sms:''}},
     toil:[
       {id:'t1',n:'Executive Dental Kit',p:'',a:true},
       {id:'t2',n:'Luxury Bath Soap',p:'',a:true},
       {id:'t3',n:'Premium Shampoo',p:'',a:true},
       {id:'t4',n:'Extra Bath Towel',p:'',a:true},
       {id:'t5',n:'Extra Pillow',p:'',a:true},
       {id:'t6',n:'Warm Blanket',p:'',a:true},
       {id:'t7',n:'Executive Shaving Kit',p:'',a:true},
       {id:'t8',n:'Room Slippers',p:'',a:true}
     ],
     pw:'b5568af32829c2152598164f09862ef657c347d654d7c017f58799ca7774b032'
   };
   if(SB){
     try{ await SB.from('site_config').insert({id:cfgId,data:S}) }catch(e){}
   }
 } else {
   S=dbData;
 }
 normalize();
 document.title=S.hotel.name||document.title;
}

async function refresh(){
 try{
   await fetchConfig();
   if(!ord.open&&!fp.open&&!chatOpen&&!login&&!admin)render();
 }catch(e){}
}

function fail(t,m){
 document.getElementById('app').innerHTML='<div class="wrap"><div class="card"><h2>'+esc(t)+'</h2><p>'+esc(m)+'</p></div></div>';
}

function fetchLiveOrders(){
  if(!SB)return;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  if(admin){
    SB.from('orders').select('*').in('type',['restaurant:shreeexecutive','hotel:shreeexecutive']).gte('created_at',ninetyDaysAgo).order('created_at',{ascending:false}).limit(100).then(({data,error})=>{
      if(error||!data)return;
      let hasNew = false;
      data.forEach(o=>{
        if(!lastKnownOrderIds.has(o.id)){
          if(lastKnownOrderIds.size>0 && o.status==='pending') hasNew = true;
          lastKnownOrderIds.add(o.id);
        }
      });
      liveOrders = data;
      if(hasNew && admin && !isRoomLocked && soundEnabled) playChime();
      if(admin && (tab==='kitchen'||tab==='staff')){
        render();
      }
    }).catch(()=>{});
  } else {
    // Guest Live Tracking Poll
    const myIds = getMyStoredOrderIds();
    let q = SB.from('orders')
      .select('*')
      .in('type', ['restaurant:shreeexecutive', 'hotel:shreeexecutive'])
      .gte('created_at', ninetyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if(isRoomLocked){
      q = q.like('room', lockedRoom + '%');
    } else if(myIds.length){
      q = q.in('id', myIds);
    } else {
      return;
    }

    q.then(({data, error}) => {
      if(error || !data) return;
      guestOrders = data;
      const act = getActiveGuestOrders();

      // Update dock badge without full re-render
      const dBtn = document.querySelector('#docktrack');
      if(dBtn){
        let b = dBtn.querySelector('.dock-badge');
        if(act.length){
          if(!b){
            b = document.createElement('b');
            b.className = 'dock-badge';
            dBtn.appendChild(b);
          }
          b.textContent = act.length;
        } else if(b){
          b.remove();
        }
      }

      // If tracking sheet is currently open, refresh only its content every 5s
      // BUT if the guest is currently typing in the feedback box, do NOT wipe out their textarea!
      if(trackSheetOpen){
        const activeEl = document.activeElement;
        const isTyping = activeEl && (activeEl.classList.contains('trb-fb-txt') || activeEl.id === 'gtrfbtxt');
        const hasFeedbackOpen = Object.values(reviewBoxState).some(s => s && s.status === 'feedback_open');
        if(!isTyping && !hasFeedbackOpen){
          const tc = document.querySelector('#tracksheet .track-sheet-content');
          if(tc) tc.innerHTML = renderGuestOrdersList();
        }
      }
    }).catch(()=>{});
  }
}
setInterval(fetchLiveOrders, 15000); // 15s polling for all views

async function boot(){
 try{
   await fetchConfig();
 }catch(e){
   return fail('Could not load site',(e&&e.message)||'Unknown error');
 }
 AI=true;
 if(admin && !isRoomLocked) tab = 'kitchen';
 fetchLiveOrders();
 render();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
boot();



document.addEventListener('input', e => {
  if(e.target && e.target.classList.contains('trb-fb-txt')){
    const box = e.target.closest('.toc-review-box');
    if(box && box.id){
      const oid = box.id.replace('revbox_', '');
      if(reviewBoxState[oid]) reviewBoxState[oid].text = e.target.value;
    }
  }
});
