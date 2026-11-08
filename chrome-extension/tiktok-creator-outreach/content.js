(function () {
  function text(element) { return (element && element.textContent || '').replace(/\s+/g, ' ').trim(); }
  function context() {
    var url = new URL(location.href);
    return { url: location.href, shopRegion: (url.searchParams.get('shop_region') || '').toUpperCase(), shopId: url.searchParams.get('shop_id') || '', path: url.pathname };
  }
  function readCreators() {
    var rows = Array.from(document.querySelectorAll('tr,[role="row"], [data-e2e*="creator"]')).slice(0, 500);
    return rows.map(function (row, index) {
      var link = row.querySelector('a');
      var value = text(row);
      return { id: link && link.href || String(index), name: text(link || row).slice(0, 160), raw: value.slice(0, 500), invited: /invited|message|合作中|已邀请/i.test(value) };
    }).filter(function (item) { return item.name && !/creator name|select all|全选/i.test(item.name); });
  }
  function clickAction(message) {
    var labels = message.action === 'invite' ? ['Invite', 'Batch invite', '邀请'] : ['Send', 'Send message', '发送'];
    var nodes = Array.from(document.querySelectorAll('button,[role="button"]')).filter(function (node) {
      return labels.indexOf(text(node)) >= 0 && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
    });
    if (nodes.length !== 1) return { ok: false, reason: nodes.length ? 'AMBIGUOUS_ACTION_BUTTON' : 'ACTION_BUTTON_NOT_FOUND' };
    nodes[0].click();
    return { ok: true, clicked: text(nodes[0]) };
  }
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'tiktok-creator-outreach-extension') return;
    var result = event.data.type === 'context' ? context() : event.data.type === 'readCreators' ? readCreators() : clickAction(event.data);
    window.postMessage({ source: 'tiktok-creator-outreach-page', requestId: event.data.requestId, result: result }, '*');
  });
})();
