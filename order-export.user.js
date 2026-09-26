// ==UserScript==
// @name         订单抓取（拼多多 / 淘宝）
// @namespace    xiaoshu
// @version      3.9.2
// @description  在订单页一键抓取订单表格，导出 CSV。脚本自己不联网、不读 cookie、不调接口，只读屏幕上已有的内容；分页的平台（如京东）会替你点「下一页」。
// @author       xiaoshu
// @match        *://*.yangkeduo.com/*
// @match        *://*.taobao.com/*
// @match        *://*.order.jd.com/*
// @match        *://*.1688.com/*
// @match        *://*.chaoshi.tmall.com/*
// @match        *://*.suning.com/*
// @match        *://*.gome.com.cn/*
// @match        *://*.dangdang.com/*
// @match        *://*.yhd.com/*
// @match        *://*.amazon.cn/*
// @match        *://*.vip.com/*
// @match        *://*.jumei.com/*
// @match        *://*.mogujie.com/*
// @match        *://*.mi.com/*
// @match        *://*.youpin.mi.com/*
// @match        *://*.vmall.com/*
// @match        *://*.honor.com/*
// @match        *://*.opposhop.cn/*
// @match        *://*.vivo.com.cn/*
// @match        *://*.lenovo.com.cn/*
// @match        *://*.apple.com.cn/*
// @match        *://*.you.163.com/*
// @match        *://*.ikea.cn/*
// @match        *://*.miniso.com/*
// @match        *://*.xiaohongshu.com/*
// @match        *://*.douyin.com/*
// @match        *://*.kuaishou.com/*
// @match        *://*.bilibili.com/*
// @match        *://*.smzdm.com/*
// @match        *://*.weibo.com/*
// @match        *://*.tmall.hk/*
// @match        *://*.jd.hk/*
// @match        *://*.kaola.com/*
// @match        *://*.aliexpress.com/*
// @match        *://*.temu.com/*
// @match        *://*.shein.com/*
// @match        *://*.amazon.com/*
// @match        *://*.ebay.com/*
// @match        *://*.shopee.cn/*
// @match        *://*.iherb.com/*
// @match        *://*.goofish.com/*
// @match        *://*.zhuanzhuan.com/*
// @match        *://*.aihuishou.com/*
// @match        *://*.kongfz.com/*
// @match        *://*.duozhuayu.com/*
// @match        *://*.dewu.com/*
// @match        *://*.nice.com/*
// @match        *://*.shihuo.cn/*
// @match        *://*.secoo.com/*
// @match        *://*.sephora.cn/*
// @match        *://*.watsons.com.cn/*
// @match        *://*.freshhema.com/*
// @match        *://*.ddmc.com/*
// @match        *://*.pupuapi.com/*
// @match        *://*.meituan.com/*
// @match        *://*.ele.me/*
// @match        *://*.dmall.com/*
// @match        *://*.ctrip.com/*
// @match        *://*.fliggy.com/*
// @match        *://*.qunar.com/*
// @match        *://*.ly.com/*
// @match        *://*.mafengwo.cn/*
// @match        *://*.12306.cn/*
// @match        *://*.pinduoduo.com/*
// @match        *://*.tmall.com/*
// @match        *://*.jd.com/*

// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

// ============================================================
//  平台无关设计
//    上面列了 63 个电商域名（从网页的平台清单自动同步生成，
//    改平台请改网页的 PLATFORMS 后跑 py _sync_platforms.py，别手改这里）。
//
//    脚本会在这些站的任意页面运行，但【不会】到处弹面板：
//    先静默扫一遍，真找到订单卡片才展开；找不到只留一个半透明小圆钮。
//
//    想强制叫出面板：Ctrl+Shift+E（任何页面都行）。
// ============================================================

// ============================================================
//  安全说明（这段代码只做三件事）
//    · 读页面上的文字和结构
//    · 给元素加红框、往页面塞一个按钮（纯视觉）
//    · 存成本地文件
//  脚本自己不发任何网络请求、不读 cookie、不调接口、不改数据。
//
//  会「替你操作页面」的只有「加载更多」，两个动作：
//    · 往下滚动（无限滚动的平台）—— 跟人手动滚一样，间隔 1.4 秒
//    · 点页面上的「下一页」（分页的平台，如京东）—— 间隔 2.6 秒
//  发出的请求都是页面自己发的，跟手动操作一模一样，只是不用你点。
//
//  刹车：随时可点停 / 连续 3 页没新增自动停 / 最多 20 页 /
//        点完「下一页」页面没变化就立刻停手（防点错东西）。
// ============================================================

(function () {
  'use strict';

  // ---------------- 常量 ----------------
  var RE_MONEY  = /[¥￥]\s*\d/;
  var RE_PAID   = /实\s*付[^\d¥￥]{0,10}[¥￥]?\s*(\d+(?:\.\d{1,2})?)/;
  var RE_AMOUNT = /[¥￥]\s*(\d+(?:\.\d{1,2})?)/g;
  // 订单状态 —— 尽量放宽。
  // 各家平台叫法完全不同，少写一个词那个平台就整个认不出来：
  //   淘宝 / 拼多多：待收货、已签收、交易成功
  //   京东：        等待收货、已完成、等待付款   ← 之前漏了这些，京东就抓不到
  //   1688：        待收货、交易关闭
  var STATUS_WORDS = [
    '待付款', '待支付', '等待付款', '等待支付', '待发货', '等待发货',
    '待收货', '等待收货', '运输中', '已发货', '已签收', '已收货', '确认收货',
    '待评价', '交易成功', '交易完成', '已完成', '已取消', '交易关闭', '已关闭',
    '退款成功', '退款中', '已退款', '部分退款', '退货中', '售后中',
    '待成团', '拼团中', '待确认', '部分发货',
    // 京东的中间态 / 其他平台的少见状态
    '正在出库', '出库中', '待出库', '待审核', '已下单', '订单已提交',
    '待打印', '拣货中', '配送中', '已送达', '退货完成', '退款关闭'
  ];
  var RE_STATUS = new RegExp('(' + STATUS_WORDS.join('|') + ')');

  var RE_LOGISTICS = /(快递|速递|物流|分拨|送达|取件|电联|投诉电话|预计|派送|揽收|转运|签收人|驿站|凭取件码|专属电话)/;
  var RE_BUTTON = /^(确认收货|查看物流|申请售后|申请退款|更多|评价|再次购买|删除订单|取消订单|联系客服|催发货|延长收货|追加评价|查看详情|去评价|立即付款|加入购物车|立即购买)/;
  var RE_SKIPLINE = /^(待付款|待发货|待收货|运输中|已发货|已签收|待评价|交易成功|交易完成|已取消|退款|¥|￥|实付|先用后付|退货包运费|7天无理由)/;
  var RE_REFUND = /^(退款成功|已退款|退款完成|退款中)/;
  var RE_SHIPSTATE = /^\s*(运输中|派送中|投递中|已签收|已揽收|待揽收|已发货|已到达)/;
  // 规格 / 元信息行 —— 表格布局里这些行很短，很容易被误当成店名
  //   1688：「颜色分类:2大提」「订单号 3291…｜下单账号 tb84…」
  var RE_SPEC = /^(颜色分类|规格|尺码|型号|分类|款式|口味|套餐|版本|净含量|尺寸|容量|数量|单价|总金额|订单号|下单账号|卖家|货品|交易操作|实付|合计)/;
  // 「像店名」的行：含 旗舰店/专营店… 或 以 店/商城/公司… 结尾
  var RE_SHOP = new RegExp(
    '(旗舰店|专营店|专卖店|官方店|工厂店|自营店|旗舰|自营)' +
    '|(店|商城|公司|商行|超市|药房|百货|工贸|贸易|实业|供应链|经营部|工厂)$'
  );
  var KNOWN_COURIER = ['顺丰', '京东', '韵达', '圆通', '中通', '申通', '极兔', '邮政', '百世', '天天', '德邦', '菜鸟', 'EMS', '丰巢'];
  var SHOP_MAX = 25;

  var HEAD = ['序号', '分类', '店铺', '商品名', '实付金额', '可信度', '订单状态',
              '物流公司', '物流状态', '是否退款', '备注', '原始文本'];

  // 分类规则 —— 想加类别/关键词，改这里
  var CATEGORY = [
    ['嵌入式用品', ['电烙铁', '焊锡', '烙铁', '镊子', '助焊', '元件', '电路板', 'pcb',
                    '贴片', '静电', '万用表', '杜邦线', '单片机', 'stm32',
                    '3d打印', '蝴蝶刀', '开发板', '传感器']],
    ['学习用品', ['书籍', '图书', '教材', '笔记本', '中性笔', '钢笔', '文具']]
  ];

  function classify(r) {
    var t = (r.name + ' ' + r.shop + ' ' + r.text).toLowerCase();
    for (var i = 0; i < CATEGORY.length; i++) {
      for (var j = 0; j < CATEGORY[i][1].length; j++) {
        if (t.indexOf(CATEGORY[i][1][j]) >= 0) return CATEGORY[i][0];
      }
    }
    return '生活用品';
  }

  // 备注：把「这行为什么可能不准」直接写成中文，用户不用记任何颜色代码
  function buildNote(r) {
    var n = [];
    if (r.paid === null) n.push('没认出金额，必须人工补');
    else if (r.conf === '低') n.push('页面有多个价格且没标「实付」，取了最小的，请核对');
    else if (r.conf === '中') n.push('没找到「实付」，用的是标价（常见于先用后付单，钱可能还没付）');
    if (r.refunded) n.push('已退款，不计入实际支出');
    return n.join('；');
  }

  // ---------------- 工具 ----------------
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
         + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function stablePath(el) {
    var parts = [], cur = el, guard = 0;
    while (cur && cur !== document.body && guard++ < 8) {
      var idx = 0, sib = cur;
      while ((sib = sib.previousElementSibling)) idx++;
      parts.unshift(cur.tagName + ':' + idx);
      cur = cur.parentElement;
    }
    return parts.join('>');
  }

  // ---------------- 翻页后自动抓（分页平台） ----------------
  // 提示里说「脚本会自动累积」，那就得真的自动 —— 不能让用户每翻一页
  // 都手动点一次「抓取本页」。
  var rescanTimer = null;
  var lastScanKey = '';
  var watching = false;

  function startPageWatch() {
    if (watching || typeof MutationObserver !== 'function') return;
    watching = true;
    new MutationObserver(function () {
      if (rescanTimer) clearTimeout(rescanTimer);
      rescanTimer = setTimeout(autoRescan, 1600);   // 等页面安定下来再扫
    }).observe(document.body, { childList: true, subtree: true });
  }

  function autoRescan() {
    if (!panelBuilt) return;
    if (scrollTimer) return;                        // 正在「加载更多」滚动，别插一脚
    if (panel.style.display === 'none') return;     // 面板收起来了，别打扰
    var cards = findCards();
    if (!cards.length) return;
    // 用「张数 + 第一张的内容」判断是不是换页了，避免无谓的重复扫描
    var key = cards.length + '|' + (cards[0].innerText || '').slice(0, 60);
    if (key === lastScanKey) return;
    lastScanKey = key;

    var m = mergeAcc(cards.map(extract));
    if (m.added > 0) {
      renderRows(m.rows, '翻页后自动抓取', m.added, cards.length);
    }
  }

  // ---------------- 跨页累积 ----------------
  // 有些平台（京东、当当…）是【分页】的：翻到第 2 页，第 1 页的订单
  // 就不在 DOM 里了。所以每抓到一页就存起来，翻页继续加，最后一起导出。
  //
  // 存在篡改猴自己的存储（GM_setValue）里 —— 不读页面数据、不上传。
  // 没有 GM 时退化成内存存储（测试环境、控制台版用得上）。
  var memStore = {};
  var ACC_KEY = 'xsh_acc_' + location.hostname;

  function storedGet(k) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(k, '');
    } catch (e) { /* 用内存兜底 */ }
    return memStore[k] || '';
  }

  function storedSet(k, v) {
    try {
      if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; }
    } catch (e) { /* 用内存兜底 */ }
    memStore[k] = v;
  }

  function loadAcc() {
    var raw = storedGet(ACC_KEY);
    if (!raw) return [];
    try {
      var a = JSON.parse(raw);
      return Object.prototype.toString.call(a) === '[object Array]' ? a : [];
    } catch (e) { return []; }
  }

  function saveAcc(rows) { storedSet(ACC_KEY, JSON.stringify(rows.slice(-3000))); }

  // 把本页抓到的并进累积池，按原始文本去重
  function mergeAcc(pageRows) {
    var acc = loadAcc();
    var seen = {};
    for (var i = 0; i < acc.length; i++) seen[acc[i].text] = 1;
    var added = 0;
    for (var j = 0; j < pageRows.length; j++) {
      if (!seen[pageRows[j].text]) { seen[pageRows[j].text] = 1; acc.push(pageRows[j]); added++; }
    }
    saveAcc(acc);
    return { rows: acc, added: added };
  }

  // ---------------- 找订单卡片 ----------------
  var CARD_SEL = 'div,li,article,section,tr,dd';

  // 从一批元素里挑出「同时含金额和状态词」的 → 订单卡片候选
  function collectCands(list) {
    var cands = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];

      // ⛔ 绝不把脚本自己的 UI 当订单内容。
      //
      // 踩过的坑（真的发生过）：面板里的预览区会打印前两单的原文，
      // 里面有「实付 ¥3.51」和「等待收货」，正好满足「同时含金额 + 状态」
      // 两道门槛 → 面板自己被当成一张订单卡片。
      // 更坏的是面板内容每扫一次都在变（计数、预览），于是累积池每扫一次
      // 就多一条假记录 —— 「加载更多」永远等不到「不再增长」，滚满 25 次才停，
      // 导出的表里还混着重复的金额。
      //
      // 用 closest 而不是引用外面的 panel 变量：这些函数会被测试单独切片跑。
      if (el.closest && el.closest('#xsh-panel,#xsh-orb')) continue;

      var t = el.textContent || '';
      if (t.length < 20 || t.length > 3000) continue;
      if (!RE_MONEY.test(t)) continue;
      if (!RE_STATUS.test(t)) continue;
      cands.push(el);
    }
    return cands;
  }

  // 取父「元素」。
  //
  // 坑：影子根（ShadowRoot）是 DocumentFragment，不是元素 ——
  // 所以影子根里的顶层元素，parentElement 是 **null**。
  // 直接用 parentElement 分组的话，凡是挂在影子根顶层的候选
  // 会被 `if (!p) return;` 静默丢掉，一张卡片都留不下。
  // 这里落到影子根的宿主上，就能接着往上走。
  function parentEl(el) {
    var p = el.parentElement;
    if (p) return p;
    var r = el.getRootNode ? el.getRootNode() : null;
    return (r && r.host) ? r.host : null;
  }

  // 分组：取成员最多的那一族
  function groupCands(cands) {
    var inner = cands.filter(function (el) {
      for (var j = 0; j < cands.length; j++) {
        var o = cands[j];
        if (o !== el && el.contains(o)) return false;
      }
      return true;
    });

    // 按「祖先的形状」分组，而不是按「祖先本身」。
    //
    // 踩过两次坑：
    //  ① key 里带祖先自己的序号 → 每张卡片各成一族，只抓到第一张。
    //  ② 只往上找两层不够。表格布局里候选元素是 <td> 里的 div，
    //     父元素是 td、祖父是 tr —— 而每行的 tr 是不同的元素，
    //     带序号又各成一族。1688 就是这么抓不到的。
    // 所以再往上取一层，且只记 tagName 不记序号。
    var groups = {};
    inner.forEach(function (el) {
      var p = parentEl(el);
      if (!p) return;
      var gp = parentEl(p);
      var gpp = gp ? parentEl(gp) : null;
      var k = (gpp ? stablePath(gpp) : '') + '>'
            + (gp ? gp.tagName : '') + '>' + p.tagName;
      (groups[k] = groups[k] || []).push(el);
    });

    var best = null;
    Object.keys(groups).forEach(function (k) {
      if (!best || groups[k].length > best.length) best = groups[k];
    });

    return best || [];
  }

  // 收集本页所有「开放影子根」（web component 内部的一片 DOM）。
  // 跨不进闭合影子根，那没办法；开放的能进。
  function openShadowRoots() {
    var roots = [];
    var all;
    try { all = document.querySelectorAll('*'); } catch (e) { return roots; }
    if (all.length > 20000) return roots;          // 太大就别翻了，免得卡

    var hosts = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) { roots.push(all[i].shadowRoot); hosts.push(all[i].shadowRoot); }
    }
    // 影子根里还能再套影子根，往下再找一层就够用了
    for (var r = 0; r < hosts.length; r++) {
      var inner;
      try { inner = hosts[r].querySelectorAll('*'); } catch (e) { continue; }
      for (var j = 0; j < inner.length; j++) {
        if (inner[j].shadowRoot) roots.push(inner[j].shadowRoot);
      }
    }
    return roots;
  }

  // ---------------- 合成树扫描（真正能穿影子根的那条路） ----------------
  //
  // 为什么必须自己写一遍：
  //   `textContent` 和 `innerText` 都【不穿影子边界】——
  //   一个元素只能看到「自己那棵树」里的文本，影子里的一概看不到。
  //
  //   1688 的 air 订单页是 q-* web component 层层嵌套：
  //   金额在 <q-price> 的影子根里、状态在 <q-status> 的影子根里，
  //   而它们的共同祖先（那张卡片自己的 div）一个字符都读不到
  //   → 于是「同时含金额和状态」的元素恒为 0，看着像页面是空的。
  //
  //   2026-09-26 的实测诊断就是这么暴露的：
  //     浅层 75 个元素，含金额 0 个、含状态 0 个 —— 但同时存在
  //     44 个影子根、里面 136 个元素；页面上明明满屏订单。
  //
  // 做法：后序遍历整棵「合成树」（把每个元素的 shadowRoot 也算进它的子树），
  //   给每个元素算两个布尔：子树里有没有金额、有没有状态。
  //   然后挑「两个都有、但没有任何后代同时有两个」的元素 —— 也就是最内层的那个。
  //   一次遍历 O(n)，比反复调 textContent 快得多。
  var SKIP_TAG = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|HEAD|TITLE)$/;
  // 只把容器类标签当候选，免得把 <span>¥</span> 这种碎片也当成一张卡片
  var CONT_TAG = /^(DIV|LI|ARTICLE|SECTION|TR|DD|TD|UL|OL|TBODY|DL|DT|FORM|MAIN|NAV|ASIDE|P|SPAN|LABEL|BUTTON|A)$/;

  function scanComposed() {
    var cands = [];
    var seen = 0;

    // 返回 {m: 子树里有金额, s: 子树里有状态}
    function walk(node) {
      var m = false, s = false, childBoth = false;
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          var v = c.nodeValue || '';
          if (RE_MONEY.test(v)) m = true;
          if (RE_STATUS.test(v)) s = true;
          continue;
        }
        if (c.nodeType !== 1) continue;
        if (SKIP_TAG.test(c.tagName)) continue;
        if (++seen > 30000) return { m: m, s: s };     // 保险丝：别把页面卡死

        var r = walk(c);
        // 元素自带的影子根 = 它真正渲染出来的东西，必须一起算
        if (c.shadowRoot) {
          var rs = walk(c.shadowRoot);
          if (rs.m) r = { m: true, s: r.s };
          if (rs.s) r = { m: r.m, s: true };
        }
        if (r.m && r.s) childBoth = true;
        if (r.m) m = true;
        if (r.s) s = true;
      }

      // 最内层：自己子树里两样都有，但后代里没有谁是「两样都有」
      if (m && s && !childBoth && node.nodeType === 1 && CONT_TAG.test(node.tagName)) {
        // 脚本自己的面板绝不算订单（用 closest —— 这些函数会被测试单独切片跑）
        if (!(node.closest && node.closest('#xsh-panel,#xsh-orb'))) cands.push(node);
      }
      return { m: m, s: s };
    }

    walk(document);
    return cands;
  }

  function findCards() {
    // 常规：直接在本页浅层找。跑得通就立刻返回，一个字都不改 ——
    // 京东 / 拼多多 / 淘宝 走的都是这条，绝不能因为 1688 而受影响。
    var main = groupCands(collectCands(document.querySelectorAll(CARD_SEL)));
    if (main.length) return main;

    // 浅层一张都没找到 → 上合成树（能穿影子根）。
    var alt = groupCands(scanComposed());
    if (alt.length) return alt;

    // 最后的老兜底：翻两层影子根（3.9.1 加的，留着以防万一）
    var deeper = [];
    var roots = openShadowRoots();
    for (var r = 0; r < roots.length; r++) {
      var got = groupCands(collectCands(roots[r].querySelectorAll(CARD_SEL)));
      if (got.length > deeper.length) deeper = got;
    }
    return deeper;
  }

  // ---------------- 深度诊断：钱到底藏在第几层 ----------------
  //
  // 加这个的直接原因（2026-09-26）：
  //   1688 的诊断只有「浅层 75 个元素 / 含金额 0」，看不出钱藏哪一层，
  //   我只能靠猜 —— 猜错了就白折腾一轮，用户还得再点一次。
  //   现在直接把「金额文本」和它的祖先链打出来，一次定位。
  function deepReport() {
    var out = [];
    var n = 0, wm = 0, ws = 0, wb = 0, seen = 0;
    var samples = [];

    // 祖先链 —— 关键是能跨影子边界：parentElement 走到头之后，
    // 用 getRootNode().host 接到宿主元素上继续往上。
    function chain(el) {
      var parts = [], cur = el, g = 0;
      while (cur && cur.nodeType === 1 && g++ < 12) {
        var cn = '';
        var c = cur.className;
        if (typeof c === 'string' && c.trim()) {
          cn = '.' + c.trim().split(/\s+/).slice(0, 2).join('.');
        }
        parts.unshift(cur.tagName.toLowerCase() + (cur.id ? '#' + cur.id : '') + cn);
        var root = cur.getRootNode ? cur.getRootNode() : null;
        cur = cur.parentElement || (root && root.host) || null;
      }
      return parts.join(' > ');
    }

    function walk(node) {
      var m = false, s = false;
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          var v = c.nodeValue || '';
          if (RE_MONEY.test(v)) {
            m = true;
            if (samples.length < 6 && c.parentElement) {
              samples.push('「' + v.trim().replace(/\s+/g, ' ').slice(0, 26)
                           + '」\n        ' + chain(c.parentElement));
            }
          }
          if (RE_STATUS.test(v)) s = true;
          continue;
        }
        if (c.nodeType !== 1) continue;
        if (SKIP_TAG.test(c.tagName)) continue;
        if (++seen > 30000) return { m: false, s: false };

        n++;
        var r = walk(c);
        if (c.shadowRoot) {
          var rs = walk(c.shadowRoot);
          if (rs.m) r = { m: true, s: r.s };
          if (rs.s) r = { m: r.m, s: true };
        }
        if (r.m) { m = true; wm++; }
        if (r.s) { s = true; ws++; }
        if (r.m && r.s) wb++;
      }
      return { m: m, s: s };
    }

    walk(document);

    out.push('--- 深度扫描（连影子根一起，3.9.2 新增）---');
    out.push('扫描到的元素数（含影子根）: ' + n);
    out.push('  子树含金额的元素: ' + wm);
    out.push('  子树含订单状态的元素: ' + ws);
    out.push('  两样都有的元素（含祖先，最内层那几个才是候选）: ' + wb);
    if (samples.length) {
      out.push('  金额文本在哪（越靠右越接近它）:');
      for (var i = 0; i < samples.length; i++) out.push('    ' + samples[i]);
    } else {
      out.push('  ⚠ 一个金额文本都没扫到 —— 钱不是文字（CSS 画的）'
               + '，或者根本不在这个 frame 里');
    }
    return out;
  }

  // 元素自己或它的后代里有没有影子根（web component 内部）。
  function hasShadow(el) {
    if (el.shadowRoot) return true;
    var list;
    try { list = el.querySelectorAll('*'); } catch (e) { return false; }
    for (var i = 0; i < list.length; i++) {
      if (list[i].shadowRoot) return true;
    }
    return false;
  }

  // 取「看到的文本」。
  //
  // innerText 不穿影子边界 —— 卡片自己那层读得到店铺名，藏在 <q-price>
  // 影子里的金额读不到。**不能靠「innerText 是不是空」来判断**：
  // 1688 的卡片里店铺名/商品名就在浅层，innerText 有字、就是缺钱，
  // 一判长度就漏了（这个坑当场踩到过）。所以要直接查有没有影子根。
  //
  // 没影子根 → 原样用 innerText，常规页面一个字节的行为都不变。
  // 有影子根 → 自己拼一遍，块级标签补换行，尽量对齐 innerText 的样子
  //            （后面 split('\n') 的逻辑才不会错位）。
  var BLOCK_TAG = /^(DIV|P|LI|TR|H1|H2|H3|H4|H5|H6|SECTION|ARTICLE|BR|DD|DT|UL|OL|TABLE|TBODY|THEAD|TR|HEADER|FOOTER|FORM|MAIN|NAV|ASIDE|FIGCAPTION|BLOCKQUOTE)$/;

  function textOf(el) {
    if (!hasShadow(el)) {
      try { return el.innerText || ''; } catch (e) { return ''; }
    }

    var out = [];
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out.push(c.nodeValue || ''); continue; }
        if (c.nodeType !== 1) continue;
        if (SKIP_TAG.test(c.tagName)) continue;
        var block = BLOCK_TAG.test(c.tagName);
        if (block) out.push('\n');
        // 影子根里才是真正渲染出来的内容；light children 是 slot 内容，也要
        if (c.shadowRoot) walk(c.shadowRoot);
        walk(c);
        if (block) out.push('\n');
      }
    })(el);
    return out.join('');
  }

  // ---------------- 从一张卡片里提字段 ----------------
  function extract(el) {
    var raw = textOf(el);
    var lines = raw.split('\n').map(function (s) { return s.trim(); })
                   .filter(function (s) { return s; });
    var flat = lines.join(' ');

    // 金额
    var amounts = [], mm;
    RE_AMOUNT.lastIndex = 0;
    while ((mm = RE_AMOUNT.exec(flat))) amounts.push(parseFloat(mm[1]));
    var nonzero = amounts.filter(function (a) { return a > 0; });

    // 实付：优先「实付」后面的数字，但 0 不算数
    // 拼多多常见「先用后付 实付 ￥0」—— 那不是真实金额，要退回用标价
    // 实付：优先「实付」后面的数字，但 0 不算数
    // 拼多多常见「先用后付 实付 ￥0」—— 那不是真实金额，要退回用标价
    //
    // 没有「实付」标签、又有多个价格时取【最小值】：
    //   1688 的订单同时显示 单价 ¥5.01、总金额 ¥5.90、实付 ¥0.01，
    //   没标签，取最大值会得到 5.90（错），取最小值才是真付的 0.01。
    //   道理：实付一般 ≤ 标价。取错了下面也会标「可信度低」提醒核对。
    var paid = null, conf = '无';
    var m = flat.match(RE_PAID);
    if (m && parseFloat(m[1]) > 0) { paid = parseFloat(m[1]); conf = '高'; }
    else if (nonzero.length === 1) { paid = nonzero[0]; conf = '中'; }
    else if (nonzero.length > 1) { paid = Math.min.apply(null, nonzero); conf = '低'; }

    // 订单状态
    var st = flat.match(RE_STATUS);

    // 是否退款（「申请退款」是按钮，不算）
    var refunded = '';
    for (var i = 0; i < lines.length; i++) {
      if (RE_REFUND.test(lines[i])) { refunded = '退款成功'; break; }
    }

    // 快递公司 + 物流状态
    var courier = '', ship = '';
    for (var i2 = 0; i2 < lines.length; i2++) {
      if (!RE_LOGISTICS.test(lines[i2])) continue;
      var s2 = lines[i2].match(RE_SHIPSTATE);
      if (s2 && !ship) ship = s2[1];
      for (var j = 0; j < KNOWN_COURIER.length; j++) {
        if (lines[i2].indexOf(KNOWN_COURIER[j]) >= 0) { courier = KNOWN_COURIER[j]; break; }
      }
      if (courier) break;
    }

    // 店铺名：优先找「像店名」的行。
    // 不能随便取第一个短行 —— 表格布局里第一个短行往往是「颜色分类:2大提」。
    var shop = '', shopFallback = '';
    for (var k = 0; k < lines.length; k++) {
      var L = lines[k];
      if (L.length < 2 || L.length > SHOP_MAX) continue;
      if (/^[¥￥\d]/.test(L)) continue;
      if (RE_STATUS.test(L)) continue;
      if (RE_SKIPLINE.test(L)) continue;
      if (RE_BUTTON.test(L)) continue;
      if (RE_LOGISTICS.test(L)) continue;
      if (RE_SPEC.test(L)) continue;
      if (RE_SHOP.test(L)) { shop = L; break; }      // 命中店名特征，就是它
      if (!shopFallback) shopFallback = L;           // 先记着，实在没有再用
    }
    if (!shop) shop = shopFallback;

    // 商品名：排掉物流/状态/按钮/价格/规格/店名，取最长
    var name = '';
    lines.forEach(function (s) {
      if (s.length < 2) return;
      if (/^[¥￥\d\s.,\-]+$/.test(s)) return;
      if (RE_SKIPLINE.test(s)) return;
      if (RE_BUTTON.test(s)) return;
      if (RE_LOGISTICS.test(s)) return;
      if (RE_SPEC.test(s)) return;
      if (s === shop) return;
      if (s.length > name.length) name = s;
    });

    return {
      shop: shop, name: name, paid: paid, conf: conf,
      status: st ? st[1] : '', courier: courier, ship: ship,
      refunded: refunded, text: lines.join(' ⏎ ')
    };
  }

  // ---------------- 高亮 ----------------
  var marked = [];

  function clearMarks() {
    marked.forEach(function (e) {
      e.style.outline = '';
      e.style.outlineOffset = '';
      e.removeAttribute('data-xsh-mark');
    });
    marked = [];
  }

  function markAll(cards) {
    clearMarks();
    cards.forEach(function (el) {
      el.style.outline = '2px solid #e02e24';
      el.style.outlineOffset = '-2px';
      el.setAttribute('data-xsh-mark', '1');
      marked.push(el);
    });
  }

  // ---------------- 导出 ----------------
  function toCSV(rows) {
    return rows.map(function (row) {
      return row.map(function (c) {
        return '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
  }

  function save(text, filename, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: mime + ';charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // 把抓到的原始行算成「最终表格」—— 纯函数，没有副作用，方便测试
  function buildTable(rows) {
    var total = 0, refunded = 0;
    var R2 = function (n) { return Math.round(n * 100) / 100; };

    var body = rows.map(function (r, i) {
      var note = buildNote(r);
      var cat = classify(r);
      if (r.paid !== null) {
        total += r.paid;
        if (r.refunded) refunded += r.paid;
      }
      return [i + 1, cat, r.shop, r.name, r.paid === null ? '' : r.paid,
              r.conf, r.status, r.courier, r.ship, r.refunded, note, r.text];
    });

    return {
      head: HEAD, body: body, count: rows.length,
      total: R2(total), refunded: R2(refunded), net: R2(total - refunded)
    };
  }

  // 导出最终表格 —— 用户拿到就能用，不需要任何后处理，也不需要 Python
  function exportRows(rows) {
    var t = buildTable(rows);
    var out = [t.head].concat(t.body);
    out.push([]);
    out.push(['订单总额', t.total]);
    out.push(['已退款', t.refunded]);
    out.push(['实际支出', t.net]);

    var s = stamp();
    save(toCSV(out), '订单_' + s + '.csv', 'text/csv');
    save(document.body.innerText, '原文_' + s + '.txt', 'text/plain');

    t.stamp = s;
    return t;
  }

  // ---------------- 面板 ----------------
  var panel = null, statusEl = null, previewEl = null, exportBtn = null;
  var slider = null, sliderLabel = null, userPicked = false;
  var urlEl = null;
  var currentRows = loadAcc();   // 启动时恢复上次累积的（分页平台要跨页累积）

  function setStatus(s) { if (statusEl) statusEl.textContent = s; }

  // 滑动条 = 「导出前 N 条」。
  // 加载多少是一回事，导出多少是另一回事 —— 截取已加载的，所以能精确到任意条。
  function syncSlider() {
    if (!slider) return;
    var total = currentRows.length;
    slider.disabled = (total === 0);
    slider.max = String(Math.max(total, 1));

    // 用户没手动拖过 → 跟着总数走；拖过就尊重他的选择
    var v = parseInt(slider.value, 10) || 0;
    if (!userPicked || v > total || v < 1) {
      slider.value = String(Math.max(total, 1));
    }
    var n = parseInt(slider.value, 10) || 0;
    if (sliderLabel) sliderLabel.textContent = n + ' / ' + total + ' 条';
    if (exportBtn) exportBtn.textContent = '导出表格（前 ' + n + ' 条）';
  }

  function renderRows(rows, note, added, pageCount) {
    currentRows = rows;
    var refunds = rows.filter(function (r) { return r.refunded; }).length;
    var noAmt = rows.filter(function (r) { return r.paid === null; }).length;

    var s = '累积 ' + rows.length + ' 条';
    if (added !== undefined && pageCount !== undefined) {
      s += '（本页 ' + pageCount + '，新增 ' + added + '）';
    }
    if (refunds) s += ' · 已退款 ' + refunds;
    if (noAmt) s += ' · 未认出金额 ' + noAmt;
    if (note) s += '（' + note + '）';
    setStatus(s);

    if (previewEl) previewEl.textContent = JSON.stringify(rows.slice(0, 2), null, 1);
    syncSlider();
    noteUrl(rows.length > 0);
  }

  // 抓成功时把当前网址显示出来 —— 平台清单里缺的订单页地址，
  // 只有真正抓到过的页面才知道。这是「让清单自己长起来」的入口。
  function noteUrl(show) {
    if (!urlEl) return;
    if (!show) { urlEl.style.display = 'none'; return; }
    urlEl.style.display = 'block';
    urlEl.textContent = '✓ 这个页面能抓 · 复制网址反馈给作者';
    urlEl.onclick = function () {
      var u = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(u).then(function () {
          urlEl.textContent = '✓ 已复制：' + u.slice(0, 42) + (u.length > 42 ? '…' : '');
        }, function () { urlEl.textContent = u; });
      } else {
        urlEl.textContent = u;
      }
    };
  }

  function scan(quiet) {
    var cards = findCards();
    if (!cards.length) {
      if (!quiet) {
        alert('没找到订单卡片。\n\n可能原因：\n'
            + '· 页面还没加载完 —— 等几秒再试\n'
            + '· 你还没登录，看不到订单\n'
            + '· 这个页面不是订单列表\n\n'
            + '排查：点下面的「抓不到？导出诊断信息」发我，我按实际情况调。');
      }
      return currentRows;
    }
    markAll(cards);
    var pageRows = cards.map(extract);
    var m = mergeAcc(pageRows);          // 并进累积池（跨页累积的关键）
    renderRows(m.rows, null, m.added, pageRows.length);
    return m.rows;
  }

  // ---------------- 诊断：抓不到时导出页面信息，发给我才能适配 ----------------
  // 我改不了别人电脑上的浏览器，只能靠这份快照「看到」那个页面的结构。
  function diagnoseText() {
    var all = document.querySelectorAll('div,li,article,section,tr,dd');
    var withMoney = 0, withStatus = 0;
    for (var i = 0; i < all.length; i++) {
      var t = all[i].textContent || '';
      if (RE_MONEY.test(t)) withMoney++;
      if (RE_STATUS.test(t)) withStatus++;
    }
    var cards = findCards();
    // 别让脚本自己的面板污染诊断结果。
    // 面板提示里有「还没登录」这几个字 → 会把「登录状态猜测」带偏成"可能未登录"；
    // 面板文字还会占满「页面前 2500 字」，把真正的页面内容挤出去。
    // 1688 那次就是这么被误导的。
    var bodyText = document.body.innerText || '';
    var ownPanel = document.getElementById('xsh-panel');
    if (ownPanel) {
      var ownTxt = ownPanel.innerText || '';
      if (ownTxt) bodyText = bodyText.split(ownTxt).join('\n');
    }

    var L = [];
    L.push('=== 订单抓取诊断 ===');
    L.push('网址: ' + location.href);
    L.push('标题: ' + document.title);
    L.push('时间: ' + new Date().toString());
    L.push('');
    L.push('总元素数: ' + all.length);
    L.push('含金额的元素: ' + withMoney + '   ← 第一道门槛');
    L.push('含订单状态的元素: ' + withStatus + '   ← 第二道门槛');
    L.push('最终识别出的订单卡片: ' + cards.length + '   ← ≥2 才会出面板');
    L.push('');
    L.push('页面含「订单」二字: ' + (bodyText.indexOf('订单') >= 0 ? '是' : '否'));
    L.push('页面含「已签收/待收货」等: ' + (RE_STATUS.test(bodyText) ? '是' : '否'));
    L.push('登录状态猜测: ' + (/登录|登陆|扫码/.test(bodyText) ? '⚠ 可能未登录' : '看起来已登录'));
    L.push('');

    // 分页器 —— 自动翻页全靠能不能认出这个按钮，认不出就得看这里
    var nb = null;
    try { nb = findNextBtn(); } catch (e) {}
    if (nb) {
      L.push('分页器: 找到「下一页」');
      L.push('  <' + nb.tagName.toLowerCase() + '> class="' + (nb.className || '') + '"');
      L.push('  文案「' + (nb.textContent || '').trim().slice(0, 30) + '」');
      L.push('  href=' + (nb.getAttribute && (nb.getAttribute('href') || '(无)') || '(无)'));
    } else {
      L.push('分页器: 没找到「下一页」← 自动翻页会翻不动，重点看这个');
    }
    L.push('自动翻页设置: 上限 ' + AP_MAX + ' 页 / 连续 ' + AP_IDLE + ' 页无新增自动停');
    L.push('');

    // ---- 内容是不是根本不在这个 frame 里 ----
    //
    // 1688 的真实事故：诊断显示「总元素数 75 / 含金额 0 / 含状态 0」，
    // 可见文本里只有脚本自己的面板 —— 一个订单都没有。
    // 原因是订单列表在【别的 frame 或影子根】里，脚本这个 frame 是个空壳。
    // 所以这里必须把 frame / shadow 的情况报出来。
    L.push('--- 内容是不是不在这个 frame 里 ---');
    var frames = document.querySelectorAll('iframe');
    L.push('本页 iframe 数: ' + frames.length);
    for (var fi = 0; fi < frames.length && fi < 8; fi++) {
      var fEl = frames[fi];
      var fSrc = '(取不到)';
      try {
        fSrc = fEl.src || fEl.getAttribute('src') || '(空 —— 可能是 srcdoc/动态写入)';
      } catch (e) { }
      var fSame = '?';
      try {
        fSame = fEl.contentDocument ? '同源，内容可读' : '跨域，内容读不到';
      } catch (e) { fSame = '跨域，内容读不到'; }
      L.push('  [' + (fi + 1) + '] ' + fSrc);
      L.push('      ' + fSame);
    }

    var everything = document.querySelectorAll('*');
    var shadowHosts = 0, shadowOpen = 0;
    for (var qi = 0; qi < everything.length; qi++) {
      if (everything[qi].shadowRoot) {
        shadowHosts++;
        try { shadowOpen += everything[qi].shadowRoot.querySelectorAll('*').length; } catch (e) { }
      }
    }
    L.push('本页元素总数（所有标签）: ' + everything.length);
    L.push('带影子根的元素数: ' + shadowHosts
           + (shadowHosts ? '（影子根里共 ' + shadowOpen + ' 个元素）' : ''));
    L.push('body 直接子元素: ' + [].map.call(document.body.children, function (c) {
      return c.tagName.toLowerCase() + (c.id ? '#' + c.id : '');
    }).join(', ').slice(0, 260));
    L.push('');

    // 深度扫描：连影子根一起，直接指出金额文本在哪一层
    try {
      var dr = deepReport();
      for (var di = 0; di < dr.length; di++) L.push(dr[di]);
    } catch (e) {
      L.push('深度扫描出错: ' + (e && e.message));
    }
    L.push('');
    L.push('--- 可见文本前 2500 字 ---');
    L.push(bodyText.replace(/\n{2,}/g, '\n').slice(0, 2500));
    L.push('');
    L.push('--- 结构样本：含金额的元素，最多 12 个 ---');
    var n = 0;
    for (var j = 0; j < all.length && n < 12; j++) {
      var el = all[j];
      if (!RE_MONEY.test(el.textContent || '')) continue;
      var path = [], cur = el, g = 0;
      while (cur && cur !== document.body && g++ < 5) {
        var cn = (typeof cur.className === 'string' && cur.className.trim())
               ? '.' + cur.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
        path.unshift(cur.tagName.toLowerCase() + cn);
        cur = cur.parentElement;
      }
      L.push('[' + (n + 1) + '] ' + path.join(' > '));
      L.push('    ' + (el.innerText || '').replace(/\s+/g, ' ').slice(0, 180));
      n++;
    }

    return L;
  }

  // 把诊断文本写成文件下载。
  // 拆成两步（diagnoseText / diagnose）是为了让测试能直接拿到文本 ——
  // 诊断是「我看不到用户屏幕时唯一的眼睛」，必须能被断言，
  // 否则它崩了、或者报了个错的结论，我只会照着错的方向改代码。
  function diagnose() {
    var s = stamp();
    save(diagnoseText().join('\n'), '诊断_' + s + '.txt', 'text/plain');
    return s;
  }

  // ---------- 「加载更多」+ 自动翻页 ----------
  //
  // 一个按钮干两件事，因为它面对的是两类完全不同的订单页：
  //   ① 无限滚动型（拼多多、淘宝）—— 替你往下滚，页面自己会吐出新订单
  //   ② 分页型（京东、当当）——     滚到底对它毫无意义，永远不会有新东西
  //
  // 之前只实现了 ①：滚三次没新增就停，留一句「请手动翻页」。京东就是这么卡住的
  // —— 用户点了「加载更多」，滚到底，然后什么都不发生。
  // 现在滚不动了会去找页面上的「下一页」，替你点，点完接着抓，循环到没得翻为止。
  //
  // 为什么不能只靠滚动：滚动只能触发无限滚动，触发不了翻页，这是两套机制。
  //
  // 刹车：随时可停 / 连续 3 页没新增自动停 / 最多 20 页 /
  //       点完「下一页」页面没变化就立刻停手（防止点错元素乱点）。
  var scrollTimer = null;
  var scrollBtnRef = null;
  var loadMode = 'idle';        // idle | scroll | page
  var pageArmed = null;         // 「滚到底 → 开始翻页」之间的缓冲定时器

  var AP_KEY = 'xsh_autopage_' + location.hostname;
  var AP_MAX = 20;              // 翻页上限
  var AP_IDLE = 3;              // 连续几页没新增就停
  var AP_FRESH = 120000;        // 隔这么久还没续上就不认旧状态（防下次打开乱翻）

  // 时间参数 —— 只有测试页会预先塞 window.__XSH_TIMING 把节奏调快，线上用默认值
  var _T = (typeof window !== 'undefined' && window.__XSH_TIMING) || {};
  var SCROLL_GAP = _T.scroll || 1400;
  var AP_GAP     = _T.page   || 2600;
  var AP_SETTLE  = _T.settle || 2200;
  var AP_ARM     = _T.arm    || 2000;

  var apTimer = null;
  var apState = null;           // { on, pages, idle, ts }

  function setLoadBtn(mode) {
    loadMode = mode;
    if (!scrollBtnRef) return;
    var b = scrollBtnRef;
    if (mode === 'idle') {
      b.textContent = '加载更多';
      b.style.background = '#fff';
      b.style.color = '#333';
      b.style.borderColor = '#ccc';
      b.title = '无限滚动的平台替你往下滚；分页的平台替你点「下一页」';
    } else {
      b.textContent = (mode === 'scroll') ? '⏹ 停止滚动' : '⏹ 停止翻页';
      b.style.background = '#333';
      b.style.color = '#fff';
      b.style.borderColor = '#333';
    }
  }

  // ---------------- 找「下一页」 ----------------
  // 各平台 class 千奇百怪，但文案基本都叫「下一页」/「下页」/ Next，
  // 所以选择器和文案两条路一起走，再按「像不像分页器」打分挑一个。
  var NEXT_TEXTS = ['下一页', '下一頁', '下页', '后一页', 'next page', 'next'];
  var NEXT_SELS = [
    '.ui-pager-next', '.pn-next', '.pg-next', '.pagination-next',
    '.pager-next', '.page-next', '.btn-next', '.next-page',
    '[aria-label="下一页"]', '[title="下一页"]', '[title="Next"]',
    'a.next', 'li.next > a', '.ui-pagination-next', '.layui-laypage-next'
  ];
  var PAGER_CLS = /(pager|pagination|laypage|pg-|page-?nav|-next\b|\bnext\b)/i;
  // 置灰的「下一页」不能点。各家写法不一：disabled / off / ban 都见过。
  // 认得出就能干脆地说「已经翻到最后」，而不是傻点两次再放弃。
  var DISABLED_CLS = /(^|[\s-])(disabled|disable|is-disabled|ui-pager-disabled|ui-state-disabled|ant-pagination-disabled|off|ban)([\s-]|$)/i;

  function isDeadBtn(el) {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return true;
    var c = (typeof el.className === 'string') ? el.className : '';
    return DISABLED_CLS.test(c);
  }

  function norm(s) { return (s || '').replace(/\s+/g, '').toLowerCase(); }

  function looksLikePager(el) {
    for (var i = 0, cur = el; cur && i < 4; i++, cur = cur.parentElement) {
      var c = ((typeof cur.className === 'string') ? cur.className : '') + ' ' + (cur.id || '');
      if (PAGER_CLS.test(c)) return true;
    }
    return false;
  }

  function findNextBtn() {
    var cands = [], seen = [];

    function add(el) {
      if (!el || !el.click) return;
      // 统一落到 <a> 上（<li class="next"><a>下一页</a></li> 这种很常见）
      var t = (el.tagName === 'A') ? el : el.querySelector('a');
      if (!t) t = el;
      if (seen.indexOf(t) >= 0) return;
      seen.push(t);
      cands.push(t);
    }

    // ① 选择器优先
    for (var i = 0; i < NEXT_SELS.length; i++) {
      var list;
      try { list = document.querySelectorAll(NEXT_SELS[i]); } catch (e) { continue; }
      for (var j = 0; j < list.length; j++) {
        var el = list[j];
        if (isDeadBtn(el)) continue;
        if ((el.textContent || '').trim().length > 20) continue;   // 分页器不会又长又大
        add(el);
      }
    }

    // ② 按文案兜底 —— class 会变，文案反而稳
    var all = document.querySelectorAll('a,button,span,li,div');
    for (var k = 0; k < all.length; k++) {
      var e2 = all[k], tx = norm(e2.textContent);
      if (!tx || tx.length > 8) continue;
      var hit = false;
      for (var n = 0; n < NEXT_TEXTS.length; n++) {
        if (tx === norm(NEXT_TEXTS[n])) { hit = true; break; }
      }
      if (!hit) continue;
      if (isDeadBtn(e2)) continue;
      add(e2);
    }

    if (!cands.length) return null;

    // ③ 打分：像分页器的、在页面下方的、看得见的优先
    var best = null, bestScore = -Infinity;
    for (var m = 0; m < cands.length; m++) {
      var c = cands[m];
      var score = 0;
      if (c.tagName === 'A') score += 3;
      if (norm(c.textContent) === '下一页' || norm(c.textContent) === '下一頁') score += 4;
      if (looksLikePager(c)) score += 6;
      var r = null;
      try { r = c.getBoundingClientRect(); } catch (e) { r = null; }
      if (r && r.width > 0 && r.height > 0) {
        score += 2;
        score += Math.min(r.top / 200, 40);      // 越靠下越像分页器
      }
      if (score >= bestScore) { bestScore = score; best = c; }   // 同分取靠后的
    }
    return best;
  }

  // 当前这一页的指纹 —— 用来判断「点了下一页之后到底换没换页」
  function pageSig() {
    var c = findCards();
    var head = c.length ? (c[0].innerText || '').slice(0, 80) : '';
    return location.href + '|' + c.length + '|' + head;
  }

  function apSave() {
    try { storedSet(AP_KEY, apState ? JSON.stringify(apState) : ''); } catch (e) {}
  }

  function apStop(reason) {
    if (apTimer) { clearTimeout(apTimer); apTimer = null; }
    if (pageArmed) { clearTimeout(pageArmed); pageArmed = null; }
    if (apState) apState.on = false;
    apSave();
    setLoadBtn('idle');
    setStatus((reason || '已停止') + '。共累积 ' + currentRows.length + ' 条');
    return currentRows;
  }

  // 翻一页
  function apStep() {
    if (!apState || !apState.on) return;

    if (apState.pages >= AP_MAX) {
      return apStop('到 ' + AP_MAX + ' 页上限了，想继续就再点一次「加载更多」');
    }
    var btn = findNextBtn();
    if (!btn) return apStop('页面上的「下一页」没了 —— 应该已经翻到最后');

    var before = pageSig();
    apState.pages++;
    apState.ts = Date.now();
    apSave();
    setStatus('自动翻页中 · 第 ' + apState.pages + '/' + AP_MAX + ' 页，点「⏹ 停止翻页」可中断');

    try { btn.click(); }
    catch (e) { return apStop('点「下一页」失败：' + (e && e.message)); }

    // 整页跳转的话，下面这个定时器会随页面卸载一起没掉，
    // 新页面靠 apResume() 接上
    apTimer = setTimeout(function () { apCheck(before, 0); }, AP_GAP);
  }

  function apCheck(before, retry) {
    if (!apState || !apState.on) return;

    if (pageSig() === before) {
      if (retry < 1) {
        apTimer = setTimeout(function () { apCheck(before, retry + 1); }, AP_SETTLE);
        return;
      }
      return apStop('点了「下一页」但页面没变化 —— 停手，免得点错东西');
    }

    var cards = findCards();
    var m = mergeAcc(cards.map(extract));
    if (m.added > 0) {
      apState.idle = 0;
      renderRows(m.rows, '自动翻页', m.added, cards.length);
    } else {
      apState.idle = (apState.idle || 0) + 1;
      renderRows(m.rows, null, 0, cards.length);
    }
    apState.ts = Date.now();
    apSave();

    if (apState.idle >= AP_IDLE) {
      return apStop('连续 ' + apState.idle + ' 页没有新订单');
    }
    apTimer = setTimeout(apStep, AP_GAP);   // 每页之间歇一下，像人在翻
  }

  function apStart(reason) {
    apState = { on: true, pages: (apState && apState.pages) || 0, idle: 0, ts: Date.now() };
    apSave();
    setLoadBtn('page');
    setStatus((reason || '') + '自动翻页中，点「⏹ 停止翻页」可中断');
    apStep();
  }

  // 整页跳转式翻页：新页面加载后要自己接上（状态存在篡改猴存储里）
  function apResume() {
    var raw;
    try { raw = storedGet(AP_KEY); } catch (e) { return false; }
    if (!raw) return false;

    var st;
    try { st = JSON.parse(raw); } catch (e) { return false; }
    if (!st || !st.on) return false;

    // 隔太久没续上（比如上次直接关了标签页），就不认了 ——
    // 否则下次一打开订单页就自己乱翻，那是惊吓不是功能
    if (!st.ts || (Date.now() - st.ts) > AP_FRESH) {
      try { storedSet(AP_KEY, ''); } catch (e) {}
      return false;
    }

    apState = st;
    setLoadBtn('page');
    setStatus('接着上次自动翻页（已翻 ' + (st.pages || 0) + ' 页），点「⏹ 停止翻页」可中断');
    apTimer = setTimeout(apStep, AP_SETTLE);
    return true;
  }

  // 一个入口：滚动 / 翻页 / 停止，全看当前在干什么
  function loadMore(btn) {
    scrollBtnRef = btn;
    if (loadMode === 'page')   { apStop('你点了停止'); return; }
    if (loadMode === 'scroll') { stopScroll('你点了停止'); return; }
    if (pageArmed) { clearTimeout(pageArmed); pageArmed = null; apStop('你点了停止'); return; }
    scrollAndScan(btn);
  }

  function stopScroll(reason) {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
    }
    setLoadBtn('idle');
    window.scrollTo(0, 0);
    var rows = scan(true);
    setStatus((reason || '已停止') + '。共 ' + rows.length + ' 条');
    return rows;
  }

  function scrollAndScan(btn) {
    scrollBtnRef = btn;

    var steps = 0, frozen = 0, lastCards = -1;
    var MAX = 25;   // 上限：25 次 × 1.4 秒 ≈ 35 秒，到点自己停

    setLoadBtn('scroll');

    scrollTimer = setInterval(function () {
      window.scrollTo(0, document.body.scrollHeight);
      steps++;

      // 用「抓到几张卡片」判断有没有新内容 —— 比页面高度可靠
      var n = scan(true).length;
      if (n === lastCards) frozen++; else frozen = 0;
      lastCards = n;

      setStatus('正在往下滚… 第 ' + steps + '/' + MAX + ' 次，已抓到 ' + n + ' 条');

      if (frozen >= 3) {
        stopScroll('滚到底，页面不再长出新订单');
        // 分页型平台：滚到底什么都不会发生，得去找「下一页」
        if (!findNextBtn()) {
          setStatus('滚到底了，页面上也没有「下一页」—— 这一页应该就这些。共 '
                    + currentRows.length + ' 条');
          return;
        }
        setStatus('滚到底了 —— 发现「下一页」，2 秒后开始自动翻页（想停就点按钮）');
        pageArmed = setTimeout(function () {
          pageArmed = null;
          if (loadMode !== 'idle') return;      // 期间用户自己操作过，就不掺和
          apStart('滚到底，转到');
        }, AP_ARM);
      } else if (steps >= MAX) {
        stopScroll('到 ' + MAX + ' 次上限了，可能还有更多，可以再点一次接着滚');
      }
    }, SCROLL_GAP);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'xsh-panel';
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
      'width:360px', 'background:#fff', 'border:1px solid #d0d0d0',
      'border-radius:10px', 'box-shadow:0 8px 28px rgba(0,0,0,.22)',
      'font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif',
      'color:#222', 'overflow:hidden'
    ].join(';');

    var bar = document.createElement('div');
    bar.style.cssText = 'padding:9px 11px;background:#e02e24;color:#fff;font-weight:bold;'
      + 'display:flex;justify-content:space-between;align-items:center';
    bar.innerHTML = '<span>订单抓取</span>';
    var x = document.createElement('span');
    x.textContent = '✕';
    x.title = '收起（右下角小圆钮可以再打开）';
    x.style.cssText = 'cursor:pointer;padding:0 4px';
    x.onclick = function () { panel.style.display = 'none'; };
    bar.appendChild(x);

    var body = document.createElement('div');
    body.style.cssText = 'padding:11px';

    var row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';

    var b1 = document.createElement('button');
    b1.textContent = '抓取本页';
    b1.style.cssText = 'flex:1;padding:9px;border:0;border-radius:6px;background:#e02e24;'
      + 'color:#fff;font-size:13px;cursor:pointer';
    b1.onclick = function () { scan(false); };

    var b2 = document.createElement('button');
    b2.textContent = '加载更多';
    b2.title = '无限滚动的平台替你往下滚；分页的平台替你点「下一页」（随时可停）';
    b2.style.cssText = 'flex:1;padding:9px;border:1px solid #ccc;border-radius:6px;'
      + 'background:#fff;color:#333;font-size:13px;cursor:pointer';
    b2.onclick = function () { loadMore(b2); };

    row1.appendChild(b1);
    row1.appendChild(b2);

    // 导出条数滑动条 —— 截取已加载的订单，能精确到任意条
    var rowT = document.createElement('div');
    rowT.style.cssText = 'margin-bottom:8px';

    var labRow = document.createElement('div');
    labRow.style.cssText = 'display:flex;justify-content:space-between;'
      + 'font-size:12px;color:#666;margin-bottom:2px';

    var labL = document.createElement('span');
    labL.textContent = '导出前 N 条';

    sliderLabel = document.createElement('span');
    sliderLabel.textContent = '0 / 0 条';
    sliderLabel.style.cssText = 'font-variant-numeric:tabular-nums;'
      + 'color:#e02e24;font-weight:600';

    labRow.appendChild(labL);
    labRow.appendChild(sliderLabel);

    slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '1';
    slider.value = '1';
    slider.disabled = true;
    slider.style.cssText = 'width:100%;margin:0;accent-color:#e02e24;cursor:pointer';
    slider.oninput = function () {
      userPicked = true;
      syncSlider();
    };

    rowT.appendChild(labRow);
    rowT.appendChild(slider);

    statusEl = document.createElement('div');
    statusEl.textContent = '点「抓取本页」开始。订单多就先点「加载更多」。';
    statusEl.style.cssText = 'font-size:12px;color:#666;margin-bottom:8px';

    // 抓成功后才出现：一键复制当前网址，方便反馈「这个平台的订单页在哪」
    urlEl = document.createElement('div');
    urlEl.style.cssText = 'font-size:11.5px;color:#1d7a3e;cursor:pointer;'
      + 'margin-bottom:8px;display:none;text-decoration:underline dotted';
    urlEl.title = '点击复制当前网址';

    previewEl = document.createElement('pre');
    previewEl.style.cssText = 'max-height:180px;overflow:auto;background:#f7f7f7;'
      + 'border:1px solid #e5e5e5;border-radius:6px;padding:7px;'
      + 'font:11px/1.45 Consolas,monospace;margin:0 0 8px';

    exportBtn = document.createElement('button');
    exportBtn.textContent = '导出表格';
    exportBtn.style.cssText = 'width:100%;padding:9px;border:0;border-radius:6px;'
      + 'background:#333;color:#fff;font-size:13px;cursor:pointer';
    exportBtn.onclick = function () {
      if (!currentRows.length) { scan(false); return; }
      var n = parseInt(slider.value, 10) || currentRows.length;
      var r = exportRows(currentRows.slice(0, n));
      exportBtn.textContent = '✓ 已导出 ' + r.count + ' 条 → 订单_' + r.stamp + '.csv';
      setStatus('已导出 ' + r.count + ' 条 ｜ 总额 ' + r.total
                + ' ｜ 已退款 ' + r.refunded + ' ｜ 实际支出 ' + r.net);
    };

    // 清空累积 —— 分页抓取会一直累积，换平台或重来时需要清掉
    var clearBtn = document.createElement('button');
    clearBtn.textContent = '清空累积（换平台 / 重新开始）';
    clearBtn.style.cssText = 'width:100%;padding:6px;margin-top:6px;border:0;'
      + 'background:transparent;color:#aaa;font-size:11.5px;cursor:pointer;'
      + 'text-decoration:underline dotted';
    clearBtn.onclick = function () {
      if (!window.confirm('清空当前网站累积的 ' + currentRows.length + ' 条记录？')) return;
      saveAcc([]);
      renderRows([], '已清空');
      clearBtn.textContent = '✓ 已清空';
      setTimeout(function () {
        clearBtn.textContent = '清空累积（换平台 / 重新开始）';
      }, 2000);
    };

    // 诊断按钮 —— 抓不到时把页面结构导出来发给作者适配
    var diagBtn = document.createElement('button');
    diagBtn.textContent = '抓不到？导出诊断信息';
    diagBtn.style.cssText = 'width:100%;padding:7px;margin-top:8px;border:1px dashed #ccc;'
      + 'border-radius:6px;background:#fff;color:#888;font-size:12px;cursor:pointer';
    diagBtn.onclick = function () {
      var s = diagnose();
      diagBtn.textContent = '✓ 已导出 诊断_' + s + '.txt，发给作者';
      setStatus('诊断信息已导出。把这个 txt 发给我，我就能针对这个平台适配。');
    };

    body.appendChild(row1);
    body.appendChild(rowT);
    body.appendChild(statusEl);
    body.appendChild(urlEl);
    body.appendChild(previewEl);
    body.appendChild(exportBtn);
    body.appendChild(diagBtn);
    body.appendChild(clearBtn);
    panel.appendChild(bar);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // 右下角小圆钮 —— 面板关掉后还能叫回来
    var orb = document.createElement('div');
    orb.id = 'xsh-orb';
    orb.textContent = '抓';
    orb.title = '订单抓取 —— 点开面板（快捷键 Ctrl+Shift+E）';
    // 做得小一点、半透明，平时不碍事，鼠标放上去才变实
    orb.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;'
      + 'width:34px;height:34px;border-radius:50%;background:#e02e24;color:#fff;'
      + 'display:none;align-items:center;justify-content:center;cursor:pointer;'
      + 'font:15px/1 -apple-system,"Microsoft YaHei",sans-serif;'
      + 'box-shadow:0 3px 10px rgba(0,0,0,.22);opacity:.45;transition:.18s';
    orb.onmouseenter = function () { orb.style.opacity = '1'; orb.style.transform = 'scale(1.08)'; };
    orb.onmouseleave = function () { orb.style.opacity = '.45'; orb.style.transform = 'none'; };
    orb.onclick = function () {
      panel.style.display = 'block';
      orb.style.display = 'none';
      // 点开就顺手扫一次，扫不到时给出原因
      var rows = scan(true);
      if (!rows.length) {
        setStatus('这个页面上没找到订单卡片。可能原因：① 还没登录 ② 这页不是订单列表 '
                + '③ 页面还没加载完。点「抓取本页」重试。');
      }
    };
    document.body.appendChild(orb);

    new MutationObserver(function () {
      orb.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
    }).observe(panel, { attributes: true, attributeFilter: ['style'] });
  }

  // ---------------- 启动：静默探测，不是订单页就不出现 ----------------
  var panelBuilt = false;

  function boot() {
    if (panelBuilt) return;
    panelBuilt = true;
    buildPanel();
    startPageWatch();     // 面板一出现就开始盯翻页
    // 整页跳转式的自动翻页：新页面加载后要自己接上（状态在篡改猴存储里）
    setTimeout(apResume, 2600);
  }

  function autoScan() {
    if (panelBuilt) return;
    // 找到 ≥1 张就展开。
    // 之前写的是 ≥2（怕误判），结果 1688 上只有 1 个订单时面板不出现，
    // 用户只看到一个小圆钮，以为坏了。有圆钮兜底，误判也不碍事。
    if (findCards().length >= 1) {
      boot();
      scan(true);
    }
  }

  // 加载完先探一次，避开页面渲染高峰；再补两次，应对异步/无限滚动
  setTimeout(autoScan, 1200);
  setTimeout(autoScan, 3200);
  setTimeout(autoScan, 6000);

  // 兜底：一直没找到订单也不彻底消失 —— 留个小圆钮当入口。
  // 否则用户分不清「不支持」「没登录」「没生效」，只会觉得坏了。
  setTimeout(function () {
    if (panelBuilt) return;
    boot();
    panel.style.display = 'none';   // 只留圆钮，不占地方
  }, 6500);

  // 万一没探测到（或提前点了），Ctrl+Shift+E 强行叫出面板
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      boot();
      scan(false);
    }
  });
  // ---------------- 测试钩子 ----------------
  // 只有测试页会先设 window.__XSH_TEST = true。线上零痕迹。
  if (window.__XSH_TEST) {
    window.__XSH = {
      findNextBtn: findNextBtn,
      isDeadBtn: isDeadBtn,
      pageSig: pageSig,
      findCards: findCards,
      extract: extract,
      scanComposed: scanComposed,
      deepReport: deepReport,
      diagnose: diagnose,
      diagnoseText: diagnoseText,
      apStart: apStart,
      apStop: apStop,
      apResume: apResume,
      loadMore: loadMore,
      state: function () { return apState; },
      mode: function () { return loadMode; },
      max: AP_MAX
    };
  }
})();
