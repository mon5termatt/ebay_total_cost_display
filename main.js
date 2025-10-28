$(function() {
  // Debug logging control
  var DEBUG = false;
  try { DEBUG = (localStorage.getItem('ebtc_debug') === '1'); } catch (e) {}
  var log = {
    info: function() { if (!DEBUG) return; try { console.info.apply(console, arguments); } catch (e) {} },
    warn: function() { try { console.warn.apply(console, arguments); } catch (e) {} },
    error: function() { try { console.error.apply(console, arguments); } catch (e) {} }
  };

  try {
    log.info('[ebay-total-cost] DOM ready. href=%s readyState=%s jQuery=%s iframe=%s', location.href, document.readyState, (window.jQuery && jQuery.fn && jQuery.fn.jquery) || 'missing', window !== window.top);
  } catch (e) {
    // no-op
  }

  setTimeout(function() {
    var $ = jQuery;
    var maxPasses = 20; // ~10s with 500ms interval
    var intervalMs = 500;
    var isRunning = false;

    function runInjectionPass(passNumber) {
      try {
        log.info('[ebay-total-cost] Injection pass #%d', passNumber);
        var items = $('.s-item, .sresult, .s-card, .cim-results-rows-view__row, [data-testid*="listing"], .listing-item, .item-row');
        log.info('[ebay-total-cost] Candidate items found: %d', items.length);

        items.each(function(index) {
          try {
            var details = $(this);
            if (details.hasClass('ebtc-processed')) {
              log.info('[ebay-total-cost] #%d already processed, skipping item', index);
              return;
            }
            var $priceNode = details.find('.s-item__price, .lvprice, .s-card__price, .cim-results-rows-view__row-price, [data-testid*="price"], .price, .item-price');
            var $shipNode = details.find('.s-item__logisticsCost, .s-item__shipping, .ship .fee, .cim-results-rows-view__row-shipping, [data-testid*="shipping"], .shipping, .ship-cost');
            var alreadyInjectedInItem = details.find('.ebay-total-cost').length > 0 || ($priceNode.text() || '').indexOf('(Total Cost:') !== -1;
            if (alreadyInjectedInItem) {
              log.info('[ebay-total-cost] #%d already injected, skipping item', index);
              return;
            }
            var priceText = $priceNode.clone().find('.ebay-total-cost').remove().end().text();
            priceText = priceText.replace(/\(\s*Total\s+Cost:[^)]+\)/i, '');
            var shipText = $shipNode.text();
            
            // If we didn't find price/shipping with selectors, try to find them in the text content
            if (!priceText || !shipText) {
              var itemText = details.text() || '';
              
              // Look for price patterns like $1.03, $5.29, etc.
              if (!priceText) {
                var priceMatch = itemText.match(/\$[\d,]+\.?\d*/);
                if (priceMatch) {
                  priceText = priceMatch[0];
                  log.info('[ebay-total-cost] #%d found price in text: %s', index, priceText);
                }
              }
              
              // Look for shipping patterns like +$1.25 shipping, +$0.03 shipping, etc.
              if (!shipText) {
                var shipMatch = itemText.match(/\+?\$[\d,]+\.?\d*\s*(?:shipping|delivery)/i);
                if (shipMatch) {
                  shipText = shipMatch[0];
                  log.info('[ebay-total-cost] #%d found shipping in text: %s', index, shipText);
                }
              }
            }
            
            if (!shipText) {
              try {
                var $attrRows = details.find('.su-card-container__attributes__primary .s-card__attribute-row');
                var $shipRow = $attrRows.filter(function() {
                  var t = $(this).text() || '';
                  return /delivery|shipping/i.test(t);
                }).first();
                if ($shipRow.length) {
                  shipText = $shipRow.text();
                }
              } catch (ignore) {}
            }
            var priceNum = makeANumber(priceText);
            var shipNum = makeANumber(shipText);
            var totalNum = priceNum + shipNum;
            var totalStr = totalNum.toFixed(2);

            log.info('[ebay-total-cost] #%d priceText="%s" shipText="%s" parsed price=%s ship=%s total=%s', index, priceText, shipText, String(priceNum), String(shipNum), String(totalStr));

            if (totalNum > 0) {
              if (details.find('.ebay-total-cost').length === 0) {
                var injected = false;
                var $totalCostElement = $('<span class="ebay-total-cost">(Total Cost: $' + number_format(totalNum, 2) + ')</span>');
                
                // Check if this is a pricing research modal row or similar structure
                if (details.hasClass('cim-results-rows-view__row') || details.find('[data-testid*="listing"]').length > 0) {
                  // For pricing research modal, add total cost after the shipping row
                  if ($shipNode.length) {
                    $shipNode.after($totalCostElement);
                    log.info('[ebay-total-cost] #%d injected total after shipping in pricing research', index);
                    injected = true;
                  } else if ($priceNode.length) {
                    $priceNode.after($totalCostElement);
                    log.info('[ebay-total-cost] #%d injected total after price in pricing research', index);
                    injected = true;
                  } else {
                    // Fallback: append to the end of the item
                    details.append($totalCostElement);
                    log.info('[ebay-total-cost] #%d injected total at end of pricing research item', index);
                    injected = true;
                  }
                } else {
                  // Original logic for regular eBay pages
                  var $priceRow = $priceNode.closest('.s-card__attribute-row');
                  if ($priceRow.length) {
                    // Insert a new attribute row right after the price row
                    var $newRow = $('<div class="s-card__attribute-row"></div>').append($('<span class="su-styled-text secondary large"></span>').append($totalCostElement));
                    $priceRow.after($newRow);
                    log.info('[ebay-total-cost] #%d injected total after price row', index);
                    injected = true;
                  } else if ($priceNode.length) {
                    // Fallback: place next to price node
                    $priceNode.after($totalCostElement);
                    log.info('[ebay-total-cost] #%d injected total next to price node', index);
                    injected = true;
                  } else {
                    // Try attributes container within s-card
                    var $attrsContainer = details.find('.su-card-container__attributes__primary, .s-card__attributes').first();
                    if ($attrsContainer.length) {
                      var $row = $('<div class="s-card__attribute-row"></div>').append($('<span class="su-styled-text secondary large"></span>').append($totalCostElement));
                      $attrsContainer.append($row);
                      log.info('[ebay-total-cost] #%d injected total into attributes container', index);
                      injected = true;
                    } else {
                      // Last resort: append to item root
                      details.append($totalCostElement);
                      log.info('[ebay-total-cost] #%d injected total at item root', index);
                      injected = true;
                    }
                  }
                }
                
                if (injected) {
                  details.addClass('ebtc-processed');
                }
              } else {
                log.info('[ebay-total-cost] #%d already injected, skipping duplicate', index);
              }
            } else {
              log.info('[ebay-total-cost] #%d skipped injection because total<=0', index);
            }
          } catch (itemErr) {
            log.warn('[ebay-total-cost] Error processing item #%d:', index, itemErr);
          }
        });

        var remaining = 0;
        items.each(function() {
          var $item = $(this);
          var $priceNodeCheck = $item.find('.s-item__price, .lvprice, .cim-results-rows-view__row-price, [data-testid*="price"], .price, .item-price');
          var alreadyInjected = $item.find('.ebay-total-cost').length > 0 || ($priceNodeCheck.text() || '').indexOf('(Total Cost:') !== -1;
          if (!alreadyInjected) remaining++;
        });

        if (items.length === 0 && passNumber < maxPasses && isRunning) {
          setTimeout(function() { runInjectionPass(passNumber + 1); }, intervalMs);
        } else if (remaining > 0 && passNumber < maxPasses && isRunning) {
          log.info('[ebay-total-cost] Remaining items without totals: %d — scheduling another pass', remaining);
          setTimeout(function() { runInjectionPass(passNumber + 1); }, intervalMs);
        } else if (remaining === 0) {
          log.info('[ebay-total-cost] All visible items injected — stopping');
          isRunning = false;
        } else if (passNumber >= maxPasses) {
          log.info('[ebay-total-cost] Max passes reached — stopping');
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
    
    // Start initial injection
    startInjection();
    
    // Set up MutationObserver to detect dynamic content changes
    try {
      var observer = new MutationObserver(function(mutations) {
        var shouldRestart = false;
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any added nodes contain our target elements
            for (var i = 0; i < mutation.addedNodes.length; i++) {
              var node = mutation.addedNodes[i];
              if (node.nodeType === 1) { // Element node
                var $node = $(node);
                if ($node.find('.s-item, .sresult, .s-card, .cim-results-rows-view__row, [data-testid*="listing"], .listing-item, .item-row').length > 0 ||
                    $node.is('.s-item, .sresult, .s-card, .cim-results-rows-view__row, [data-testid*="listing"], .listing-item, .item-row')) {
                  shouldRestart = true;
                  break;
                }
              }
            }
          }
        });
        
        if (shouldRestart) {
          log.info('[ebay-total-cost] New content detected, restarting injection');
          stopInjection();
          setTimeout(function() {
            startInjection();
          }, 100);
        }
      });
      
      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      log.info('[ebay-total-cost] MutationObserver started');
    } catch (e) {
      log.warn('[ebay-total-cost] MutationObserver failed:', e);
    }
    
    // Additional periodic check for pricing research modal
    setInterval(function() {
      if (!isRunning) {
        var pricingModal = $('.cim-results-rows-view__row, [data-testid*="listing"]');
        if (pricingModal.length > 0) {
          var hasUnprocessed = false;
          pricingModal.each(function() {
            var $item = $(this);
            if (!$item.hasClass('ebtc-processed') && $item.find('.ebay-total-cost').length === 0) {
              hasUnprocessed = true;
              return false; // break
            }
          });
          
          if (hasUnprocessed) {
            log.info('[ebay-total-cost] Periodic check found unprocessed items, restarting');
            startInjection();
          }
        }
      }
    }, 3000); // Check every 3 seconds
    
  }, 100);

  function makeANumber(str) {
    try {
      str = String(str || '');
      str = str.replace(/\(\s*Total\s+Cost:[^)]+\)/ig, '');
      str = str.split('rice')[0];
      str = str.split('Trending')[0];
      var numericMatch = str.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      var num = numericMatch ? Number(numericMatch[0]) : 0;
      if (!isFinite(num)) num = 0;
      return num;
    } catch (e) {
      log.warn('[ebay-total-cost] makeANumber error for input', str, e);
      return 0;
    }
  }
});


function number_format(number, decimals, dec_point, thousands_sep) {
  // http://kevin.vanzonneveld.net
  // +   original by: Jonas Raoni Soares Silva (http://www.jsfromhell.com)
  // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
  // +     bugfix by: Michael White (http://getsprink.com)
  // +     bugfix by: Benjamin Lupton
  // +     bugfix by: Allan Jensen (http://www.winternet.no)
  // +    revised by: Jonas Raoni Soares Silva (http://www.jsfromhell.com)
  // +     bugfix by: Howard Yeend
  // +    revised by: Luke Smith (http://lucassmith.name)
  // +     bugfix by: Diogo Resende
  // +     bugfix by: Rival
  // +      input by: Kheang Hok Chin (http://www.distantia.ca/)
  // +   improved by: davook
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Jay Klehr
  // +   improved by: Brett Zamir (http://brett-zamir.me)
  // +      input by: Amir Habibi (http://www.residence-mixte.com/)
  // +     bugfix by: Brett Zamir (http://brett-zamir.me)
  // +   improved by: Theriault
  // +   improved by: Drew Noakes
  // *     example 1: number_format(1234.56);
  // *     returns 1: '1,235'
  // *     example 2: number_format(1234.56, 2, ',', ' ');
  // *     returns 2: '1 234,56'
  // *     example 3: number_format(1234.5678, 2, '.', '');
  // *     returns 3: '1234.57'
  // *     example 4: number_format(67, 2, ',', '.');
  // *     returns 4: '67,00'
  // *     example 5: number_format(1000);
  // *     returns 5: '1,000'
  // *     example 6: number_format(67.311, 2);
  // *     returns 6: '67.31'
  // *     example 7: number_format(1000.55, 1);
  // *     returns 7: '1,000.6'
  // *     example 8: number_format(67000, 5, ',', '.');
  // *     returns 8: '67.000,00000'
  // *     example 9: number_format(0.9, 0);
  // *     returns 9: '1'
  // *    example 10: number_format('1.20', 2);
  // *    returns 10: '1.20'
  // *    example 11: number_format('1.20', 4);
  // *    returns 11: '1.2000'
  // *    example 12: number_format('1.2000', 3);
  // *    returns 12: '1.200'
  var n = !isFinite(+number) ? 0 : +number, 
      prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
      sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
      dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
      toFixedFix = function (n, prec) {
          // Fix for IE parseFloat(0.55).toFixed(0) = 0;
          var k = Math.pow(10, prec);
          return Math.round(n * k) / k;
      },
      s = (prec ? toFixedFix(n, prec) : Math.round(n)).toString().split('.');
  if (s[0].length > 3) {
      s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '').length < prec) {
      s[1] = s[1] || '';
      s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}
