// ==UserScript==
// @name         eBay Total Cost Display
// @namespace    ebay-total-cost-display
// @version      2.0.4
// @description  Show the total price/cost of ebay items (price+shipping)
// @match        *://*.ebay.org/*
// @match        *://*.ebay.ca/*
// @match        *://*.ebay.at/*
// @match        *://*.ebay.cz/*
// @match        *://*.ebay.fi/*
// @match        *://*.ebay.de/*
// @match        *://*.ebay.gr/*
// @match        *://*.ebay.it/*
// @match        *://*.ebay.pl/*
// @match        *://*.ebay.pt/*
// @match        *://*.ebay.es/*
// @match        *://*.ebay.se/*
// @match        *://*.ebay.ch/*
// @match        *://*.ebay.com.tr/*
// @match        *://*.ebay.co.uk/*
// @match        *://*.ebay.com.cn/*
// @match        *://*.ebay.hk/*
// @match        *://*.ebay.co.in/*
// @match        *://*.ebay.jp/*
// @match        *://*.ebay.co.kr/*
// @match        *://*.ebay.com.ph/*
// @match        *://*.ebay.com.sg/*
// @match        *://*.ebay.com.tw/*
// @match        *://*.ebay.co.th/*
// @match        *://*.ebay.com.au/*
// @match        *://*.ebay.co.nz/*
// @match        *://*.ebay.com.mx/*
// @match        *://*.ebay.co.za/*
// @match        *://*.ebay.com/*
// @run-at       document-end
// @grant        GM_addStyle
// @grant        GM_info
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js
// ==/UserScript==

// Shared by the Chrome extension and userscript managers.
// The header above is ignored when this file is loaded as an extension content script.
(function () {
  if (typeof GM_info === 'undefined') return;
  var css = '.ebay-total-cost{display:block;margin-top:2px;font-size:0.9em;color:#0654ba;font-weight:500;}';
  if (typeof GM_addStyle === 'function') {
    GM_addStyle(css);
    return;
  }
  var style = document.createElement('style');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

$(function() {
  var DEBUG = false;
  try { DEBUG = localStorage.getItem('ebtc_debug') === '1'; } catch (e) {}

  var log = {
    info: function() { if (!DEBUG) return; try { console.info.apply(console, arguments); } catch (e) {} },
    warn: function() { try { console.warn.apply(console, arguments); } catch (e) {} },
    error: function() { try { console.error.apply(console, arguments); } catch (e) {} }
  };

  var ITEM_SELECTOR = '.s-item, .sresult, .s-card, .cim-results-rows-view__row, [data-testid*="listing"], .listing-item, .item-row';
  var PRICE_SELECTOR = '.s-item__price, .lvprice, .s-card__price, .cim-results-rows-view__row-price, [data-testid*="price"], .price, .item-price';
  var SHIP_SELECTOR = '.s-item__logisticsCost, .s-item__shipping, .ship .fee, .cim-results-rows-view__row-shipping, [data-testid*="shipping"], .shipping, .ship-cost';

  var maxPasses = 20;
  var intervalMs = 500;
  var isRunning = false;

  log.info('[ebay-total-cost] DOM ready. href=%s readyState=%s jQuery=%s iframe=%s', location.href, document.readyState, (window.jQuery && jQuery.fn && jQuery.fn.jquery) || 'missing', window !== window.top);

  function formatMoney(amount) {
    var n = !isFinite(+amount) ? 0 : +amount;
    var parts = Math.abs(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + parts.join('.');
  }

  function makeANumber(str) {
    try {
      str = String(str || '');
      str = str.replace(/\(\s*Total\s+Cost:[^)]+\)/ig, '');
      str = str.split('rice')[0];
      str = str.split('Trending')[0];
      var numericMatch = str.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      var num = numericMatch ? Number(numericMatch[0]) : 0;
      return isFinite(num) ? num : 0;
    } catch (e) {
      log.warn('[ebay-total-cost] makeANumber error for input', str, e);
      return 0;
    }
  }

  // Delivery speed ("Free delivery in 2 days") is not a price.
  // Only an explicit dollar amount counts as shipping.
  function parseShippingCost(str) {
    try {
      str = String(str || '');
      str = str.replace(/\(\s*Total\s+Cost:[^)]+\)/ig, '');
      str = str.replace(/\b\d+\s*-\s*days?\b/ig, ' ');
      str = str.replace(/\bin\s+\d+\s+days?\b/ig, ' ');
      str = str.replace(/\b\d+\s+days?\b/ig, ' ');
      var money = str.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/);
      if (!money) return 0;
      var num = Number(money[1]);
      return isFinite(num) ? num : 0;
    } catch (e) {
      log.warn('[ebay-total-cost] parseShippingCost error for input', str, e);
      return 0;
    }
  }

  function totalLabel(totalNum) {
    return $('<span class="ebay-total-cost"></span>').text('(Total Cost: $' + formatMoney(totalNum) + ')');
  }

  function attributeRow($label) {
    return $('<div class="s-card__attribute-row"></div>')
      .append($('<span class="su-styled-text secondary large"></span>').append($label));
  }

  function readListing(details) {
    var $priceNode = details.find(PRICE_SELECTOR);
    var $shipNode = details.find(SHIP_SELECTOR);
    var priceText = $priceNode.clone().find('.ebay-total-cost').remove().end().text();
    priceText = priceText.replace(/\(\s*Total\s+Cost:[^)]+\)/i, '');
    var shipText = $shipNode.text();
    var itemText = details.text() || '';

    if (!priceText) {
      var priceMatch = itemText.match(/\$[\d,]+\.?\d*/);
      if (priceMatch) priceText = priceMatch[0];
    }

    if (!shipText) {
      var shipMatch = itemText.match(/\+?\$[\d,]+\.?\d*\s*(?:shipping|delivery)/i);
      if (shipMatch) shipText = shipMatch[0];
    }

    if (!shipText) {
      var $shipRow = details.find('.su-card-container__attributes__primary .s-card__attribute-row').filter(function() {
        return /delivery|shipping/i.test($(this).text() || '');
      }).first();
      if ($shipRow.length) shipText = $shipRow.text();
    }

    return { $priceNode: $priceNode, $shipNode: $shipNode, priceText: priceText, shipText: shipText };
  }

  function placeTotal(details, listing, $total) {
    var researchLayout = details.hasClass('cim-results-rows-view__row') || details.find('[data-testid*="listing"]').length > 0;
    if (researchLayout) {
      if (listing.$shipNode.length) return listing.$shipNode.after($total);
      if (listing.$priceNode.length) return listing.$priceNode.after($total);
      return details.append($total);
    }

    var $priceRow = listing.$priceNode.closest('.s-card__attribute-row');
    if ($priceRow.length) return $priceRow.after(attributeRow($total));
    if (listing.$priceNode.length) return listing.$priceNode.after($total);

    var $attrs = details.find('.su-card-container__attributes__primary, .s-card__attributes').first();
    if ($attrs.length) return $attrs.append(attributeRow($total));
    return details.append($total);
  }

  function alreadyInjected(details) {
    if (details.find('.ebay-total-cost').length > 0) return true;
    var priceText = details.find(PRICE_SELECTOR).text() || '';
    return priceText.indexOf('(Total Cost:') !== -1;
  }

  function runInjectionPass(passNumber) {
    try {
      log.info('[ebay-total-cost] Injection pass #%d', passNumber);
      var items = $(ITEM_SELECTOR);
      log.info('[ebay-total-cost] Candidate items found: %d', items.length);

      items.each(function(index) {
        try {
          var details = $(this);
          if (details.hasClass('ebtc-processed') || alreadyInjected(details)) return;

          var listing = readListing(details);
          var priceNum = makeANumber(listing.priceText);
          var shipNum = parseShippingCost(listing.shipText);
          var totalNum = priceNum + shipNum;

          log.info('[ebay-total-cost] #%d priceText="%s" shipText="%s" parsed price=%s ship=%s total=%s', index, listing.priceText, listing.shipText, String(priceNum), String(shipNum), totalNum.toFixed(2));

          if (totalNum <= 0) return;

          placeTotal(details, listing, totalLabel(totalNum));
          details.addClass('ebtc-processed');
        } catch (itemErr) {
          log.warn('[ebay-total-cost] Error processing item #%d:', index, itemErr);
        }
      });

      var remaining = 0;
      items.each(function() {
        if (!alreadyInjected($(this))) remaining++;
      });

      if ((items.length === 0 || remaining > 0) && passNumber < maxPasses && isRunning) {
        log.info('[ebay-total-cost] Remaining items without totals: %d — scheduling another pass', remaining);
        setTimeout(function() { runInjectionPass(passNumber + 1); }, intervalMs);
      } else {
        log.info('[ebay-total-cost] %s — stopping', remaining === 0 ? 'All visible items injected' : 'Max passes reached');
        isRunning = false;
      }
    } catch (err) {
      log.error('[ebay-total-cost] Fatal error during injection pass #%d:', passNumber, err);
    }
  }

  function startInjection() {
    if (isRunning) return;
    isRunning = true;
    runInjectionPass(1);
  }

  function stopInjection() {
    isRunning = false;
  }

  setTimeout(function() {
    startInjection();

    try {
      var observer = new MutationObserver(function(mutations) {
        var shouldRestart = false;
        mutations.forEach(function(mutation) {
          if (mutation.type !== 'childList' || !mutation.addedNodes.length) return;
          for (var i = 0; i < mutation.addedNodes.length; i++) {
            var node = mutation.addedNodes[i];
            if (node.nodeType !== 1) continue;
            var $node = $(node);
            if ($node.is(ITEM_SELECTOR) || $node.find(ITEM_SELECTOR).length > 0) {
              shouldRestart = true;
              break;
            }
          }
        });

        if (!shouldRestart) return;
        log.info('[ebay-total-cost] New content detected, restarting injection');
        stopInjection();
        setTimeout(startInjection, 100);
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        log.info('[ebay-total-cost] MutationObserver started');
      }
    } catch (e) {
      log.warn('[ebay-total-cost] MutationObserver failed:', e);
    }

    setInterval(function() {
      if (isRunning) return;
      var hasUnprocessed = $('.cim-results-rows-view__row, [data-testid*="listing"]').filter(function() {
        var $item = $(this);
        return !$item.hasClass('ebtc-processed') && $item.find('.ebay-total-cost').length === 0;
      }).length > 0;
      if (!hasUnprocessed) return;
      log.info('[ebay-total-cost] Periodic check found unprocessed items, restarting');
      startInjection();
    }, 3000);
  }, 100);
});
